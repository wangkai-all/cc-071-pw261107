import { Card } from './ui.jsx';
import { BudgetTimeline, BalanceBars, TimelineLegend } from './charts.jsx';
import { fmtMoney, fmtPct, fmtSignedWanNumber } from '../lib/format.js';

function Kpi({ label, value, sub, children }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">
        <span>{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
      {children}
    </div>
  );
}

export function Overview({ model, rows, rollup, scenario, baselineTotal }) {
  const last = rows[rows.length - 1];
  const actual = last.actual;
  const commitments = last.commitments;
  const forecast = last.forecast;
  const budget = last.budget;
  const balance = last.remaining;
  const yearEnd = actual + commitments + forecast;
  const monthNow = model.asOfMonth;

  const deptRows = [...rollup.departments].sort((a, b) => a.remaining - b.remaining);
  const worst = deptRows[0];
  const reserve = rollup.projects.find((p) => p.reserve);
  const overspent = deptRows.filter((d) => d.remaining < 0);
  const adjustmentDelta = budget - baselineTotal;
  const approvedCount = model.versions.filter(
    (v) => v.status === 'approved' && v.type !== 'baseline',
  ).length;
  const pending = model.versions.filter((v) => v.status === 'pending');
  const pendingDelta = pending.reduce((a, v) => a + v.totalIncrease, 0);
  const anomalies =
    model.exceptions.counts.unmatched +
    model.exceptions.counts.duplicates +
    model.exceptions.counts.reversals;

  return (
    <>
      <div className="grid grid--kpi">
        <Kpi
          label="年度预算（已生效）"
          value={fmtMoney(budget, 1)}
          sub={
            <span>
              基线 {fmtMoney(baselineTotal, 1)} · {approvedCount} 笔调整净额{' '}
              {fmtMoney(adjustmentDelta, 1)}
            </span>
          }
        >
          <div className="meter-legend">
            <span>
              <i className="legend-key" style={{ background: 'var(--series-1)' }} />
              已用 {fmtPct(actual / budget)}
            </span>
            <span>
              <i className="legend-key" style={{ background: 'var(--series-4)' }} />
              承诺 {fmtPct(commitments / budget)}
            </span>
            <span>
              <i className="legend-key" style={{ background: 'var(--series-3)' }} />
              预测 {fmtPct(forecast / budget)}
            </span>
          </div>
        </Kpi>

        <Kpi
          label={`实际支出（1–${monthNow}月）`}
          value={fmtMoney(actual, 1)}
          sub={`月均 ${fmtMoney(actual / monthNow, 1)} · 占预算 ${fmtPct(actual / budget)}`}
        />

        <Kpi
          label="未结承诺"
          value={fmtMoney(commitments, 1)}
          sub={`取消承诺 ${model.exceptions.counts.cancelledCommitments} 笔已剔除，释放 ${fmtMoney(
            model.exceptions.totals.cancelledCommitments,
            1,
          )}`}
        />

        <Kpi
          label="年末预计余额"
          value={fmtMoney(balance, 1)}
          sub={
            <>
              <span className={balance < 0 ? 'delta delta--bad' : 'delta delta--good'}>
                {balance < 0 ? '▲ 超支 ' : '▼ 结余 '}
                {fmtMoney(Math.abs(balance), 1)}
              </span>
              <span>预计支出 {fmtMoney(yearEnd, 1)}</span>
            </>
          }
        >
          <div className="meter-legend">
            <span>预算使用率（含预测）{fmtPct(yearEnd / budget)}</span>
          </div>
        </Kpi>
      </div>

      <div className="grid grid--main">
        <Card
          title="预算时间线"
          subtitle={`累计口径 · ${model.asOfMonth} 月及以前为实际，之后为「${scenario.name}」预测 · 金额单位：元`}
        >
          <div style={{ marginTop: 14 }}>
            <BudgetTimeline rows={rows} width={760} />
          </div>
          <TimelineLegend />
        </Card>

        <Card title="部门年末余额" subtitle="余额 = 预算 − 实际 − 未结承诺 − 预测新增；负值表示年末超支">
          <div style={{ marginTop: 14 }}>
            <BalanceBars rows={deptRows} width={540} />
          </div>
          <div className="legend">
            <span><i className="key-rect" style={{ background: 'var(--diverging-pos)' }} />结余</span>
            <span><i className="key-rect" style={{ background: 'var(--diverging-neg)' }} />超支</span>
          </div>
        </Card>
      </div>

      <div className="grid grid--two" style={{ marginTop: 16 }}>
        <Card title="自动提示" subtitle="从当前筛选范围与场景推导，不写死结论">
          <ul className="insights">
            {worst ? (
              <li>
                余额最低的是 <strong>{worst.name}</strong>，年末
                {worst.remaining < 0 ? '超支' : '结余'}
                <strong className={worst.remaining < 0 ? 'num--neg' : 'num--pos'}>
                  {' '}{fmtMoney(Math.abs(worst.remaining), 1)}
                </strong>
                ；当前筛选下共 {overspent.length} 个部门预计超支。
              </li>
            ) : (
              <li>当前筛选没有可汇总的部门。</li>
            )}
            {reserve && (
              <li>
                预备费项目剩余 <strong>{fmtMoney(reserve.remaining, 1)}</strong>
                （预算 {fmtMoney(reserve.budget, 1)}），尚未被任何支出占用。
              </li>
            )}
            {pending.length > 0 && (
              <li>
                有 {pending.length} 笔调整待审批，将追加 {fmtMoney(pendingDelta, 1)}（预备费相应减少），
                未计入生效预算；审批通过后需重新核对年末余额。
              </li>
            )}
            <li>
              预测口径：最近 {scenario.lookback} 个月实际节奏
              {scenario.growthPct ? `、按月增减 ${scenario.growthPct}%` : '、无额外增长'}
              {Object.keys(scenario.deptMultipliers ?? {}).length
                ? '，并叠加部门手工系数'
                : ''}
              。
            </li>
            {anomalies > 0 && (
              <li>
                异常凭证 {anomalies} 条（未匹配、重复、冲销），金额
                {' '}
                <strong>
                  {fmtMoney(
                    model.exceptions.totals.unmatched +
                      model.exceptions.totals.duplicates +
                      Math.abs(model.exceptions.totals.reversals),
                    1,
                  )}
                </strong>
                ，均未并入实际支出，可在「异常凭证」页逐条追溯。
              </li>
            )}
          </ul>
        </Card>

        <Card title="年末预计支出构成" subtitle="三段相加等于预计支出；余额为预算减去该合计">
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>构成</th>
                <th>金额（万元）</th>
                <th>占预算</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="cell-name"><i className="swatch" style={{ background: 'var(--series-1)' }} />实际支出</td>
                <td>{fmtSignedWanNumber(actual, 1).replace('+', '')}</td>
                <td>{fmtPct(actual / budget)}</td>
                <td className="cell-note">已过账凭证，含冲销</td>
              </tr>
              <tr>
                <td className="cell-name"><i className="swatch" style={{ background: 'var(--series-4)' }} />未结承诺</td>
                <td>{fmtSignedWanNumber(commitments, 1).replace('+', '')}</td>
                <td>{fmtPct(commitments / budget)}</td>
                <td className="cell-note">已下单未到票</td>
              </tr>
              <tr>
                <td className="cell-name"><i className="swatch" style={{ background: 'var(--series-3)' }} />预测新增</td>
                <td>{fmtSignedWanNumber(forecast, 1).replace('+', '')}</td>
                <td>{fmtPct(forecast / budget)}</td>
                <td className="cell-note">按节奏外推的新增支出</td>
              </tr>
              <tr className="is-group">
                <td className="cell-name">年末预计支出</td>
                <td>{fmtSignedWanNumber(yearEnd, 1).replace('+', '')}</td>
                <td>{fmtPct(yearEnd / budget)}</td>
                <td className="cell-note">合计</td>
              </tr>
              <tr>
                <td className="cell-name">年末余额</td>
                <td className={balance < 0 ? 'num--neg' : 'num--pos'}>
                  {fmtSignedWanNumber(balance, 1)}
                </td>
                <td>{fmtPct(balance / budget)}</td>
                <td className="cell-note">预算 − 预计支出</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
