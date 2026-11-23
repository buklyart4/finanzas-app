// Precios de acciones/ETF con Twelve Data (plan gratis: 8 consultas por minuto, 800 al día).
// La clave vive solo en este dispositivo. Si la consulta falla (sin conexión, clave mala,
// el navegador bloquea la petición), la app sigue funcionando con precios escritos a mano.

export const MAX_PER_CALL = 8;

const toMinor = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100 * 1e4) / 1e4 : null; // centavos, con decimales
};

// Interpreta la respuesta de /price. Con un solo símbolo llega {"price":"200.99"};
// con varios, {"VOO":{"price":"200.99"},"VXUS":{...}}; los errores llegan como
// {"code":401,"message":"...","status":"error"} (arriba o por símbolo).
export function parsePrices(json, symbols) {
  const prices = {};
  const errors = {};
  let fatal = null;
  if (!json || typeof json !== 'object') return { prices, errors, fatal: 'Respuesta inesperada del servicio de precios.' };
  const msgOf = (j) => {
    if (j.code === 401 || j.code === 403) return 'La clave de Twelve Data no es válida.';
    if (j.code === 429) return 'Llegaste al límite gratuito de consultas; espera un minuto.';
    return j.message ? String(j.message) : 'Error del servicio de precios.';
  };
  if (json.status === 'error' && !symbols.some((s) => json[s])) return { prices, errors, fatal: msgOf(json) };
  if (symbols.length === 1 && 'price' in json) {
    const p = toMinor(json.price);
    if (p) prices[symbols[0]] = p; else errors[symbols[0]] = 'Sin precio';
    return { prices, errors, fatal };
  }
  for (const s of symbols) {
    const j = json[s];
    if (!j) { errors[s] = 'Sin respuesta'; continue; }
    if (j.status === 'error') { errors[s] = msgOf(j); continue; }
    const p = toMinor(j.price);
    if (p) prices[s] = p; else errors[s] = 'Sin precio';
  }
  return { prices, errors, fatal };
}

// Devuelve { prices, errors, skipped, fatal }. `fetchImpl` se inyecta en las pruebas.
export async function fetchPrices(symbols, apiKey, fetchImpl = fetch) {
  const list = [...new Set(symbols)].filter(Boolean);
  const batch = list.slice(0, MAX_PER_CALL);
  const skipped = list.slice(MAX_PER_CALL);
  if (!batch.length) return { prices: {}, errors: {}, skipped, fatal: null };
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(batch.join(','))}&apikey=${encodeURIComponent(apiKey)}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal });
    let json = null;
    try { json = await res.json(); } catch { /* cuerpo no es JSON */ }
    if (!json) return { prices: {}, errors: {}, skipped, fatal: `El servicio de precios respondió ${res.status}.` };
    return { ...parsePrices(json, batch), skipped };
  } catch (e) {
    const timeout = e && e.name === 'AbortError';
    return {
      prices: {}, errors: {}, skipped, network: true,
      fatal: timeout
        ? 'El servicio de precios tardó demasiado.'
        : 'No se pudo consultar el precio (sin conexión o el navegador bloqueó la consulta). Puedes escribirlo a mano.',
    };
  } finally {
    clearTimeout(timer);
  }
}

// TRM oficial (Superfinanciera, datos abiertos de Colombia): pesos por dólar vigente en `date`
// (fin de semana y festivos usan la del último día hábil). Sin clave. Devuelve { rate } o { error }.
export async function fetchTrm(date, fetchImpl = fetch) {
  const q = new URLSearchParams({
    $where: `vigenciadesde<='${date}T23:59:59.000'`,
    $order: 'vigenciadesde DESC',
    $limit: '1',
  });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetchImpl(`https://www.datos.gov.co/resource/32sa-8pi3.json?${q}`, { signal: ctl.signal });
    const json = await res.json();
    const rate = Array.isArray(json) && json[0] ? Number(json[0].valor) : NaN;
    if (!(rate > 0)) return { error: 'No se encontró la TRM de esa fecha.' };
    return { rate };
  } catch (e) {
    return { error: e && e.name === 'AbortError' ? 'La consulta de la TRM tardó demasiado.' : 'No se pudo consultar la TRM (sin conexión o bloqueada). Escríbela a mano.' };
  } finally {
    clearTimeout(timer);
  }
}
