// Prueba en Node: dos "dispositivos" y un GitHub falso en memoria.
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import assert from 'node:assert/strict';
import { runSync, exportEncrypted, importEncrypted } from './sync.js';
import { createGithub } from './github.js';
import { SyncError } from './errors.js';

function memStore() {
  const recs = new Map();
  const meta = new Map();
  return {
    async getAllRecords() { return [...recs.values()].map((r) => ({ ...r })); },
    async putRecords(l) { for (const r of l) recs.set(`${r.col}/${r.id}`, { ...r }); },
    async getMeta(k) { return meta.get(k); },
    async setMeta(k, v) { meta.set(k, v); },
    async delMeta(k) { meta.delete(k); },
  };
}

const resp = (status, obj) => ({ status, ok: status < 400, json: async () => obj, text: async () => JSON.stringify(obj) });

function fakeGithub() {
  const state = { file: null, n: 0, putCalls: 0, failNextPutWithConflict: false };
  state.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method || 'GET';
    if (u.pathname === '/repos/o/r/contents/datos.enc.json') {
      if (method === 'GET') {
        if (!state.file) return resp(404, { message: 'Not Found' });
        return resp(200, { sha: state.file.sha, encoding: 'base64', content: state.file.content.replace(/(.{60})/g, '$1\n') });
      }
      if (method === 'PUT') {
        state.putCalls++;
        const body = JSON.parse(opts.body);
        if (state.failNextPutWithConflict) { state.failNextPutWithConflict = false; return resp(409, { message: 'sha does not match' }); }
        if (state.file && body.sha !== state.file.sha) return resp(409, { message: 'sha does not match' });
        if (!state.file && body.sha) return resp(422, { message: 'invalid sha' });
        state.file = { sha: 'sha' + ++state.n, content: body.content };
        return resp(200, {});
      }
    }
    if (u.pathname === '/repos/o/r') return resp(200, {});
    return resp(404, { message: 'Not Found' });
  };
  return state;
}

const gh = fakeGithub();
const mk = (dev) => ({
  dev,
  store: memStore(),
  gh: createGithub({ owner: 'o', repo: 'r', token: 't', fetchFn: gh.fetch }),
});
const rec = (dev, id, text, t, extra = {}) => ({ col: 'notas', id, text, updatedAt: t, dev, deleted: false, ...extra });
const pass = (p) => async () => p;
const visible = async (d) => (await d.store.getAllRecords()).filter((r) => !r.deleted).map((r) => r.text).sort();
const sync = (d, p = 'clave-secreta') => runSync({ store: d.store, gh: d.gh, getPassphrase: pass(p), retryDelay: 1 });

let n = 0;
const ok = (name) => console.log(`  ok ${++n}. ${name}`);

const A = mk('devA');
const B = mk('devB');

// 1. A crea datos y sincroniza (vault nuevo)
await A.store.putRecords([rec('devA', '1', 'leche', 100), rec('devA', '2', 'pan', 100)]);
let r = await sync(A);
assert.equal(r.pushed, true);
assert.ok(gh.file);
ok('A crea el archivo remoto');

// 2. El archivo remoto no contiene texto en claro
const raw = Buffer.from(gh.file.content, 'base64').toString('utf8');
assert.ok(!raw.includes('leche') && !raw.includes('pan'));
const parsed = JSON.parse(raw);
assert.ok(parsed.salt && parsed.iv && parsed.data && parsed.iter);
ok('el archivo remoto está cifrado');

// 3. B (dispositivo nuevo) con contraseña incorrecta falla
await assert.rejects(() => sync(B, 'otra'), (e) => e instanceof SyncError && e.code === 'WRONG_KEY');
assert.equal(await B.store.getMeta('syncKey'), undefined);
ok('contraseña incorrecta es rechazada y no se guarda la clave');

// 4. B con la contraseña correcta recibe los datos
r = await sync(B);
assert.deepEqual(await visible(B), ['leche', 'pan']);
assert.equal(r.pushed, false);
ok('B recibe los datos de A');

// 5. Segunda sincronización de B no pide contraseña (clave en caché) ni sube nada
let asked = false;
r = await runSync({ store: B.store, gh: B.gh, getPassphrase: async () => { asked = true; return 'x'; } });
assert.equal(asked, false);
assert.equal(r.pushed, false);
const putsBefore = gh.putCalls;
ok('clave en caché: no pide contraseña y no sube si no hay cambios');

// 6. Cambios en ambos lados: B edita "pan", borra "leche"; A agrega "arroz"
await B.store.putRecords([rec('devB', '2', 'pan integral', 200), rec('devB', '1', 'leche', 200, { deleted: true })]);
await A.store.putRecords([rec('devA', '3', 'arroz', 150)]);
await sync(B);
await sync(A);
await sync(B);
assert.deepEqual(await visible(A), ['arroz', 'pan integral']);
assert.deepEqual(await visible(B), ['arroz', 'pan integral']);
ok('ediciones, borrados y altas convergen en ambos dispositivos');

// 7. Conflicto: la misma nota editada en ambos; gana la más reciente
await A.store.putRecords([rec('devA', '3', 'arroz A', 300)]);
await B.store.putRecords([rec('devB', '3', 'arroz B', 400)]);
await sync(A);
await sync(B);
await sync(A);
assert.deepEqual(await visible(A), await visible(B));
assert.ok((await visible(A)).includes('arroz B'));
ok('conflicto en el mismo registro: gana el más reciente');

// 8. Conflicto de versión en el PUT: reintenta y termina bien
await A.store.putRecords([rec('devA', '4', 'huevos', 500)]);
gh.failNextPutWithConflict = true;
r = await sync(A);
assert.equal(r.pushed, true);
await sync(B);
assert.ok((await visible(B)).includes('huevos'));
ok('un 409 en la subida se reintenta solo');

// 9. Exportar / importar respaldo cifrado
const backup = await exportEncrypted(A.store, 'otra-clave');
assert.ok(!backup.includes('huevos'));
const C = mk('devC');
await assert.rejects(() => importEncrypted(C.store, backup, 'mala'), (e) => e.code === 'WRONG_KEY');
const imported = await importEncrypted(C.store, backup, 'otra-clave');
assert.ok(imported > 0);
assert.deepEqual(await visible(C), await visible(A));
await assert.rejects(() => importEncrypted(C.store, 'no es json', 'x'), (e) => e.code === 'BAD_FILE');
ok('respaldo cifrado: exporta, rechaza clave mala e importa');

// 10. Archivo remoto vacío de cambios: sin subida innecesaria
const before = gh.putCalls;
await sync(A);
await sync(B);
assert.equal(gh.putCalls, before);
ok('sin cambios no se hace ninguna subida');

console.log(`\nTodas las pruebas pasaron (${n}).`);
