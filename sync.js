// Lógica de sincronización: descargar -> descifrar -> mezclar -> cifrar -> subir.
// Es independiente del navegador: recibe un "store" y un cliente "gh" para poder probarla en Node.
import { deriveKey, encryptJson, decryptJson, newSalt, ITERATIONS } from './crypto.js';
import { mergeRecords } from './merge.js';
import { SyncError } from './errors.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function keyForRemote(store, file, getPassphrase) {
  const cached = await store.getMeta('syncKey');
  if (cached && cached.salt === file.salt && cached.iter === file.iter) {
    return { key: cached.key, salt: file.salt, iter: file.iter, fromCache: true };
  }
  const pass = await getPassphrase({ isNew: false });
  const key = await deriveKey(pass, file.salt, file.iter);
  return { key, salt: file.salt, iter: file.iter, fromCache: false };
}

export async function runSync({ store, gh, getPassphrase, now = () => Date.now(), retryDelay = 500 }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await gh.get();
    const local = await store.getAllRecords();
    let k;
    let remoteRecords = [];

    if (remote) {
      const file = JSON.parse(remote.text);
      k = await keyForRemote(store, file, getPassphrase);
      try {
        remoteRecords = (await decryptJson(k.key, file)).records || [];
      } catch (e) {
        if (k.fromCache) await store.delMeta('syncKey');
        throw e;
      }
      if (!k.fromCache) await store.setMeta('syncKey', { key: k.key, salt: k.salt, iter: k.iter });
    } else {
      const cached = await store.getMeta('syncKey');
      if (cached) {
        k = { key: cached.key, salt: cached.salt, iter: cached.iter };
      } else {
        const pass = await getPassphrase({ isNew: true });
        const salt = newSalt();
        k = { key: await deriveKey(pass, salt, ITERATIONS), salt, iter: ITERATIONS };
      }
    }

    const { merged, toLocal, needsPush } = mergeRecords(local, remoteRecords);
    await store.putRecords(toLocal);

    let pushed = false;
    if (!remote || needsPush) {
      const file = await encryptJson(k.key, k.salt, k.iter, { records: merged, savedAt: now() });
      try {
        await gh.put(JSON.stringify(file), remote ? remote.sha : undefined, `sync ${new Date(now()).toISOString()}`);
        pushed = true;
      } catch (e) {
        if (e.code === 'CONFLICT') {
          await sleep(retryDelay * (attempt + 1));
          continue;
        }
        throw e;
      }
      if (!remote) await store.setMeta('syncKey', { key: k.key, salt: k.salt, iter: k.iter });
    }

    await store.setMeta('lastSync', now());
    return { pulled: toLocal.length, pushed, total: merged.length };
  }
  throw new SyncError('CONFLICT', 'No se pudo sincronizar tras varios intentos. Intenta de nuevo.');
}

// Respaldo manual: archivo cifrado con su propia sal; el mismo formato que el remoto.
export async function exportEncrypted(store, passphrase) {
  const salt = newSalt();
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const records = await store.getAllRecords();
  const file = await encryptJson(key, salt, ITERATIONS, { records, savedAt: Date.now() });
  return JSON.stringify(file);
}

export async function importEncrypted(store, text, passphrase) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new SyncError('BAD_FILE', 'El archivo no es un respaldo válido.');
  }
  if (!file || !file.salt || !file.iv || !file.data) throw new SyncError('BAD_FILE', 'El archivo no es un respaldo válido.');
  const key = await deriveKey(passphrase, file.salt, file.iter || ITERATIONS);
  const payload = await decryptJson(key, file);
  const local = await store.getAllRecords();
  const { toLocal } = mergeRecords(local, payload.records || []);
  await store.putRecords(toLocal);
  return toLocal.length;
}
