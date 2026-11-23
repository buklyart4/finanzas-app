import assert from 'node:assert/strict';
import { parseAmount, formatMoney, toInput } from './money.js';
import { accountBalances, filterMovs, monthTotals, netSummary, shiftMonth, todayStr } from './ledger.js';

let n = 0;
const ok = (s) => console.log(`  ok ${++n}. ${s}`);

// --- parseAmount ---
const p = (s, c, o) => parseAmount(s, c, o);
assert.equal(p('12.500', 'COP'), 12500);
assert.equal(p('12,500', 'COP'), 12500);
assert.equal(p('1.234.567', 'COP'), 1234567);
assert.equal(p('$ 5000', 'COP'), 5000);
assert.equal(p('12.500,50', 'COP'), 12501);
assert.equal(p('abc', 'COP'), null);
assert.equal(p('', 'COP'), null);
ok('parseAmount COP: miles con punto o coma, símbolos, vacío');
assert.equal(p('12.50', 'USD'), 1250);
assert.equal(p('12,5', 'USD'), 1250);
assert.equal(p('1,234.56', 'USD'), 123456);
assert.equal(p('1.234,56', 'USD'), 123456);
assert.equal(p('1234', 'USD'), 123400);
assert.equal(p('0,99', 'USD'), 99);
assert.equal(p('1234.56', 'USD'), 123456);
assert.equal(p('-50', 'COP', { signed: true }), -50);
assert.equal(p('-50', 'COP'), 50);
ok('parseAmount USD: ambos formatos decimales y signo opcional');

// --- formatMoney / toInput ---
assert.match(formatMoney(12500, 'COP').replace(/\s/g, ' '), /12\.500/);
assert.match(formatMoney(1250, 'USD').replace(/\s/g, ' '), /12,50/);
assert.equal(toInput(12500, 'COP'), '12500');
assert.equal(toInput(1250, 'USD'), '12.50');
ok('formato y campo de edición');

// --- saldos ---
const accounts = [
  { id: 'nequi', name: 'Nequi', type: 'billetera', currency: 'COP', openingBalance: 100000 },
  { id: 'cred', name: 'Crédito', type: 'credito', currency: 'COP', openingBalance: -50000 },
  { id: 'hapi', name: 'Hapi', type: 'inversion', currency: 'USD', openingBalance: 10000 },
  { id: 'old', name: 'Vieja', type: 'debito', currency: 'COP', openingBalance: 5, archived: true },
];
const movs = [
  { id: '1', kind: 'gasto', date: '2026-11-03', accountId: 'nequi', amount: 20000, createdAt: 1 },
  { id: '2', kind: 'ingreso', date: '2026-11-05', accountId: 'nequi', amount: 500000, createdAt: 2 },
  { id: '3', kind: 'gasto', date: '2026-11-06', accountId: 'cred', amount: 30000, createdAt: 3 },
  { id: '4', kind: 'transferencia', date: '2026-11-07', accountId: 'nequi', toAccountId: 'cred', amount: 40000, toAmount: 40000, createdAt: 4 },
  { id: '5', kind: 'transferencia', date: '2026-11-08', accountId: 'nequi', toAccountId: 'hapi', amount: 400000, toAmount: 10000, createdAt: 5 },
  { id: '6', kind: 'gasto', date: '2026-10-30', accountId: 'nequi', amount: 999, createdAt: 6 },
  { id: '7', kind: 'gasto', date: '2026-11-09', accountId: 'cuenta-borrada', amount: 777, createdAt: 7 },
];
const bal = accountBalances(accounts, movs);
assert.equal(bal.get('nequi'), 100000 - 20000 + 500000 - 40000 - 400000 - 999);
assert.equal(bal.get('cred'), -50000 - 30000 + 40000);
assert.equal(bal.get('hapi'), 10000 + 10000);
assert.equal(bal.get('old'), 5);
ok('saldos: gastos, ingresos, pagos de tarjeta y transferencia COP→USD; ignora cuentas inexistentes');

// --- totales del mes ---
const byId = new Map(accounts.map((a) => [a.id, a]));
const t = monthTotals(movs, byId, '2026-11');
assert.deepEqual(t, { COP: { ingresos: 500000, gastos: 50000 } });
assert.deepEqual(monthTotals(movs, byId, '2026-11', 'cred'), { COP: { ingresos: 0, gastos: 30000 } });
ok('totales del mes excluyen transferencias y respetan el filtro de cuenta');

// --- filtros ---
const f = filterMovs(movs, { month: '2026-11', accountId: 'cred' });
assert.deepEqual(f.map((m) => m.id), ['4', '3']);
const all = filterMovs(movs, { month: '2026-11' });
assert.equal(all[0].id, '7');
assert.equal(all.length, 6);
ok('filtro por mes y cuenta (incluye transferencias de entrada) y orden por fecha');

// --- resumen ---
const ns = netSummary(accounts, bal);
assert.equal(ns.COP.cards, -40000);
assert.equal(ns.COP.assets, bal.get('nequi'));
assert.equal(ns.COP.net, bal.get('nequi') - 40000);
assert.equal(ns.USD.assets, 20000);
ok('resumen por moneda: disponible, tarjetas y neto (sin archivadas)');

// --- fechas ---
assert.equal(shiftMonth('2026-01', -1), '2025-12');
assert.equal(shiftMonth('2026-12', 1), '2027-01');
assert.equal(todayStr(new Date(2026, 10, 5)), '2026-11-05');
ok('navegación de meses y fecha local');

// --- deudas ---
import { debtFlows, debtRemaining, debtIsDone, debtTotals, addDays } from './ledger.js';
const debts = [
  { id: 'd1', dir: 'me-deben', person: 'Juan', currency: 'COP', amount: 100000, date: '2026-11-10', accountId: 'nequi', createdAt: 10 },
  { id: 'd2', dir: 'debo', person: 'Banco', currency: 'COP', amount: 500000, date: '2026-11-11', accountId: 'nequi', createdAt: 11 },
  { id: 'd3', dir: 'me-deben', person: 'Ana', currency: 'USD', amount: 5000, date: '2026-11-12', accountId: '', createdAt: 12 },
  { id: 'd4', dir: 'me-deben', person: 'Pedro', currency: 'COP', amount: 80000, date: '2026-11-01', accountId: '', closed: true, createdAt: 13 },
  { id: 'd5', dir: 'me-deben', person: 'Luis', currency: 'COP', amount: 20000, date: '2026-11-02', accountId: '', createdAt: 14 },
];
const abonos = [
  { id: 'a1', debtId: 'd1', amount: 30000, date: '2026-11-15', accountId: 'nequi', createdAt: 20 },
  { id: 'a2', debtId: 'd2', amount: 100000, date: '2026-11-16', accountId: 'nequi', createdAt: 21 },
  { id: 'a3', debtId: 'd5', amount: 20000, date: '2026-11-17', accountId: '', createdAt: 22 },
  { id: 'a4', debtId: 'no-existe', amount: 999, date: '2026-11-17', accountId: 'nequi', createdAt: 23 },
];
assert.equal(debtRemaining(debts[0], abonos), 70000);
assert.equal(debtRemaining(debts[4], abonos), 0);
assert.equal(debtIsDone(debts[3], abonos), true); // cerrada a mano
assert.equal(debtIsDone(debts[4], abonos), true); // pagada del todo
assert.equal(debtIsDone(debts[0], abonos), false);
ok('deuda pendiente, saldada por abonos o cerrada a mano');

const flows = debtFlows(debts, abonos);
assert.equal(flows.length, 4); // d1, d2, a1, a2 (a3 sin cuenta, a4 huérfano, d3/d4/d5 sin cuenta)
const bal2 = accountBalances(accounts, movs, flows);
assert.equal(bal2.get('nequi'), bal.get('nequi') - 100000 + 500000 + 30000 - 100000);
assert.equal(bal2.get('cred'), bal.get('cred'));
ok('préstamo hecho/recibido y abonos mueven el saldo de la cuenta; huérfanos y sin cuenta no');

const dt = debtTotals(debts, abonos);
assert.deepEqual(dt, { COP: { toMe: 70000, iOwe: 400000 }, USD: { toMe: 5000, iOwe: 0 } });
ok('totales pendientes por moneda excluyen saldadas y cerradas');

const ns2 = netSummary(accounts, bal2, dt);
assert.equal(ns2.COP.toMe, 70000);
assert.equal(ns2.COP.iOwe, 400000);
assert.equal(ns2.COP.net, bal2.get('nequi') - 40000 + 70000 - 400000);
assert.equal(ns2.USD.toMe, 5000);
assert.equal(ns2.USD.net, 20000 + 5000);
assert.equal(netSummary(accounts, bal).COP.toMe, 0);
ok('neto incluye lo que te deben y lo que debes');

assert.equal(addDays('2026-11-28', 5), '2026-12-03');
assert.equal(addDays('2026-12-30', 3), '2027-01-02');
ok('suma de días');


// --- tarjetas: corte y pago ---
import { cardCycle, nextDayOnOrAfter, prevDayBefore } from './ledger.js';
assert.equal(nextDayOnOrAfter('2026-11-22', 14), '2026-12-14');
assert.equal(nextDayOnOrAfter('2026-11-10', 14), '2026-11-14');
assert.equal(nextDayOnOrAfter('2026-11-14', 14), '2026-11-14');
assert.equal(nextDayOnOrAfter('2027-02-10', 31), '2027-02-28');
assert.equal(prevDayBefore('2026-12-14', 24), '2026-11-24');
assert.equal(prevDayBefore('2026-01-14', 24), '2025-12-24');
assert.equal(prevDayBefore('2026-11-20', 5), '2026-11-05');
ok('fechas de corte y pago: siguiente/anterior, fin de año y meses cortos');

const card = { id: 'nu', type: 'credito', currency: 'COP', openingBalance: -50000, cutDay: 24, payDay: 14 };
const cmovs = [
  { id: 'c1', kind: 'transferencia', date: '2026-11-05', accountId: 'nequi', toAccountId: 'nu', amount: 20000, toAmount: 20000 },
  { id: 'c2', kind: 'gasto', date: '2026-11-10', accountId: 'nu', amount: 30000 },
];
// Antes del pago del 14: el corte (24 oct) ya pasó -> extracto fijo
let cy = cardCycle(card, cmovs, [], '2026-11-10');
assert.equal(cy.due, '2026-11-14');
assert.equal(cy.cut, '2026-10-24');
assert.equal(cy.cutPassed, true);
assert.equal(cy.toPay, 30000); // deuda al corte 50.000 - 20.000 abonados; la compra del 10 va al siguiente
assert.equal(cy.newCharges, 30000);
assert.equal(cy.nextCut, '2026-11-24');
// Después del pago del 14 y antes del corte del 24: estimado del siguiente
cy = cardCycle(card, cmovs, [], '2026-11-22');
assert.equal(cy.due, '2026-12-14');
assert.equal(cy.cut, '2026-11-24');
assert.equal(cy.cutPassed, false);
assert.equal(cy.estimate, true);
assert.equal(cy.toPay, 60000); // -50.000 + 20.000 - 30.000 = -60.000
// El día del corte ya cuenta como extracto cerrado
cy = cardCycle(card, cmovs, [], '2026-11-24');
assert.equal(cy.cutPassed, true);
assert.equal(cy.toPay, 60000);
// Sin días configurados -> sin ciclo
assert.equal(cardCycle({ ...card, cutDay: null }, cmovs, [], '2026-11-10'), null);
// Pagó de más: no hay nada por pagar
const cmovs2 = [...cmovs, { id: 'c3', kind: 'transferencia', date: '2026-11-12', accountId: 'nequi', toAccountId: 'nu', amount: 90000, toAmount: 90000 }];
assert.equal(cardCycle(card, cmovs2, [], '2026-11-13').toPay, 0);
ok('ciclo de tarjeta: extracto fijo tras el corte, estimado antes, pagos posteriores y sin configurar');


// --- reportes ---
import { categoryTotals, lastMonths, monthEnd, monthSeries, earliestDate, netWorthAt, budgetState, niceTicks } from './ledger.js';
const rmovs = [
  { id: 'r1', kind: 'gasto', date: '2026-11-03', accountId: 'nequi', amount: 60000, categoryId: 'comida', createdAt: 1 },
  { id: 'r2', kind: 'gasto', date: '2026-11-04', accountId: 'nequi', amount: 15000, categoryId: 'comida', createdAt: 2 },
  { id: 'r3', kind: 'gasto', date: '2026-11-05', accountId: 'nequi', amount: 20000, categoryId: '', createdAt: 3 },
  { id: 'r4', kind: 'gasto', date: '2026-10-15', accountId: 'nequi', amount: 30000, categoryId: 'comida', createdAt: 4 },
  { id: 'r5', kind: 'gasto', date: '2026-11-06', accountId: 'hapi', amount: 500, categoryId: 'ocio', createdAt: 5 },
  { id: 'r6', kind: 'ingreso', date: '2026-11-07', accountId: 'nequi', amount: 300000, categoryId: 'sueldo', createdAt: 6 },
];
const ct = categoryTotals(rmovs, byId, '2026-11', 'COP');
assert.equal(ct.get('comida'), 75000);
assert.equal(ct.get(''), 20000);
assert.equal(ct.has('ocio'), false); // esa es en USD
assert.equal(categoryTotals(rmovs, byId, '2026-11', 'USD').get('ocio'), 500);
assert.equal(categoryTotals(rmovs, byId, '2026-11', 'COP', 'ingreso').get('sueldo'), 300000);
ok('totales por categoría: filtra por mes, moneda y tipo; "" = sin categoría');

assert.deepEqual(lastMonths('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
assert.equal(monthEnd('2026-02'), '2026-02-28');
assert.equal(monthEnd('2026-11'), '2026-11-30');
const ser = monthSeries(rmovs, byId, ['2026-10', '2026-11'], 'COP');
assert.deepEqual(ser, [
  { month: '2026-10', ingresos: 0, gastos: 30000 },
  { month: '2026-11', ingresos: 300000, gastos: 95000 },
]);
ok('serie mensual de ingresos y gastos y fin de mes');

assert.equal(earliestDate([], rmovs, [], []), '2026-10-15');
assert.equal(earliestDate([], [], [], []), null);
ok('fecha más antigua con datos');

// Patrimonio en el tiempo: cuenta con saldo inicial 100.000, un gasto el 10/oct y un ingreso el 5/nov.
const nwAcc = [{ id: 'x', type: 'debito', currency: 'COP', openingBalance: 100000, createdAt: new Date(2026, 9, 1).getTime() }];
const nwMovs = [
  { id: 'n1', kind: 'gasto', date: '2026-10-10', accountId: 'x', amount: 30000 },
  { id: 'n2', kind: 'ingreso', date: '2026-11-05', accountId: 'x', amount: 50000 },
];
const nwDebts = [{ id: 'dd', dir: 'me-deben', person: 'Z', currency: 'COP', amount: 40000, date: '2026-10-20', accountId: '', closed: false }];
const nwAbonos = [{ id: 'aa', debtId: 'dd', amount: 10000, date: '2026-11-02', accountId: '' }];
assert.deepEqual(netWorthAt(nwAcc, nwMovs, [], nwDebts, nwAbonos, '2026-09-30'), {}); // antes de existir
assert.deepEqual(netWorthAt(nwAcc, nwMovs, [], nwDebts, nwAbonos, '2026-10-15'), { COP: 70000 });
assert.deepEqual(netWorthAt(nwAcc, nwMovs, [], nwDebts, nwAbonos, '2026-10-31'), { COP: 70000 + 40000 });
assert.deepEqual(netWorthAt(nwAcc, nwMovs, [], nwDebts, nwAbonos, '2026-11-30'), { COP: 120000 + 30000 });
// deuda cerrada a mano desde una fecha: deja de contar desde ese día
const closedDebts = [{ ...nwDebts[0], closed: true, closedAt: '2026-11-03' }];
assert.deepEqual(netWorthAt(nwAcc, nwMovs, [], closedDebts, nwAbonos, '2026-11-02'), { COP: 70000 + 40000 - 10000 });
assert.deepEqual(netWorthAt(nwAcc, nwMovs, [], closedDebts, nwAbonos, '2026-11-30'), { COP: 120000 });
ok('patrimonio en el tiempo: cuentas desde que existen, deudas con abonos y cierre a mano');

// Coincide con el resumen de hoy
const todayAll = netWorthAt(accounts, movs, flows, debts, abonos, '2099-01-01');
const nsAll = netSummary(accounts, accountBalances(accounts, movs, flows), debtTotals(debts, abonos));
assert.equal(todayAll.COP, nsAll.COP.net);
assert.equal(todayAll.USD, nsAll.USD.net);
ok('el patrimonio de hoy coincide con el neto del Resumen');

assert.equal(budgetState(40000, 100000).state, 'ok');
assert.equal(budgetState(80000, 100000).state, 'warn');
assert.equal(budgetState(100000, 100000).state, 'warn');
assert.equal(budgetState(110000, 100000).state, 'over');
assert.equal(budgetState(110000, 100000).left, -10000);
assert.equal(budgetState(5, 0), null);
ok('estado del presupuesto: ok, cerca y excedido');

assert.deepEqual(niceTicks(0, 95000, 4), [0, 50000, 100000]);
assert.deepEqual(niceTicks(0, 300000, 4), [0, 100000, 200000, 300000]);
assert.deepEqual(niceTicks(-50, 120, 4), [-50, 0, 50, 100, 150]);
assert.deepEqual(niceTicks(0, 0, 4), [0, 1]);
ok('marcas redondas para los ejes');


// --- puntos del patrimonio ---
import { netWorthPoints } from './ledger.js';
const pa = [{ id: 'p', type: 'debito', currency: 'COP', openingBalance: 100000, createdAt: new Date(2026, 8, 10).getTime() }];
const pm = [{ id: 'q1', kind: 'ingreso', date: '2026-10-05', accountId: 'p', amount: 50000 }];
let pts = netWorthPoints(pa, pm, [], [], [], 'COP', '2026-11-22', 6);
assert.deepEqual(pts.map((x) => x.date), ['2026-09-10', '2026-09-30', '2026-10-31', '2026-11-22']);
assert.deepEqual(pts.map((x) => x.value), [100000, 100000, 150000, 150000]);
// historial de un solo día: un punto (el caller muestra el aviso)
pts = netWorthPoints(pa, [], [], [], [], 'COP', '2026-09-10', 6);
assert.equal(pts.length, 1);
// moneda sin cuentas: sin puntos
assert.deepEqual(netWorthPoints(pa, pm, [], [], [], 'USD', '2026-11-22', 6), []);
// historial largo: solo los últimos 6 meses (5 fines de mes + hoy)
const oldAcc = [{ ...pa[0], createdAt: new Date(2025, 0, 1).getTime() }];
pts = netWorthPoints(oldAcc, [], [], [], [], 'COP', '2026-11-22', 6);
assert.equal(pts.length, 6);
assert.equal(pts[0].date, '2026-06-30');
assert.equal(pts[5].date, '2026-11-22');
ok('puntos del patrimonio: primer dato, fines de mes, hoy y límite de 6 meses');


// --- ahorro (cajita) ---
import { savingsMonth, savingsYear, goalTargets, yearNeeded } from './ledger.js';
const smovs = [
  { id: 's1', kind: 'transferencia', date: '2026-11-02', accountId: 'nequi', toAccountId: 'caj', amount: 200000, toAmount: 200000 },
  { id: 's2', kind: 'transferencia', date: '2026-11-20', accountId: 'nequi', toAccountId: 'caj', amount: 100000, toAmount: 100000 },
  { id: 's3', kind: 'transferencia', date: '2026-11-25', accountId: 'caj', toAccountId: 'nequi', amount: 50000, toAmount: 50000 },
  { id: 's4', kind: 'ingreso', date: '2026-11-30', accountId: 'caj', amount: 1500 },
  { id: 's5', kind: 'gasto', date: '2026-10-05', accountId: 'caj', amount: 20000 },
  { id: 's6', kind: 'transferencia', date: '2026-10-06', accountId: 'nequi', toAccountId: 'caj', amount: 400000, toAmount: 400000 },
  { id: 's7', kind: 'transferencia', date: '2026-11-08', accountId: 'nequi', toAccountId: 'otra', amount: 999, toAmount: 999 },
];
assert.deepEqual(savingsMonth('caj', smovs, '2026-11'), { aportes: 250000, rendimientos: 1500 });
assert.deepEqual(savingsMonth('caj', smovs, '2026-10'), { aportes: 380000, rendimientos: 0 });
assert.deepEqual(savingsMonth('caj', smovs, '2026-09'), { aportes: 0, rendimientos: 0 });
ok('aportes netos: entran transferencias, salen retiros y gastos; rendimientos aparte');
// transferencia desde otra moneda: cuenta lo que recibe la cajita
assert.equal(savingsMonth('caj', [{ kind: 'transferencia', date: '2026-11-03', accountId: 'hapi', toAccountId: 'caj', amount: 10000, toAmount: 400000 }], '2026-11').aportes, 400000);
ok('aporte desde otra moneda cuenta el monto recibido');
const sy = savingsYear('caj', smovs, 2026);
assert.equal(sy.length, 12);
assert.equal(sy[0].month, '2026-01');
assert.equal(sy[10].aportes, 250000);
assert.equal(sy.reduce((a, x) => a + x.aportes, 0), 630000);
ok('año completo: 12 meses y total del año');
assert.deepEqual(goalTargets({ monthly: 300000, annual: 0 }), { monthly: 300000, annual: 3600000 });
assert.deepEqual(goalTargets({ monthly: 0, annual: 2400000 }), { monthly: 200000, annual: 2400000 });
assert.deepEqual(goalTargets({ monthly: 300000, annual: 4000000 }), { monthly: 300000, annual: 4000000 });
ok('metas efectivas: se deduce la que falta');
// En noviembre con 300.000 ahorrados de 3.600.000: faltan 3.300.000 en noviembre y diciembre
assert.deepEqual(yearNeeded(3600000, 300000, '2026-11-22', false), { left: 2, missing: 3300000, perMonth: 1650000 });
// Si noviembre ya cumplió su meta, solo queda diciembre
assert.deepEqual(yearNeeded(3600000, 300000, '2026-11-22', true), { left: 1, missing: 3300000, perMonth: 3300000 });
// A inicio de año con el mes pendiente: 12 meses
assert.deepEqual(yearNeeded(1200000, 0, '2026-01-05', false), { left: 12, missing: 1200000, perMonth: 100000 });
// Redondea hacia arriba y no baja de cero
assert.equal(yearNeeded(1000, 0, '2026-10-01', false).perMonth, 334); // 3 meses: 1000/3 = 333,3 → 334
assert.equal(yearNeeded(1000, 0, '2026-09-01', false).perMonth, 250); // 4 meses
assert.equal(yearNeeded(1000, 5000, '2026-06-01', false).perMonth, 0);
// Diciembre ya cumplido: sin meses restantes, lo que falta queda tal cual
assert.deepEqual(yearNeeded(1200000, 1000000, '2026-12-20', true), { left: 0, missing: 200000, perMonth: 200000 });
ok('cuánto ahorrar al mes hasta diciembre para llegar a la meta anual');

console.log(`\nTodas las pruebas pasaron (${n}).`);
