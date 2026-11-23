// Cálculos puros (sin navegador): saldos, totales del mes, filtros y resumen.
// Los saldos NO se guardan: se calculan = saldo inicial + movimientos.
// Así dos dispositivos nunca se pisan un número.

import { holdingsCostAt } from './invest.js';

export const live = (recs, col) => recs.filter((r) => r.col === col && !r.deleted);

const pad = (n) => String(n).padStart(2, '0');

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const monthOf = (dateStr) => dateStr.slice(0, 7);

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// `flows` son los movimientos de dinero que generan las deudas y sus abonos (ver debtFlows).
export function accountBalances(accounts, movs, flows = []) {
  const bal = new Map(accounts.map((a) => [a.id, a.openingBalance || 0]));
  const add = (id, v) => {
    if (bal.has(id)) bal.set(id, bal.get(id) + v);
  };
  for (const f of flows) add(f.accountId, f.effect);
  for (const m of movs) {
    if (m.kind === 'ingreso') add(m.accountId, m.amount);
    else if (m.kind === 'gasto') add(m.accountId, -m.amount);
    else if (m.kind === 'transferencia') {
      add(m.accountId, -m.amount);
      add(m.toAccountId, m.toAmount ?? m.amount);
    }
  }
  return bal;
}

export function filterMovs(movs, { month, accountId } = {}) {
  return movs
    .filter(
      (m) =>
        (!month || m.date.startsWith(month)) &&
        (!accountId || m.accountId === accountId || m.toAccountId === accountId)
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
}

// Ingresos y gastos del mes por moneda. Las transferencias no cuentan
// (pagar la tarjeta no es un gasto nuevo: el gasto ya se registró al comprar).
export function monthTotals(movs, accById, month, accountId) {
  const out = {};
  for (const m of movs) {
    if (!m.date.startsWith(month) || m.kind === 'transferencia') continue;
    if (accountId && m.accountId !== accountId) continue;
    const a = accById.get(m.accountId);
    if (!a) continue;
    const t = (out[a.currency] ||= { ingresos: 0, gastos: 0 });
    if (m.kind === 'ingreso') t.ingresos += m.amount;
    else if (m.kind === 'gasto') t.gastos += m.amount;
  }
  return out;
}

// Por moneda: disponible (cuentas normales), tarjetas (saldo de crédito, negativo = deuda),
// lo que te deben (toMe), lo que debes en préstamos (iOwe) y el neto de todo.
// `inv`: valor de las inversiones por moneda ({ USD: { value } }); se suma al neto.
export function netSummary(accounts, balances, debtTot = {}, inv = {}) {
  const out = {};
  const slot = (cur) => (out[cur] ||= { assets: 0, cards: 0, toMe: 0, iOwe: 0, net: 0 });
  for (const a of accounts) {
    if (a.archived) continue;
    const t = slot(a.currency);
    const b = balances.get(a.id) || 0;
    if (a.type === 'credito') t.cards += b;
    else t.assets += b;
    t.net += b;
  }
  for (const [cur, d] of Object.entries(debtTot)) {
    const t = slot(cur);
    t.toMe = d.toMe;
    t.iOwe = d.iOwe;
    t.net += d.toMe - d.iOwe;
  }
  for (const [cur, v] of Object.entries(inv)) {
    if (!v.value) continue;
    const t = slot(cur);
    t.inv = v.value;
    t.net += v.value;
  }
  return out;
}

// ---------- Deudas ----------
// deuda: { dir: 'me-deben' | 'debo', person, currency, amount, date, dueDate, accountId, closed }
// abono: { debtId, amount, date, accountId }
// Si la deuda o el abono tienen cuenta, mueven el saldo de esa cuenta:
//   te prestaste/prestaste: sale dinero (−) · te prestaron: entra (+)
//   te pagan un abono: entra (+) · tú pagas un abono: sale (−)
export function debtFlows(debts, abonos) {
  const byId = new Map(debts.map((d) => [d.id, d]));
  const out = [];
  for (const d of debts) {
    if (!d.accountId) continue;
    out.push({
      id: 'd:' + d.id, kind: 'deuda', debtId: d.id, date: d.date, accountId: d.accountId,
      effect: d.dir === 'debo' ? d.amount : -d.amount,
      label: d.dir === 'debo' ? `Préstamo de ${d.person}` : `Préstamo a ${d.person}`,
      createdAt: d.createdAt || 0,
    });
  }
  for (const a of abonos) {
    const d = byId.get(a.debtId);
    if (!d || !a.accountId) continue;
    out.push({
      id: 'a:' + a.id, kind: 'abono', debtId: d.id, date: a.date, accountId: a.accountId,
      effect: d.dir === 'debo' ? -a.amount : a.amount,
      label: d.dir === 'debo' ? `Pago a ${d.person}` : `Abono de ${d.person}`,
      createdAt: a.createdAt || 0,
    });
  }
  return out;
}

export function debtRemaining(debt, abonos) {
  let paid = 0;
  for (const a of abonos) if (a.debtId === debt.id) paid += a.amount;
  return debt.amount - paid;
}

export const debtIsDone = (debt, abonos) => !!debt.closed || debtRemaining(debt, abonos) <= 0;

// Pendiente por moneda: lo que te deben y lo que debes.
export function debtTotals(debts, abonos) {
  const out = {};
  for (const d of debts) {
    if (debtIsDone(d, abonos)) continue;
    const t = (out[d.currency] ||= { toMe: 0, iOwe: 0 });
    const rem = debtRemaining(d, abonos);
    if (d.dir === 'debo') t.iOwe += rem;
    else t.toMe += rem;
  }
  return out;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return todayStr(new Date(y, m - 1, d + n));
}

// ---------- Tarjetas de crédito: corte y pago ----------
// Con el día de corte y el día de pago se calcula cuánto toca pagar y cuándo:
//  - El próximo pago es el próximo "día de pago" desde hoy.
//  - Ese pago corresponde al último corte anterior a esa fecha.
//  - Si ese corte ya ocurrió, se paga la deuda que había al corte menos lo que ya abonaste después.
//    Las compras posteriores al corte van al siguiente extracto.
//  - Si el corte aún no ocurre, es un estimado: lo que debes hasta hoy (puede crecer hasta el corte).
const lastDayOf = (y, m) => new Date(y, m, 0).getDate();
const mkDate = (y, m, day) => `${y}-${pad(m)}-${pad(Math.min(day, lastDayOf(y, m)))}`;
const monthAdd = (y, m, delta) => {
  const d = new Date(y, m - 1 + delta, 1);
  return [d.getFullYear(), d.getMonth() + 1];
};

export function nextDayOnOrAfter(dateStr, day) {
  const [y, m] = dateStr.split('-').map(Number);
  const c = mkDate(y, m, day);
  if (c >= dateStr) return c;
  const [y2, m2] = monthAdd(y, m, 1);
  return mkDate(y2, m2, day);
}

export function prevDayBefore(dateStr, day) {
  const [y, m] = dateStr.split('-').map(Number);
  const c = mkDate(y, m, day);
  if (c < dateStr) return c;
  const [y2, m2] = monthAdd(y, m, -1);
  return mkDate(y2, m2, day);
}

function effectsOn(accId, movs, flows) {
  const out = [];
  for (const m of movs) {
    if (m.kind === 'ingreso' && m.accountId === accId) out.push({ date: m.date, effect: m.amount });
    else if (m.kind === 'gasto' && m.accountId === accId) out.push({ date: m.date, effect: -m.amount });
    else if (m.kind === 'transferencia') {
      if (m.accountId === accId) out.push({ date: m.date, effect: -m.amount });
      if (m.toAccountId === accId) out.push({ date: m.date, effect: m.toAmount ?? m.amount });
    }
  }
  for (const f of flows) if (f.accountId === accId) out.push({ date: f.date, effect: f.effect });
  return out;
}

export function cardCycle(acc, movs, flows, today) {
  const cutDay = Number(acc.cutDay);
  const payDay = Number(acc.payDay);
  if (!(cutDay >= 1 && cutDay <= 31 && payDay >= 1 && payDay <= 31)) return null;
  const due = nextDayOnOrAfter(today, payDay);
  const cut = prevDayBefore(due, cutDay);
  const nextCut = nextDayOnOrAfter(today, cutDay);
  const cutPassed = cut <= today;
  const eff = effectsOn(acc.id, movs, flows);
  const balanceAt = (date) => (acc.openingBalance || 0) + eff.filter((e) => e.date <= date).reduce((s, e) => s + e.effect, 0);

  if (!cutPassed) {
    return { due, cut, nextCut, cutPassed, estimate: true, toPay: Math.max(0, -balanceAt(today)), newCharges: 0 };
  }
  const debtAtCut = Math.max(0, -balanceAt(cut));
  let paid = 0;
  let newCharges = 0;
  for (const e of eff) {
    if (e.date > cut && e.date <= today) {
      if (e.effect > 0) paid += e.effect;
      else newCharges -= e.effect;
    }
  }
  return { due, cut, nextCut, cutPassed, estimate: false, toPay: Math.max(0, debtAtCut - paid), newCharges };
}

// ---------- Reportes ----------
// Gastos (o ingresos) del mes por categoría, en una moneda. La clave '' es "Sin categoría".
export function categoryTotals(movs, accById, month, currency, kind = 'gasto') {
  const out = new Map();
  for (const m of movs) {
    if (m.kind !== kind || !m.date.startsWith(month)) continue;
    const a = accById.get(m.accountId);
    if (!a || a.currency !== currency) continue;
    const k = m.categoryId || '';
    out.set(k, (out.get(k) || 0) + m.amount);
  }
  return out;
}

// Los n meses que terminan en `month`, del más antiguo al más reciente.
export function lastMonths(month, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftMonth(month, -i));
  return out;
}

export function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  return mkDate(y, m, 31);
}

export function monthSeries(movs, accById, months, currency) {
  return months.map((month) => {
    const t = monthTotals(movs, accById, month)[currency] || { ingresos: 0, gastos: 0 };
    return { month, ingresos: t.ingresos, gastos: t.gastos };
  });
}

// Fecha más antigua con datos (para no dibujar meses vacíos antes de que empieces a usar la app).
export function earliestDate(accounts, movs, flows, debts, invOps = []) {
  const dates = [];
  for (const o of invOps) dates.push(o.date);
  for (const m of movs) dates.push(m.date);
  for (const f of flows) dates.push(f.date);
  for (const d of debts) dates.push(d.date);
  for (const a of accounts) if (a.createdAt) dates.push(todayStr(new Date(a.createdAt)));
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
}

// Una cuenta "existe" desde su creación o desde su primer movimiento, lo que ocurra antes
// (su saldo inicial vale desde ese momento).
function accountStartDate(a, movs, flows) {
  const dates = [];
  if (a.createdAt) dates.push(todayStr(new Date(a.createdAt)));
  for (const m of movs) if (m.accountId === a.id || m.toAccountId === a.id) dates.push(m.date);
  for (const f of flows) if (f.accountId === a.id) dates.push(f.date);
  return dates.length ? dates.reduce((x, y) => (x < y ? x : y)) : '0000-00-00';
}

// Patrimonio neto por moneda al final de `date`: cuentas (incluye tarjetas) + te deben − debes.
// invOps: operaciones de inversión; se cuentan a costo (no hay precios históricos).
export function netWorthAt(accounts, movs, flows, debts, abonos, date, invOps = []) {
  const out = {};
  const bal = accountBalances(
    accounts,
    movs.filter((m) => m.date <= date),
    flows.filter((f) => f.date <= date)
  );
  for (const a of accounts) {
    if (a.archived || accountStartDate(a, movs, flows) > date) continue;
    out[a.currency] = (out[a.currency] || 0) + (bal.get(a.id) || 0);
  }
  for (const d of debts) {
    if (d.date > date) continue;
    // Cerrada a mano: desde la fecha en que se cerró; si no hay fecha, se considera cerrada siempre.
    const closedOn = d.closedAt || (d.closed ? '0000-00-00' : null);
    if (closedOn && date >= closedOn) continue;
    let rem = d.amount;
    for (const a of abonos) if (a.debtId === d.id && a.date <= date) rem -= a.amount;
    if (rem <= 0) continue;
    out[d.currency] = (out[d.currency] || 0) + (d.dir === 'debo' ? -rem : rem);
  }
  for (const [cur, cost] of Object.entries(holdingsCostAt(invOps, date))) out[cur] = (out[cur] || 0) + cost;
  return out;
}

// Estado de un presupuesto: ok (< 80%), warn (80–100%), over (> 100%).
export function budgetState(spent, budget) {
  if (!(budget > 0)) return null;
  const pct = spent / budget;
  return { pct, state: pct > 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok', left: budget - spent };
}

// Marcas "bonitas" para un eje: devuelve [min, ..., max] con pasos redondos.
export function niceTicks(min, max, count = 4) {
  if (min === max) {
    if (max === 0) return [0, 1];
    return min > 0 ? niceTicks(0, max, count) : niceTicks(min, 0, count);
  }
  const rough = (max - min) / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const f = rough / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

// Puntos del gráfico de patrimonio: fin de cada mes (hasta `maxMonths`) y hoy.
// Si el historial es corto, el primer punto es el día del primer dato.
export function netWorthPoints(accounts, movs, flows, debts, abonos, currency, today, maxMonths = 6, invOps = []) {
  const first = earliestDate(accounts, movs, flows, debts, invOps);
  if (!first) return [];
  const curMonth = monthOf(today);
  const minMonth = shiftMonth(curMonth, -(maxMonths - 1));
  const startMonth = monthOf(first) < minMonth ? minMonth : monthOf(first);
  const dates = [];
  for (let m = startMonth; m < curMonth; m = shiftMonth(m, 1)) dates.push({ date: monthEnd(m), month: m });
  dates.push({ date: today, month: curMonth, today: true });
  if (monthOf(first) >= minMonth && first < dates[0].date) dates.unshift({ date: first, month: monthOf(first), first: true });
  const pts = [];
  for (const p of dates) {
    const v = netWorthAt(accounts, movs, flows, debts, abonos, p.date, invOps)[currency];
    if (v !== undefined) pts.push({ ...p, value: v });
  }
  return pts;
}

// ---------- Ahorro (cajita) ----------
// Aportes netos de un mes a una cuenta de ahorro:
//   + transferencias que entran (lo que recibe la cuenta)
//   − transferencias que salen y gastos pagados desde la cuenta (retiros)
// Los ingresos registrados en la cuenta son rendimientos (intereses) y se cuentan aparte:
// no son plata que tú aportaste.
export function savingsMonth(accId, movs, month) {
  let aportes = 0;
  let rendimientos = 0;
  for (const m of movs) {
    if (!m.date.startsWith(month)) continue;
    if (m.kind === 'transferencia') {
      if (m.toAccountId === accId) aportes += m.toAmount ?? m.amount;
      if (m.accountId === accId) aportes -= m.amount;
    } else if (m.kind === 'gasto' && m.accountId === accId) aportes -= m.amount;
    else if (m.kind === 'ingreso' && m.accountId === accId) rendimientos += m.amount;
  }
  return { aportes, rendimientos };
}

// Los 12 meses de un año con aportes y rendimientos de cada uno.
export function savingsYear(accId, movs, year) {
  const out = [];
  for (let i = 1; i <= 12; i++) {
    const month = `${year}-${pad(i)}`;
    out.push({ month, ...savingsMonth(accId, movs, month) });
  }
  return out;
}

// Metas efectivas: si solo pones una, la otra se deduce (anual = 12 × mensual; mensual = anual / 12).
export function goalTargets(goal) {
  const monthly = goal.monthly > 0 ? goal.monthly : Math.round((goal.annual || 0) / 12);
  const annual = goal.annual > 0 ? goal.annual : monthly * 12;
  return { monthly, annual };
}

// Cuánto hay que ahorrar por mes, de aquí a diciembre, para llegar a la meta anual.
// Si el mes en curso ya cumplió su meta, no se cuenta como mes restante.
export function yearNeeded(annual, saved, today, currentMonthDone) {
  const m = Number(today.slice(5, 7));
  const left = 12 - m + (currentMonthDone ? 0 : 1);
  const missing = Math.max(0, annual - saved);
  return { left, missing, perMonth: left > 0 ? Math.ceil(missing / left) : missing };
}
