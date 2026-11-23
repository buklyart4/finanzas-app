// Inversiones (puro, sin navegador): posiciones, costo promedio, ganancias y flujos a cuentas.
//
// operación: { symbol, kind: 'compra'|'venta'|'dividendo', date, qty, amount, price, fee,
//              currency, accountId, createdAt }
//   · qty: acciones (decimal, hasta 8 decimales; admite fracciones)
//   · amount: total en unidades menores de la moneda (centavos si USD)
//       compra → lo que pagaste (comisión incluida) · venta → lo que recibiste (neto de comisión)
//       dividendo → lo que recibiste
// Método de costo: PROMEDIO. Al vender se retira del costo la parte proporcional.

export const normSymbol = (s) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
export const roundQty = (q) => Math.round(q * 1e8) / 1e8;

// Acepta "0.0153", "0,0153", "1,234.5", "12". Un solo separador se toma como decimal
// (las acciones no se escriben con separador de miles).
export function parseQty(input) {
  const raw = String(input ?? '').trim();
  let s = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (lastSep >= 0) {
    const intPart = s.slice(0, lastSep).replace(/[.,]/g, '');
    const frac = s.slice(lastSep + 1).replace(/[.,]/g, '');
    s = `${intPart || '0'}.${frac || '0'}`;
  }
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return roundQty(v);
}

export function sortOps(ops) {
  return [...ops].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0) || (a.id < b.id ? -1 : 1));
}

// Posiciones por símbolo, recorriendo las operaciones en orden.
// Si alguna venta supera lo que había, se marca `oversold` (y solo se procesa lo disponible).
export function computePositions(ops) {
  const pos = new Map();
  for (const op of sortOps(ops)) {
    let p = pos.get(op.symbol);
    if (!p) {
      p = { symbol: op.symbol, currency: op.currency, qty: 0, cost: 0, realized: 0, dividends: 0, firstDate: op.date, oversold: false, lots: [] };
      pos.set(op.symbol, p);
    }
    if (op.kind === 'compra') {
      p.qty = roundQty(p.qty + op.qty);
      p.cost += op.amount;
      // Lote en pesos (solo USD): lo pagado × TRM del día de la compra. Sin TRM → null.
      p.lots.push({ date: op.date, usd: op.amount, cop: op.currency === 'USD' && op.fx > 0 ? (op.amount / 100) * op.fx : null, opId: op.id });
    } else if (op.kind === 'venta') {
      const q = Math.min(op.qty, p.qty);
      if (op.qty > p.qty + 1e-9) p.oversold = true;
      if (q <= 0) continue;
      const proceeds = Math.round((op.amount * q) / op.qty);
      const removed = q >= p.qty - 1e-9 ? p.cost : Math.round((p.cost * q) / p.qty);
      p.realized += proceeds - removed;
      const keep = p.cost > 0 ? 1 - removed / p.cost : 0;
      for (const l of p.lots) { l.usd *= keep; if (l.cop !== null) l.cop *= keep; }
      p.qty = roundQty(p.qty - q);
      p.cost -= removed;
      if (p.qty <= 0) { p.qty = 0; p.cost = 0; p.lots = []; }
    } else if (op.kind === 'dividendo') {
      p.dividends += op.amount;
    }
  }
  return pos;
}

// Devuelve el símbolo con ventas sin respaldo (o null si todo cuadra).
export function firstOversold(ops) {
  for (const p of computePositions(ops).values()) if (p.oversold) return p.symbol;
  return null;
}

// Costo de lo que tienes invertido en `date`, por moneda (para el patrimonio histórico).
export function holdingsCostAt(ops, date) {
  const out = {};
  for (const p of computePositions(ops.filter((o) => o.date <= date)).values()) {
    if (p.qty > 0) out[p.currency] = (out[p.currency] || 0) + p.cost;
  }
  return out;
}

// prices: Map símbolo → { price } con price = unidades menores por acción (puede traer decimales).
// Sin precio, la posición se valora a costo (hasPrice = false).
const dayNum = (d) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd) / 864e5; };
export const daysBetween = (a, b) => Math.max(0, dayNum(b) - dayNum(a));

// En pesos (solo posiciones USD con TRM de cada compra y dólar de hoy):
//   costCop  = lo pagado en pesos al dólar de cada compra
//   adj      = ese costo ajustado por inflación hasta hoy (tasa anual compuesta por días)
//   gain     = valor hoy en pesos − costCop · real = valor hoy en pesos − adj
export function copView(lots, valueUsd, ctx) {
  if (!(ctx && ctx.fxNow > 0)) return null;
  if (lots.some((l) => l.cop === null)) return { missing: lots.filter((l) => l.cop === null).length };
  const costCop = lots.reduce((a, l) => a + l.cop, 0);
  const usd = lots.reduce((a, l) => a + l.usd, 0);
  const valueCop = (valueUsd / 100) * ctx.fxNow;
  const hasInfl = ctx.annual !== null && ctx.annual !== undefined && ctx.today;
  const adj = hasInfl ? lots.reduce((a, l) => a + l.cop * (1 + ctx.annual) ** (daysBetween(l.date, ctx.today) / 365), 0) : null;
  return {
    missing: 0, valueCop, costCop, adj, gain: valueCop - costCop,
    pct: costCop > 0 ? (valueCop - costCop) / costCop : null,
    real: adj === null ? null : valueCop - adj,
    pctReal: adj > 0 ? (valueCop - adj) / adj : null,
    infl: adj === null || costCop <= 0 ? null : adj / costCop - 1,
    fxAvg: usd > 0 ? costCop / (usd / 100) : null,
  };
}

export function valuePositions(positions, prices, ctx = {}) {
  const rows = [];
  const totals = {};
  for (const p of positions.values()) {
    const t = (totals[p.currency] ||= { value: 0, cost: 0, unrealized: 0, realized: 0, dividends: 0, missing: 0 });
    t.realized += p.realized;
    t.dividends += p.dividends;
    if (p.qty <= 0) { rows.push({ ...p, open: false }); continue; }
    const px = prices && prices.get(p.symbol);
    const hasPrice = !!(px && px.price > 0);
    const value = hasPrice ? Math.round(p.qty * px.price) : p.cost;
    const unrealized = value - p.cost;
    t.value += value;
    t.cost += p.cost;
    t.unrealized += unrealized;
    if (!hasPrice) t.missing += 1;
    const cop = p.currency === 'USD' ? copView(p.lots, value, ctx) : null;
    if (cop) {
      if (cop.missing) t.copMissing = (t.copMissing || 0) + cop.missing;
      else {
        const c = (t.cop ||= { valueCop: 0, costCop: 0, adj: 0, hasAdj: true });
        c.valueCop += cop.valueCop; c.costCop += cop.costCop;
        if (cop.adj === null) c.hasAdj = false; else c.adj += cop.adj;
      }
    }
    rows.push({
      ...p, open: true, hasPrice, price: hasPrice ? px.price : null, priceAt: hasPrice ? px.asOf : null,
      avgCost: p.cost / p.qty, value, unrealized, cop, pct: p.cost > 0 ? unrealized / p.cost : null,
    });
  }
  rows.sort((a, b) => (b.open - a.open) || b.value - a.value || a.symbol.localeCompare(b.symbol));
  return { rows, totals };
}

// Movimientos de dinero que las operaciones generan en una cuenta (si eligieron una).
export function invFlows(ops) {
  const out = [];
  for (const o of ops) {
    if (!o.accountId) continue;
    const buy = o.kind === 'compra';
    out.push({
      id: 'i:' + o.id, kind: 'inv', opId: o.id, symbol: o.symbol, date: o.date, accountId: o.accountId,
      effect: buy ? -o.amount : o.amount,
      label: o.kind === 'compra' ? `Compra ${o.symbol}` : o.kind === 'venta' ? `Venta ${o.symbol}` : `Dividendo ${o.symbol}`,
      createdAt: o.createdAt || 0,
    });
  }
  return out;
}
