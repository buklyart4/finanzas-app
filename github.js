// Cliente mínimo de la API de contenidos de GitHub para leer/escribir UN archivo cifrado.
import { SyncError } from './errors.js';
import { utf8ToB64, b64ToUtf8 } from './crypto.js';

export function createGithub({ owner, repo, branch = 'main', path = 'datos.enc.json', token, fetchFn }) {
  const f = fetchFn || ((...a) => fetch(...a));
  const api = 'https://api.github.com';
  const base = `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function ensureOk(res) {
    if (res.ok) return;
    if (res.status === 401) throw new SyncError('BAD_TOKEN', 'Token inválido o vencido.');
    if (res.status === 403) throw new SyncError('FORBIDDEN', 'GitHub rechazó la petición (permisos del token o límite de uso).');
    throw new SyncError('HTTP', `Error de GitHub (${res.status}).`);
  }

  async function checkRepo() {
    const r = await f(`${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers, cache: 'no-store' });
    if (r.status === 404) {
      throw new SyncError('REPO_NOT_FOUND', 'No encuentro el repositorio. Revisa usuario y nombre, y que el token tenga acceso a él.');
    }
    await ensureOk(r);
  }

  return {
    // Devuelve { sha, text } o null si el archivo todavía no existe.
    async get() {
      const url = `${base}?ref=${encodeURIComponent(branch)}&_=${Date.now()}`;
      const res = await f(url, { headers, cache: 'no-store' });
      if (res.status === 404) {
        await checkRepo();
        return null;
      }
      await ensureOk(res);
      const j = await res.json();
      let text;
      if (j.encoding === 'base64' && j.content) {
        text = b64ToUtf8(j.content);
      } else {
        // Archivos > 1 MB: GitHub no incluye el contenido en el JSON.
        const raw = await f(url, { headers: { ...headers, Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
        await ensureOk(raw);
        text = await raw.text();
      }
      return { sha: j.sha, text };
    },

    async put(text, sha, message) {
      const body = { message, content: utf8ToB64(text), branch };
      if (sha) body.sha = sha;
      const res = await f(base, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 409) throw new SyncError('CONFLICT', 'Conflicto de versión.');
      if (res.status === 422) {
        let msg = '';
        try { msg = (await res.json()).message || ''; } catch {}
        if (/sha|match/i.test(msg)) throw new SyncError('CONFLICT', 'Conflicto de versión.');
        throw new SyncError('HTTP', `GitHub no aceptó el archivo: ${msg || '422'}. ¿Existe la rama "${branch}"?`);
      }
      if (res.status === 404) {
        throw new SyncError('REPO_NOT_FOUND', 'No pude escribir en el repositorio. Revisa que el token tenga permiso "Contents: Read and write".');
      }
      await ensureOk(res);
    },
  };
}
