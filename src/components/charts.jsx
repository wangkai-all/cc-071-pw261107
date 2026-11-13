import { useEffect, useMemo, useRef } from 'react';
import { renderTimeline, renderDivergingBars } from '../lib/charts.js';
import { fmtMoney, fmtCompact } from '../lib/format.js';

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/**
 * Cumulative burn-up: budget plan, actuals, open commitments and forecast new
 * spend on one axis. The occupancy bands stack to year-end expected spend.
 */
export function BudgetTimeline({ rows, width = 720 }) {
  const ref = useRef(null);
  const series = useMemo(() => {
    const budget = rows.map((r) => Math.round(r.budget));
    const actual = rows.map((r) => Math.round(r.actual));
    const commitments = rows.map((r) => Math.round(r.actual + r.commitments));
    const occupancy = rows.map((r) => Math.round(r.actual + r.commitments + r.forecast));
    return { budget, actual, commitments, occupancy };
  }, [rows]);

  useEffect(() => {
    if (!ref.current) return;
    const labels = MONTH_LABELS;
    renderTimeline(ref.current, {
      width,
      height: 340,
      labels,
      asOfIndex: rows.findLastIndex((r) => r.isActual),
      budget: series.budget,
      layers: [
        {
          key: 'actual',
          label: '实际支出',
          colorVar: '--series-1',
          values: series.actual,
          fill: true,
        },
        {
          key: 'commit',
          label: '未结承诺',
          colorVar: '--series-4',
          values: series.commitments,
          fill: true,
        },
        {
          key: 'forecast',
          label: '预测支出',
          colorVar: '--series-3',
          values: series.occupancy,
          fill: true,
        },
      ],
      formatTick: (value) => fmtCompact(value),
      formatValue: (value) => fmtMoney(value, 0),
      ariaLabel: '年度预算与实际、未结承诺、预测支出累计对比',
    });
  }, [rows, series, width]);

  return <div className="chart-wrap" ref={ref} />;
}

export function BalanceBars({ rows, width = 560 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    renderDivergingBars(ref.current, {
      width,
      rows: rows.map((row) => ({
        label: row.name,
        value: Math.round(row.remaining),
        details: [
          { label: '预算', value: fmtMoney(row.budget, 0) },
          { label: '实际', value: fmtMoney(row.actual, 0) },
          { label: '未结承诺', value: fmtMoney(row.commitments, 0) },
          { label: '预测新增', value: fmtMoney(row.forecast, 0) },
        ],
      })),
      formatValue: (value) => fmtMoney(value, 0),
      formatTick: (value) => fmtCompact(value),
      ariaLabel: '各部门年末余额（正为结余、负为超支）',
    });
  }, [rows, width]);
  return <div className="chart-wrap" ref={ref} />;
}

export function TimelineLegend() {
  return (
    <div className="legend" aria-hidden="true">
      <span><i className="key-line" style={{ background: 'var(--text-secondary)' }} />累计预算</span>
      <span><i className="key-rect" style={{ background: 'var(--series-1)' }} />实际支出</span>
      <span><i className="key-rect" style={{ background: 'var(--series-4)' }} />未结承诺</span>
      <span><i className="key-rect" style={{ background: 'var(--series-3)' }} />预测支出</span>
    </div>
  );
}
