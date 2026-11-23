// Dinero en enteros: COP en pesos, USD en centavos (así no hay errores de decimales).

export const CURRENCIES = {
  COP: { decimals: 0, label: 'Pesos (COP)' },
  USD: { decimals: 2, label: 'Dólares (USD)' },
};

export const dec = (cur) => (CURRENCIES[cur] ? CURRENCIES[cur].decimals : 2);

// Acepta "12.500", "12,500", "12.500,50", "1,234.56", "12,5", "$ 1.234"...
// Regla: el último separador es decimal solo si le siguen 1 o 2 dígitos.
export function parseAmount(input, cur, { signed = false } = {}) {
  const raw = String(input ?? '');
  const negative = signed && /^\s*-/.test(raw);
  const s = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  let intDigits;
  let fracDigits = '';
  const m = s.match(/^(.*?)[.,](\d{1,2})$/);
  if (m) {
    intDigits = m[1].replace(/[.,]/g, '');
    fracDigits = m[2];
  } else {
    intDigits = s.replace(/[.,]/g, '');
  }
  const value = Number(`${intDigits || '0'}.${fracDigits || '0'}`);
  if (!Number.isFinite(value)) return null;
  const minor = Math.round(value * 10 ** dec(cur));
  return negative ? -minor : minor;
}

export function formatMoney(minor, cur) {
  const d = dec(cur);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format((minor || 0) / 10 ** d);
}

// Para rellenar un campo de texto al editar.
export function toInput(minor, cur) {
  const d = dec(cur);
  if (minor === null || minor === undefined) return '';
  return d === 0 ? String(minor) : (minor / 10 ** d).toFixed(d);
}
