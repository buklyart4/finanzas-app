// Mezcla registro por registro. Gana la modificación más reciente (updatedAt);
// si empatan, gana el dispositivo con id mayor (desempate estable).
// Los borrados son "lápidas" (deleted: true) para que se propaguen entre dispositivos.

export const keyOf = (r) => `${r.col}/${r.id}`;

function isNewer(a, b) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  return (a.dev || '') > (b.dev || '');
}

export function mergeRecords(localList, remoteList) {
  const local = new Map(localList.map((r) => [keyOf(r), r]));
  const remote = new Map(remoteList.map((r) => [keyOf(r), r]));
  const merged = new Map(local);
  const toLocal = [];
  let needsPush = false;

  for (const [k, r] of remote) {
    const l = local.get(k);
    if (!l || isNewer(r, l)) {
      merged.set(k, r);
      toLocal.push(r);
    }
  }
  for (const [k, l] of local) {
    const r = remote.get(k);
    if (!r || isNewer(l, r)) needsPush = true;
  }
  return { merged: [...merged.values()], toLocal, needsPush };
}
