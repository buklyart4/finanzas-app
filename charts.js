// Gráficos propios en SVG/HTML, sin librerías. Colores y tipografía salen de variables CSS
// (--s1, --s2, --grid, --axis, --card, --text, --muted) para que sigan el tema claro/oscuro.
// Los nombres que vienen de los datos siempre se insertan con textContent.
import { formatMoney, dec } from './money.js';
import { niceTicks } from './ledger.js';

const NS = 'http://www.w3.org/2000/svg';

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.setAttribute('style', v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

function s(tag, attrs, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid) e.append(kid);
  return e;
}

// $ 1,2 M · $ 350 mil · US$ 12 …  (el signo va delante del símbolo)
export function compactMoney(minor, cur) {
  const v = (minor || 0) / 10 ** dec(cur);
  const a = Math.abs(v);
  const fmt = (x) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(x);
  const n = a >= 1e6 ? `${fmt(a / 1e6)} M` : a >= 1e3 ? `${fmt(a / 1e3)} mil` : fmt(a);
  return `${v < 0 ? '−' : ''}${cur === 'USD' ? 'US$ ' : '$ '}${n}`;
}

// ---------- Tooltip (uno solo para toda la app) ----------
let tipEl = null;
function tip() {
  if (!tipEl) {
    tipEl = el('div', { class: 'tip', role: 'status' });
    tipEl.hidden = true;
    document.body.append(tipEl);
  }
  return tipEl;
}

export function hideTip() {
  if (tipEl) tipEl.hidden = true;
}

// rows: [{ color?, label, value }]  · el valor va primero y en negrita; el nombre, secundario.
export function showTip(clientX, clientY, title, rows) {
  const t = tip();
  t.replaceChildren(
    title && el('div', { class: 't-title', text: title }),
    ...rows.map((r) => el('div', { class: 't-row' },
      r.color && el('span', { class: 'key', style: `background:${r.color}` }),
      el('strong', { text: r.value }),
      el('span', { class: 't-label', text: r.label }))));
  t.hidden = false;
  const w = t.offsetWidth;
  const hgt = t.offsetHeight;
  let x = clientX + 14;
  let y = clientY - hgt - 10;
  if (x + w > window.innerWidth - 8) x = clientX - w - 14;
  if (x < 8) x = 8;
  if (y < 8) y = clientY + 18;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

document.addEventListener('pointerdown', (e) => {
  if (tipEl && !e.target.closest('[data-tip]')) hideTip();
});

// ---------- Tabla equivalente (todo gráfico tiene su tabla) ----------
export function tableView(headers, rows, label = 'Ver como tabla') {
  return el('details', { class: 'tbl-wrap' },
    el('summary', { text: label }),
    el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, headers.map((x, i) => el('th', { scope: 'col', class: i ? 'num' : '', text: x })))),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => el('td', { class: i ? 'num' : '', text: c })))))));
}

// ---------- Barras ordenadas (HTML): una serie, un color ----------
// items: [{ label, value, share (0..1) }]  ·  el valor va en la punta de la barra
export function rankedBars(items, cur, shareLabel = 'del gasto del mes') {
  const max = Math.max(...items.map((i) => i.value), 1);
  const root = el('div', { class: 'rb' });
  for (const it of items) {
    const label = `${it.label}: ${formatMoney(it.value, cur)} (${Math.round(it.share * 100)}%)`;
    const row = el('div', {
      class: 'rb-row', tabindex: '0', 'data-tip': '1', 'aria-label': label,
    },
      el('div', { class: 'rb-head' },
        el('span', { class: 'rb-name', text: it.label }),
        el('span', { class: 'rb-share', text: `${Math.round(it.share * 100)}%` })),
      el('div', { class: 'rb-bar', style: `--p:${(it.value / max).toFixed(4)}` },
        el('div', { class: 'rb-fill' }),
        el('span', { class: 'rb-val', text: formatMoney(it.value, cur) })));
    const show = (ev) => {
      const r = ev.currentTarget.getBoundingClientRect();
      showTip(ev.clientX || r.left + r.width / 2, ev.clientY || r.top, it.label, [
        { label: shareLabel, value: `${Math.round(it.share * 100)}%` },
        { label: 'total', value: formatMoney(it.value, cur) },
      ]);
    };
    row.addEventListener('pointermove', show);
    row.addEventListener('pointerleave', hideTip);
    row.addEventListener('focus', show);
    row.addEventListener('blur', hideTip);
    root.append(row);
  }
  return root;
}

// ---------- Columnas agrupadas (SVG): 2 series por mes ----------
// rows: [{ label, full, values: [a, b] }]  ·  series: [{ name, color }]
export function groupedColumns(width, rows, cur, series) {
  const H = 210;
  const padL = 64;
  const padR = 8;
  const padT = 10;
  const padB = 26;
  const W = Math.max(width, 260);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const max = Math.max(...rows.flatMap((r) => r.values), 1);
  const ticks = niceTicks(0, max, 4);
  const top = ticks[ticks.length - 1] || 1;
  const y = (v) => padT + plotH - (v / top) * plotH;

  const g = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img',
    'aria-label': `Columnas por mes: ${series.map((x) => x.name).join(' y ')}` });
  for (const t of ticks) {
    g.append(s('line', { x1: padL, x2: W - padR, y1: y(t), y2: y(t), stroke: t === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }));
    g.append(s('text', { x: padL - 6, y: y(t) + 4, 'text-anchor': 'end', class: 'ax', text: compactMoney(t, cur) }));
  }
  const groupW = plotW / rows.length;
  const barW = Math.max(4, Math.min(16, (groupW - 12) / 2 - 1));

  rows.forEach((r, i) => {
    const cx = padL + groupW * i + groupW / 2;
    const hover = s('rect', { x: padL + groupW * i, y: padT, width: groupW, height: plotH, class: 'hover-wash', opacity: 0 });
    g.append(hover);
    r.values.forEach((v, k) => {
      if (v <= 0) return;
      const x = k === 0 ? cx - barW - 1 : cx + 1;
      const hh = (v / top) * plotH;
      const rad = Math.min(4, barW / 2, hh);
      // 4px redondeado en la punta, cuadrado en la base
      g.append(s('path', {
        d: `M${x},${padT + plotH} V${y(v) + rad} Q${x},${y(v)} ${x + rad},${y(v)} H${x + barW - rad} Q${x + barW},${y(v)} ${x + barW},${y(v) + rad} V${padT + plotH} Z`,
        fill: series[k].color,
      }));
    });
    g.append(s('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'ax', text: r.label }));

    const ariaLabel = `${r.full}: ${series.map((x, k) => `${x.name} ${formatMoney(r.values[k], cur)}`).join(', ')}`;
    const hit = s('rect', { x: padL + groupW * i, y: padT, width: groupW, height: plotH, fill: 'transparent', tabindex: 0, 'data-tip': '1', 'aria-label': ariaLabel });
    const show = (ev) => {
      hover.setAttribute('opacity', 1);
      const bb = ev.target.getBoundingClientRect();
      showTip(ev.clientX || bb.left + bb.width / 2, ev.clientY || bb.top + 20, r.full,
        series.map((x, k) => ({ color: x.color, label: x.name, value: formatMoney(r.values[k], cur) })));
    };
    const hide = () => { hover.setAttribute('opacity', 0); hideTip(); };
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', show);
    hit.addEventListener('blur', hide);
    g.append(hit);
  });
  return g;
}

// ---------- Línea (SVG): una serie, etiqueta en el último punto ----------
// points: [{ date: 'YYYY-MM-DD', label, full, value }]
export function lineChart(width, points, cur, name, color) {
  const H = 210;
  const padL = 64;
  const padR = 12;
  const padT = 26;
  const padB = 26;
  const W = Math.max(width, 260);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const vals = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals), 4);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const span = hi - lo || 1;
  const toMs = (d) => {
    const [yy, mm, dd] = d.split('-').map(Number);
    return new Date(yy, mm - 1, dd).getTime();
  };
  const t0 = toMs(points[0].date);
  const t1 = toMs(points[points.length - 1].date);
  const x = (p) => padL + (t1 === t0 ? plotW : ((toMs(p.date) - t0) / (t1 - t0)) * plotW);
  const y = (v) => padT + plotH - ((v - lo) / span) * plotH;

  const g = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': `Línea: ${name}` });
  for (const t of ticks) {
    g.append(s('line', { x1: padL, x2: W - padR, y1: y(t), y2: y(t), stroke: t === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }));
    g.append(s('text', { x: padL - 6, y: y(t) + 4, 'text-anchor': 'end', class: 'ax', text: compactMoney(t, cur) }));
  }
  const pts = points.map((p) => [x(p), y(p.value)]);
  const path = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  g.append(s('path', { d: `${path} L${pts[pts.length - 1][0].toFixed(1)},${y(Math.max(lo, Math.min(0, hi)))} L${pts[0][0].toFixed(1)},${y(Math.max(lo, Math.min(0, hi)))} Z`, fill: color, opacity: 0.1 }));
  g.append(s('path', { d: path, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  // etiquetas del eje X: de derecha a izquierda, solo las que no se pisan con la anterior
  const labelGap = 50;
  let lastX = Infinity;
  for (let i = points.length - 1; i >= 0; i--) {
    const px = pts[i][0];
    if (lastX - px < labelGap) continue;
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    g.append(s('text', { x: px, y: H - 8, 'text-anchor': anchor, class: 'ax', text: points[i].label }));
    lastX = px;
  }

  // punto final con anillo del color de la superficie + valor directo
  const [ex, ey] = pts[pts.length - 1];
  g.append(s('circle', { cx: ex, cy: ey, r: 4, fill: color, stroke: 'var(--card)', 'stroke-width': 2 }));
  g.append(s('text', { x: ex, y: ey - 11, 'text-anchor': 'end', class: 'end-label', text: formatMoney(points[points.length - 1].value, cur) }));

  // cruz y punto que siguen al puntero, ajustados al dato más cercano
  const cross = s('line', { y1: padT, y2: padT + plotH, stroke: 'var(--axis)', 'stroke-width': 1, opacity: 0 });
  const dot = s('circle', { r: 5, fill: color, stroke: 'var(--card)', 'stroke-width': 2, opacity: 0 });
  g.append(cross, dot);
  const overlay = s('rect', { x: padL, y: padT, width: plotW, height: plotH, fill: 'transparent', 'data-tip': '1' });
  const move = (ev) => {
    const box = g.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    let best = 0;
    pts.forEach(([qx], i) => { if (Math.abs(qx - px) < Math.abs(pts[best][0] - px)) best = i; });
    cross.setAttribute('x1', pts[best][0]);
    cross.setAttribute('x2', pts[best][0]);
    cross.setAttribute('opacity', 1);
    dot.setAttribute('cx', pts[best][0]);
    dot.setAttribute('cy', pts[best][1]);
    dot.setAttribute('opacity', 1);
    showTip(ev.clientX, ev.clientY, points[best].full, [{ color, label: name, value: formatMoney(points[best].value, cur) }]);
  };
  const leave = () => { cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); hideTip(); };
  overlay.addEventListener('pointermove', move);
  overlay.addEventListener('pointerdown', move);
  overlay.addEventListener('pointerleave', leave);
  g.append(overlay);
  return g;
}

// ---------- Columnas de una serie con línea de meta (SVG) ----------
// rows: [{ label, full, value, extra? }]  ·  target: meta mensual (minor)  ·  los valores pueden ser negativos (retiros)
export function columnsTarget(width, rows, cur, target, name, color) {
  const H = 210;
  const padL = 64;
  const padR = 8;
  const padT = 22;
  const padB = 26;
  const W = Math.max(width, 260);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const vals = rows.map((r) => r.value);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(target, ...vals, 1), 4);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const span = hi - lo || 1;
  const y = (v) => padT + plotH - ((v - lo) / span) * plotH;
  const y0 = y(0);

  const g = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': `${name} por mes, con la meta de ${formatMoney(target, cur)}` });
  for (const t of ticks) {
    g.append(s('line', { x1: padL, x2: W - padR, y1: y(t), y2: y(t), stroke: t === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }));
    g.append(s('text', { x: padL - 6, y: y(t) + 4, 'text-anchor': 'end', class: 'ax', text: compactMoney(t, cur) }));
  }
  const groupW = plotW / rows.length;
  const barW = Math.max(5, Math.min(18, groupW - 6));

  rows.forEach((r, i) => {
    const cx = padL + groupW * i + groupW / 2;
    const hover = s('rect', { x: padL + groupW * i, y: padT, width: groupW, height: plotH, class: 'hover-wash', opacity: 0 });
    g.append(hover);
    if (r.value !== 0) {
      const x = cx - barW / 2;
      const yv = y(r.value);
      const hh = Math.abs(yv - y0);
      const rad = Math.min(4, barW / 2, hh);
      // 4px redondeado en la punta, cuadrado en la base (arriba si es aporte, abajo si es retiro)
      const d = r.value > 0
        ? `M${x},${y0} V${yv + rad} Q${x},${yv} ${x + rad},${yv} H${x + barW - rad} Q${x + barW},${yv} ${x + barW},${yv + rad} V${y0} Z`
        : `M${x},${y0} V${yv - rad} Q${x},${yv} ${x + rad},${yv} H${x + barW - rad} Q${x + barW},${yv} ${x + barW},${yv - rad} V${y0} Z`;
      g.append(s('path', { d, fill: color }));
    }
    g.append(s('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'ax', text: r.label }));

    const rowsTip = [
      { color, label: name, value: formatMoney(r.value, cur) },
      { label: 'Meta del mes', value: formatMoney(target, cur) },
      ...(r.extra ? [{ label: 'Rendimientos', value: formatMoney(r.extra, cur) }] : []),
    ];
    const hit = s('rect', { x: padL + groupW * i, y: padT, width: groupW, height: plotH, fill: 'transparent', tabindex: 0, 'data-tip': '1',
      'aria-label': `${r.full}: ${name} ${formatMoney(r.value, cur)} de ${formatMoney(target, cur)}` });
    const show = (ev) => {
      hover.setAttribute('opacity', 1);
      const bb = ev.target.getBoundingClientRect();
      showTip(ev.clientX || bb.left + bb.width / 2, ev.clientY || bb.top + 20, r.full, rowsTip);
    };
    const hide = () => { hover.setAttribute('opacity', 0); hideTip(); };
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', show);
    hit.addEventListener('blur', hide);
    g.append(hit);
  });

  // línea de meta: hairline sólida en tinta secundaria, con su etiqueta directa
  g.append(s('line', { x1: padL, x2: W - padR, y1: y(target), y2: y(target), stroke: 'var(--muted)', 'stroke-width': 1.5, 'pointer-events': 'none' }));
  g.append(s('text', { x: W - padR, y: y(target) - 5, 'text-anchor': 'end', class: 'end-label', 'pointer-events': 'none', text: `Meta ${compactMoney(target, cur)}` }));
  return g;
}
