// Almacenamiento local en IndexedDB. Todo funciona sin internet.
// records: { col, id, updatedAt, dev, deleted, ...campos }  (una colección por tipo de dato)
// meta: ajustes internos (id del dispositivo, clave derivada, última sincronización)

const wrap = (req) =>
  new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

const done = (t) =>
  new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });

export function openStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('finanzas', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('records', { keyPath: 'k' });
      db.createObjectStore('meta');
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      resolve({
        async getAllRecords() {
          const rows = await wrap(db.transaction('records', 'readonly').objectStore('records').getAll());
          return rows.map(({ k, ...r }) => r);
        },
        async putRecords(list) {
          if (!list.length) return;
          const t = db.transaction('records', 'readwrite');
          const s = t.objectStore('records');
          for (const r of list) s.put({ ...r, k: `${r.col}/${r.id}` });
          await done(t);
        },
        getMeta(key) {
          return wrap(db.transaction('meta', 'readonly').objectStore('meta').get(key));
        },
        async setMeta(key, val) {
          const t = db.transaction('meta', 'readwrite');
          t.objectStore('meta').put(val, key);
          await done(t);
        },
        async delMeta(key) {
          const t = db.transaction('meta', 'readwrite');
          t.objectStore('meta').delete(key);
          await done(t);
        },
      });
    };
  });
}
