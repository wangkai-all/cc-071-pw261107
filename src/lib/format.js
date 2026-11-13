export const WAN = 10_000;

export function toWan(value) {
  return value / WAN;
}

/** Compact currency for KPI tiles and tooltips: ¥1,234.5 万 */
export function fmtMoney(value, digits = 1) {
  const wan = value / WAN;
  const sign = wan < 0 ? '−' : '';
  return `${sign}¥${Math.abs(wan).toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} 万`;
}

/** Signed compact currency for deltas: +¥120.0 万 */
export function fmtSignedMoney(value, digits = 1) {
  const text = fmtMoney(Math.abs(value), digits);
  return `${value < 0 ? '−' : '+'}${text.replace('¥', '¥')}`;
}

/** Numeric cell content, already in 万元 (tables carry the unit in the header). */
export function fmtWanNumber(value, digits = 1) {
  const wan = value / WAN;
  return wan.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtSignedWanNumber(value, digits = 1) {
  const wan = Math.abs(value) / WAN;
  return `${value < 0 ? '−' : '+'}${wan.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function fmtCompact(value) {
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${(value / 1e8).toFixed(1)} 亿`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(0)} 万`;
  return `${Math.round(value)}`;
}

export function fmtPct(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
}

export function fmtMonth(month) {
  return `${month}月`;
}

export function cnNumber(n) {
  return n.toLocaleString('zh-CN');
}
