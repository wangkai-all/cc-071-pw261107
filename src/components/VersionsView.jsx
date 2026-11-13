import { Card, StatusTag } from './ui.jsx';
import { fmtMoney, fmtWanNumber, fmtSignedWanNumber, fmtDate } from '../lib/format.js';

/**
 * Ledger versions: the approved baseline plus every adjustment, each with the
 * before/after amounts per line. Pending versions are visibly marked and are
 * excluded from the effective budget by the engine.
 */
export function VersionsView({ model, onPickLine }) {
  const versions = model.versions;
  const pending = versions.filter((v) => v.status === 'pending');

  return (
    <>
      <Card
        title="预算版本与审批留痕"
        subtitle="基线版本由董事会审批；每次调整保留审批前/审批后金额，跨部门转移的两条分录同时生效。"
      >
        <div className="version-summary">
          <div>
            <span className="k">生效预算</span>
            <strong>
              {fmtMoney(
                versions
                  .filter((v) => v.status === 'approved')
                  .reduce((total, v) => total + (v.type === 'baseline' ? v.totalAfter : 0), 0) +
                  model.versions
                    .filter((v) => v.status === 'approved' && v.type !== 'baseline')
                    .reduce((total, v) => total + v.totalDelta, 0),
                1,
              )}
            </strong>
          </div>
          <div>
            <span className="k">已审批调整</span>
            <strong>{versions.filter((v) => v.status === 'approved' && v.type !== 'baseline').length} 笔</strong>
          </div>
          <div>
            <span className="k">待审批</span>
            <strong>
              {pending.length} 笔 · 影响{' '}
              {fmtMoney(pending.reduce((a, v) => a + v.totalIncrease, 0), 1)}
            </strong>
          </div>
          <div>
            <span className="k">跨部门转移</span>
            <strong>{versions.filter((v) => v.type === 'transfer').length} 笔（双边入账）</strong>
          </div>
        </div>
      </Card>

      <div className="version-list" style={{ marginTop: 16 }}>
        {versions.map((version) => {
          const isBaseline = version.type === 'baseline';
          const isPending = version.status === 'pending';
          return (
            <article
              key={version.id}
              className={`version-card ${isPending ? 'version-card--pending' : ''}`}
            >
              <div className="version-head">
                <div>
                  <h3>
                    {isBaseline ? '年度预算基线' : version.label}
                    <span className="mono" style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>
                      {version.id}
                    </span>
                    {isBaseline ? (
                      <StatusTag tone="good">基线 · 已审批</StatusTag>
                    ) : version.type === 'transfer' ? (
                      <StatusTag>跨部门转移</StatusTag>
                    ) : (
                      <StatusTag>部门内调整</StatusTag>
                    )}
                    {isPending ? <StatusTag tone="warn">待审批 · 未生效</StatusTag> : null}
                  </h3>
                  <div className="version-meta">
                    {isBaseline ? (
                      <>
                        <span>审批：{fmtDate(version.approvedAt)}</span>
                        <span>审批人：{version.approver}</span>
                        <span>生效：{version.effectiveMonth} 月</span>
                      </>
                    ) : (
                      <>
                        <span>申请：{version.requestedBy} · {fmtDate(version.requestedAt)}</span>
                        <span>审批：{version.approvedAt ? `${fmtDate(version.approvedAt)} · ${version.approver}` : '尚未审批'}</span>
                        <span>生效：{version.effectiveMonth} 月</span>
                      </>
                    )}
                  </div>
                  {version.memo ? <p className="version-memo">{version.memo}</p> : null}
                </div>
                <div className="version-total">
                  <span className="k">{isBaseline ? '基线合计' : '审批前 → 审批后'}</span>
                  {isBaseline ? (
                    <strong>{fmtWanNumber(version.totalAfter, 1)} 万</strong>
                  ) : (
                    <strong>
                      {fmtWanNumber(version.totalBefore, 1)} → {fmtWanNumber(version.totalAfter, 1)} 万
                      {version.totalDelta === 0 ? (
                        // Reserve-funded adjustments and transfers move money
                        // between lines without changing the total.
                        <em className="num--pos">
                          {version.type === 'transfer' ? '转移' : '调剂'} ¥
                          {fmtWanNumber(version.totalIncrease, 1)} 万
                        </em>
                      ) : (
                        <em className={version.totalDelta < 0 ? 'num--neg' : 'num--pos'}>
                          {fmtSignedWanNumber(version.totalDelta, 1)}
                        </em>
                      )}
                    </strong>
                  )}
                </div>
              </div>

              {!isBaseline && (
                <div className="version-lines">
                  <table>
                    <thead>
                      <tr>
                        <th>部门</th>
                        <th>项目</th>
                        <th>费用科目</th>
                        <th>审批前（万元）</th>
                        <th>审批后（万元）</th>
                        <th>变动（万元）</th>
                        {version.type === 'transfer' ? <th>分录</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {version.lines.map((line, index) => (
                        <tr key={`${version.id}-${index}`}>
                          <td style={{ textAlign: 'left' }}>{line.deptName}</td>
                          <td style={{ textAlign: 'left' }}>
                            <button className="link-btn" onClick={() => onPickLine(line)}>
                              {line.projectName}
                            </button>
                          </td>
                          <td style={{ textAlign: 'left' }}>{line.categoryName}</td>
                          <td>{fmtWanNumber(line.before, 1)}</td>
                          <td>{fmtWanNumber(line.after, 1)}</td>
                          <td className={`delta-cell ${line.delta < 0 ? 'num--neg' : 'num--pos'}`}>
                            {fmtSignedWanNumber(line.delta, 1)}
                          </td>
                          {version.type === 'transfer' ? (
                            <td style={{ textAlign: 'left' }}>
                              <StatusTag tone={line.leg === '转出' ? 'warn' : 'good'}>
                                {line.leg}
                              </StatusTag>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {version.type === 'transfer' && (
                    <p className="version-note">
                      转出与转入金额相等、方向相反，合计变动为 {fmtMoney(version.totalDelta, 1)}；
                      任一方未入账都会破坏校验，因此两边同时生效。
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
