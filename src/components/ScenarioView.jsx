import { Fragment } from 'react';
import { Card, StatusTag } from './ui.jsx';
import { fmtMoney, fmtPct, fmtSignedWanNumber, fmtWanNumber } from '../lib/format.js';

function describe(scenario) {
  const parts = [`回看 ${scenario.lookback} 个月`];
  if (scenario.growthPct) parts.push(`月增 ${scenario.growthPct}%`);
  if (scenario.includeNewSpend === false) parts.push('不预测新增');
  if (scenario.includeCommitments === false) parts.push('不含承诺');
  const multipliers = Object.entries(scenario.deptMultipliers ?? {}).filter(([, v]) => v);
  if (multipliers.length) parts.push(`${multipliers.length} 个部门系数`);
  return parts.join(' · ');
}

export function ScenarioView({ scenarios, activeId, results, rows, onExport, baseId = 'base' }) {
  const active = results.find((r) => r.id === activeId) ?? results[0];
  const actual = active.result.actual;
  const base = results.find((r) => r.id === baseId);

  return (
    <>
      <Card
        title="方案对比"
        subtitle="同一筛选范围下，不同预测假设对年末余额的影响。差异为各方案余额减基准方案余额。"
        actions={
          <button className="btn btn--sm" onClick={onExport}>
            导出差异 CSV
          </button>
        }
      >
        <div className="compare-grid" style={{ marginTop: 14 }}>
          {results.map((entry) => {
            const isBase = entry.id === baseId;
            const balance = entry.result.balance;
            return (
              <div key={entry.id} className="compare-card" data-base={isBase}>
                <div className="name">
                  <span>
                    {entry.name}
                    {isBase ? ' · 基准' : ''}
                  </span>
                  {isBase ? (
                    <StatusTag>比较基准</StatusTag>
                  ) : entry.varianceVsBase === 0 ? (
                    <StatusTag>持平</StatusTag>
                  ) : (
                    <StatusTag tone={entry.varianceVsBase > 0 ? 'good' : 'bad'}>
                      差异 {fmtSignedWanNumber(entry.varianceVsBase, 1)} 万
                    </StatusTag>
                  )}
                </div>
                <div className="desc">{describe(entry)}</div>
                <div className="big">
                  {fmtMoney(balance, 1)}
                  <small>年末预计余额</small>
                </div>
                <div className="variance">
                  预测新增 {fmtMoney(entry.result.forecastTotal, 1)} · 预计支出{' '}
                  {fmtMoney(entry.result.yearEndSpend, 1)}
                </div>
                {!isBase && (
                  <div className="variance" style={{ color: 'var(--text-muted)' }}>
                    较基准 {base ? fmtSignedWanNumber(balance - base.result.balance, 1) : '—'} 万
                    （{fmtPct((balance - (base?.result.balance ?? 0)) / (base?.result.balance || 1), 1)}）
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title="按部门拆分年末余额差异"
        subtitle={`单位：万元 · 当前生效方案「${active.name}」高亮 · 差异列均为相对基准方案`}
        className="card--flush"
        style={{ marginTop: 16 }}
      >
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>部门</th>
                {results.map((entry) => (
                  <th key={entry.id} colSpan={2} style={{ textAlign: 'center' }}>
                    {entry.name}
                    {entry.id === activeId ? '（当前）' : ''}
                  </th>
                ))}
              </tr>
              <tr>
                <th />
                {results.map((entry) => (
                  <Fragment key={`${entry.id}-head`}>
                    <th style={{ textAlign: 'right' }}>余额</th>
                    <th style={{ textAlign: 'right' }}>差异</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {model_departments(rows, results).map((dept) => (
                <tr key={dept.id}>
                  <td className="cell-name">{dept.name}</td>
                  {results.map((entry) => {
                    const cell = rows.find(
                      (r) => r.scenarioId === entry.id && r.deptId === dept.id,
                    );
                    const value = cell ? cell.balance : 0;
                    return (
                      <Fragment key={`${entry.id}-${dept.id}`}>
                        <td className={value < 0 ? 'num--neg' : value > 0 ? 'num--pos' : ''}>
                          {fmtWanNumber(value, 1)}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {entry.id === baseId ? '—' : fmtSignedWanNumber(cell?.varianceVsBase ?? 0, 1)}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="is-group">
                <td>合计</td>
                {results.map((entry) => (
                  <Fragment key={`${entry.id}-total`}>
                    <td className={entry.result.balance < 0 ? 'num--neg' : 'num--pos'}>
                      {fmtWanNumber(entry.result.balance, 1)}
                    </td>
                    <td>—</td>
                  </Fragment>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="table-hint" style={{ paddingBottom: 16 }}>
          「差异」按部门比较：同一部门在不同方案下的年末余额之差。总计差异见上方卡片。
        </div>
      </Card>
    </>
  );
}

function model_departments(rows, results) {
  const seen = new Map();
  for (const row of rows) {
    if (!seen.has(row.deptId)) seen.set(row.deptId, { id: row.deptId, name: row.deptName });
  }
  return [...seen.values()];
}
