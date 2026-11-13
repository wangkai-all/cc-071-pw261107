import { fmtWanNumber, fmtSignedWanNumber } from '../lib/format.js';

/** Table twin for the timeline: every plotted point is also readable here. */
export function MonthlyTable({ rows }) {
  return (
    <div className="table-scroll" style={{ marginTop: 10 }}>
      <table>
        <thead>
          <tr>
            <th>月份</th>
            <th>本月预算</th>
            <th>本月实际</th>
            <th>本月承诺</th>
            <th>本月预测新增</th>
            <th>累计预算</th>
            <th>累计实际</th>
            <th>累计承诺</th>
            <th>累计预测</th>
            <th>累计占用</th>
            <th>累计余额</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.month}>
              <td className="cell-name">
                {row.month} 月
                {row.isActual ? (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>实际</span>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>预测</span>
                )}
              </td>
              <td>{fmtWanNumber(row.monthlyBudget, 1)}</td>
              <td>{fmtWanNumber(row.monthlyActual, 1)}</td>
              <td>{fmtWanNumber(row.monthlyCommitment, 1)}</td>
              <td>{fmtWanNumber(row.monthlyForecast, 1)}</td>
              <td>{fmtWanNumber(row.budget, 1)}</td>
              <td>{fmtWanNumber(row.actual, 1)}</td>
              <td>{fmtWanNumber(row.commitments, 1)}</td>
              <td>{fmtWanNumber(row.forecast, 1)}</td>
              <td>{fmtWanNumber(row.occupancy, 1)}</td>
              <td className={row.remaining < 0 ? 'num--neg' : ''}>
                {fmtSignedWanNumber(row.remaining, 1)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="is-group">
            <td>年末累计</td>
            <td colSpan={4} style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
              年内合计
            </td>
            <td>{fmtWanNumber(rows[rows.length - 1].budget, 1)}</td>
            <td>{fmtWanNumber(rows[rows.length - 1].actual, 1)}</td>
            <td>{fmtWanNumber(rows[rows.length - 1].commitments, 1)}</td>
            <td>{fmtWanNumber(rows[rows.length - 1].forecast, 1)}</td>
            <td>{fmtWanNumber(rows[rows.length - 1].occupancy, 1)}</td>
            <td className={rows[rows.length - 1].remaining < 0 ? 'num--neg' : ''}>
              {fmtSignedWanNumber(rows[rows.length - 1].remaining, 1)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
