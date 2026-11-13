/**
 * Minimal SVG chart toolkit — no chart library, no runtime dependencies.
 *
 * Two forms are used in this dashboard:
 *  - renderTimeline: a cumulative burn-up with stacked area layers and a
 *    budget line, a snapping crosshair and a multi-series tooltip.
 *  - renderDivergingBars: department balance around a zero baseline.
 *
 * Mark specs: 2px lines, 8px end markers with a 2px surface ring, 10% area
 * wash, hairline solid grid, 2px surface-colored gap between stacked bands.
 * Tooltip and legend text is inserted with textContent, never HTML strings.
 */

const NS = 'http://www.w3.org/2000/svg';

export function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }
  if (parent) parent.appendChild(node);
  return node;
}

export function svgText(parent, x, y, content, attrs = {}) {
  const node = el('text', { x, y, ...attrs }, parent);
  node.textContent = content;
  return node;
}

/** Axis ticks at friendly steps (1/2/2.5/5 × 10^n). */
export function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0];
  const rawStep = max / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const candidates = [1, 2, 2.5, 5, 10].map((f) => f * magnitude);
  const step = candidates.find((s) => s >= rawStep) ?? candidates[candidates.length - 1];
  const ticks = [];
  for (let v = 0; v <= max + step * 0.0001; v += step) ticks.push(v);
  // Guarantee the top tick is at or above the data maximum.
  while (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function makeTooltip(container) {
  const tip = document.createElement('div');
  tip.className = 'chart-tooltip';
  tip.hidden = true;
  container.appendChild(tip);
  return tip;
}

function placeTooltip(tip, container, clientX) {
  const box = container.getBoundingClientRect();
  const localX = ((clientX - box.left) / box.width) * container.clientWidth;
  tip.hidden = false;
  const width = tip.offsetWidth;
  const left = Math.max(8, Math.min(container.clientWidth - width - 8, localX + 16));
  tip.style.transform = `translate(${left}px, 10px)`;
}

/**
 * Cumulative timeline.
 * options: { width, height, labels, budget: number[], layers: [{key,label,colorVar,values,fill}],
 *            forecastFrom, formatTick, tooltip, caption }
 */
export function renderTimeline(container, options) {
  const {
    width,
    height = 340,
    pad = { top: 24, right: 104, bottom: 40, left: 76 },
    labels,
    budget,
    layers,
    asOfIndex,
    formatTick,
    formatValue,
    ariaLabel,
  } = options;

  container.querySelectorAll('svg, .chart-tooltip').forEach((n) => n.remove());
  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height,
    role: 'img',
    'aria-label': ariaLabel,
    class: 'chart-svg',
  });
  container.appendChild(svg);

  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const n = labels.length;
  const x = (i) => pad.left + (plotW * i) / (n - 1);

  // Stacked layer boundaries. Each layer's values are cumulative upper
  // bounds, so it sits on the previous layer's top rather than being added.
  const cumulative = [];
  let lower = Array(n).fill(0);
  for (const layer of layers) {
    cumulative.push({ layer, lower, upper: layer.values.slice() });
    lower = layer.values.slice();
  }
  const top = layers.length ? layers[layers.length - 1].values : Array(n).fill(0);

  const maxV = Math.max(...top, ...budget, 0);
  const ticks = niceTicks(maxV, 4);
  const domainMax = ticks[ticks.length - 1];
  const y = (v) => pad.top + plotH - (v / (domainMax || 1)) * plotH;

  // Grid + y axis.
  const grid = el('g', {}, svg);
  for (const tick of ticks) {
    el('line', { x1: pad.left, x2: pad.left + plotW, y1: y(tick), y2: y(tick), class: 'grid-line' }, grid);
    svgText(grid, pad.left - 12, y(tick) + 4, formatTick(tick), {
      'text-anchor': 'end',
      class: 'axis-label',
    });
  }
  el('line', {
    x1: pad.left,
    x2: pad.left + plotW,
    y1: y(0),
    y2: y(0),
    class: 'axis-line',
  }, grid);

  // X labels.
  for (let i = 0; i < n; i += 1) {
    svgText(svg, x(i), height - pad.bottom + 22, labels[i], {
      'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
      class: 'axis-label',
    });
  }

  // Stacked area bands, bottom-up.
  const areaGroup = el('g', {}, svg);
  for (const band of cumulative) {
    if (!band.layer.fill) continue;
    let d = `M${x(0)} ${y(band.upper[0])}`;
    for (let i = 1; i < n; i += 1) d += ` L${x(i)} ${y(band.upper[i])}`;
    for (let i = n - 1; i >= 0; i -= 1) d += ` L${x(i)} ${y(band.lower[i])}`;
    d += ' Z';
    el('path', { d, fill: `var(${band.layer.colorVar})`, class: 'area-band' }, areaGroup);
  }
  // 2px surface gap between touching bands: stroke each internal boundary.
  const gapGroup = el('g', {}, svg);
  for (let b = 0; b < cumulative.length - 1; b += 1) {
    const boundary = cumulative[b].upper;
    let d = `M${x(0)} ${y(boundary[0])}`;
    for (let i = 1; i < n; i += 1) d += ` L${x(i)} ${y(boundary[i])}`;
    el('path', {
      d,
      fill: 'none',
      stroke: 'var(--surface-1)',
      'stroke-width': 2,
      'stroke-linejoin': 'round',
    }, gapGroup);
  }

  // As-of divider.
  if (asOfIndex != null && asOfIndex < n - 1) {
    el('line', {
      x1: x(asOfIndex),
      x2: x(asOfIndex),
      y1: pad.top,
      y2: pad.top + plotH,
      class: 'asof-line',
    }, svg);
    svgText(svg, x(asOfIndex) - 6, pad.top - 8, '数据截止', {
      class: 'annotation',
      'text-anchor': 'end',
    });
  }

  // Budget line.
  const lineGroup = el('g', {}, svg);
  let budgetPath = `M${x(0)} ${y(budget[0])}`;
  for (let i = 1; i < n; i += 1) budgetPath += ` L${x(i)} ${y(budget[i])}`;
  el('path', {
    d: budgetPath,
    fill: 'none',
    stroke: 'var(--text-secondary)',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }, lineGroup);

  // End markers (>= 8px with 2px surface ring).
  el('circle', {
    cx: x(n - 1),
    cy: y(budget[n - 1]),
    r: 4.5,
    fill: 'var(--text-secondary)',
    stroke: 'var(--surface-1)',
    'stroke-width': 2,
  }, svg);
  el('circle', {
    cx: x(n - 1),
    cy: y(top[n - 1]),
    r: 4.5,
    fill: 'var(--text-secondary)',
    stroke: 'var(--surface-1)',
    'stroke-width': 2,
  }, svg);

  // Direct labels at the right edge: budget, year-end expected spend and the
  // gap between them. Close values are nudged apart so the text never
  // overlaps, and the balance label only appears when there is room for it.
  const labelX = x(n - 1) + 10;
  const budgetY = y(budget[n - 1]);
  const topY = y(top[n - 1]);
  const closePair = Math.abs(topY - budgetY) < 22;
  const budgetLabelY = budgetY + (closePair ? -8 : 0);
  const topLabelY = topY + (closePair ? 10 : 0);
  svgText(svg, labelX, budgetLabelY + 4, formatValue(budget[n - 1]), { class: 'end-label' });
  svgText(svg, labelX, topLabelY + 4, formatValue(top[n - 1]), { class: 'end-label' });
  const gapPx = Math.abs(topY - budgetY);
  if (gapPx > 46) {
    const mid = (budgetY + topY) / 2;
    svgText(svg, labelX, mid + 4, `余额 ${formatValue(budget[n - 1] - top[n - 1])}`, {
      class: 'end-label end-label--muted',
    });
  }

  // Crosshair + tooltip.
  const cross = el('g', { opacity: '0', class: 'crosshair' }, svg);
  el('line', { y1: pad.top, y2: pad.top + plotH, class: 'crosshair-line' }, cross);
  const dot = el('circle', {
    r: 4,
    fill: 'var(--text-primary)',
    stroke: 'var(--surface-1)',
    'stroke-width': 2,
  }, cross);

  const hit = el('rect', {
    x: pad.left,
    y: pad.top,
    width: plotW,
    height: plotH,
    fill: 'transparent',
    class: 'chart-hit',
  }, svg);

  const tip = makeTooltip(container);

  const buildTip = (index) => {
    const frag = document.createDocumentFragment();
    const head = document.createElement('div');
    head.className = 'tip-head';
    head.textContent = `${labels[index]}${index < (asOfIndex ?? 0) + 1 ? '（实际）' : '（预测）'}`;
    frag.appendChild(head);
    // Each band is the difference between its cumulative top and the band
    // below it, so the tooltip reports how much that layer contributes rather
    // than repeating the running total for every layer.
    const rows = layers.map((layer, i) => {
      const lower = i === 0 ? 0 : layers[i - 1].values[index];
      return {
        label: layer.label,
        value: layer.values[index] - lower,
        colorVar: layer.colorVar,
      };
    });
    rows.push({
      label: '累计预算',
      value: budget[index],
      colorVar: '--text-secondary',
    });
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'tip-row';
      const key = document.createElement('span');
      key.className = 'tip-key';
      key.style.background = `var(${row.colorVar})`;
      const value = document.createElement('span');
      value.className = 'tip-value';
      value.textContent = formatValue(row.value);
      const label = document.createElement('span');
      label.className = 'tip-label';
      label.textContent = row.label;
      line.append(key, value, label);
      frag.appendChild(line);
    }
    // Stacked layers carry cumulative upper bounds, so the last one is the
    // total occupancy rather than the sum of the bands.
    const occupancy = layers.length ? layers[layers.length - 1].values[index] : 0;
    const total = document.createElement('div');
    total.className = 'tip-total';
    total.textContent = `累计占用 ${formatValue(occupancy)}`;
    frag.appendChild(total);
    const balance = document.createElement('div');
    balance.className = 'tip-total';
    balance.textContent = `截至本月余额 ${formatValue(budget[index] - occupancy)}`;
    frag.appendChild(balance);
    return frag;
  };

  const show = (index, clientX) => {
    cross.setAttribute('opacity', '1');
    cross.querySelector('.crosshair-line').setAttribute('x1', x(index));
    cross.querySelector('.crosshair-line').setAttribute('x2', x(index));
    dot.setAttribute('cx', x(index));
    dot.setAttribute('cy', y(top[index]));
    tip.replaceChildren(buildTip(index));
    placeTooltip(tip, container, clientX);
  };

  hit.addEventListener('pointermove', (event) => {
    const box = svg.getBoundingClientRect();
    const localX = ((event.clientX - box.left) / box.width) * width;
    const ratio = (localX - pad.left) / plotW;
    const index = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
    show(index, event.clientX);
  });
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('opacity', '0');
    tip.hidden = true;
  });

  return svg;
}

/** Diverging horizontal bars around zero: department year-end balance. */
export function renderDivergingBars(container, options) {
  const {
    width,
    rows,
    barHeight = 16,
    rowGap = 16,
    labelWidth = 128,
    formatValue,
    formatTick,
    ariaLabel,
  } = options;
  container.querySelectorAll('svg, .chart-tooltip').forEach((n) => n.remove());
  const height = rows.length * (barHeight + rowGap) + 32;
  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height,
    role: 'img',
    'aria-label': ariaLabel,
    class: 'chart-svg',
  });
  container.appendChild(svg);

  // Gutter layout: row labels | negative value labels | plot | positive value
  // labels. Reserving both value gutters means a full-length bar's number is
  // never drawn on top of the bar or the department name.
  const valueW = 76;
  const plotW = Math.max(120, width - labelWidth - valueW * 2);
  const zeroX = labelWidth + valueW + plotW / 2;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const scale = plotW / 2 / maxAbs;
  const tip = makeTooltip(container);

  rows.forEach((row, i) => {
    const yTop = 6 + i * (barHeight + rowGap);
    svgText(svg, labelWidth - 12, yTop + barHeight / 2 + 5, row.label, {
      'text-anchor': 'end',
      class: 'row-label',
    });
    const positive = row.value >= 0;
    const w = Math.max(1, Math.abs(row.value) * scale);
    const barStart = positive ? zeroX : zeroX - w;
    const bar = el('rect', {
      x: barStart,
      y: yTop,
      width: w,
      height: barHeight,
      rx: 4,
      fill: `var(${positive ? '--diverging-pos' : '--diverging-neg'})`,
      class: 'diverging-bar',
    }, svg);
    svgText(
      svg,
      positive ? barStart + w + 10 : barStart - 10,
      yTop + barHeight / 2 + 5,
      formatValue(row.value),
      { 'text-anchor': positive ? 'start' : 'end', class: 'value-label' },
    );
    const hit = el('rect', {
      x: labelWidth,
      y: yTop - rowGap / 2,
      width: valueW * 2 + plotW,
      height: barHeight + rowGap,
      fill: 'transparent',
      class: 'chart-hit',
    }, svg);
    hit.addEventListener('pointermove', (event) => {
      bar.classList.add('is-hovered');
      const frag = document.createDocumentFragment();
      const head = document.createElement('div');
      head.className = 'tip-head';
      head.textContent = row.label;
      frag.appendChild(head);
      for (const line of row.details) {
        const node = document.createElement('div');
        node.className = 'tip-row';
        const label = document.createElement('span');
        label.className = 'tip-label';
        label.textContent = line.label;
        const value = document.createElement('span');
        value.className = 'tip-value';
        value.textContent = line.value;
        node.append(value, label);
        frag.appendChild(node);
      }
      tip.replaceChildren(frag);
      placeTooltip(tip, container, event.clientX);
    });
    hit.addEventListener('pointerleave', () => {
      bar.classList.remove('is-hovered');
      tip.hidden = true;
    });
  });

  el('line', {
    x1: zeroX,
    x2: zeroX,
    y1: 2,
    y2: height - 24,
    class: 'axis-line',
  }, svg);
  svgText(svg, labelWidth + valueW, height - 6, `−${formatTick(maxAbs)}`, {
    'text-anchor': 'start',
    class: 'axis-label',
  });
  svgText(svg, zeroX, height - 6, '0', { 'text-anchor': 'middle', class: 'axis-label' });
  svgText(svg, labelWidth + valueW + plotW, height - 6, `+${formatTick(maxAbs)}`, {
    'text-anchor': 'end',
    class: 'axis-label',
  });
  return svg;
}
