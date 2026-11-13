import { useMemo, useState } from 'react';
import { Card, Drawer, StatusTag } from './ui.jsx';
import { fmtDate, fmtMoney, fmtWanNumber } from '../lib/format.js';
import { exportTrace } from '../lib/export.js';

const GROUPS = [
  {
    id: 'unmatched',
    label: '未匹配部门',
    tone: 'bad',
    note: '凭证的成本中心不在主数据中，无法归入任何预算行，因此不计入实际支出，但保留凭证原文以便补录。',
    amount: (e) => e.amount,
    status: () => '待补主数据',
  },
  {
    id: 'duplicates',
    label: '重复凭证',
    tone: 'warn',
    note: '与原始凭证同金额、同发票号、同供应商，系统判定为重复导入。此类凭证已停用，不占用实际支出。',
    amount: (e) => e.amount,
    status: () => '已停用',
  },
  {
    id: 'reversals',
    label: '冲销记录',
    tone: 'neutral',
    note: '冲销凭证以负金额过账并冲减实际支出；与原始凭证成对出现，追溯时双向可见。',
    amount: (e) => Math.abs(e.amount),
    status: () => '已冲销',
  },
  {
    id: 'cancelled',
    countKey: 'cancelledCommitments',
    totalKey: 'cancelledCommitments',
    label: '已取消采购承诺',
    tone: 'neutral',
    note: '取消的采购承诺不再占用预算额度。本页可核对释放金额，确认其不进入未结承诺。',
    amount: (e) => e.amount,
    status: (row) => `${row.cancelledAt} 取消`,
  },
];

function ExceptionTable({ group, rows, model, onOpenTrace }) {
  const isCommitment = group.id === 'cancelled';
  return (
    <div className="table-scroll">
      <table className="table--ledger">
        <thead>
          <tr>
            <th>{isCommitment ? '承诺号' : '凭证号'}</th>
            <th>{isCommitment ? '采购单号' : '发票号'}</th>
            <th>部门</th>
            <th>项目</th>
            <th>科目</th>
            <th className="amount-col">金额（万元）</th>
            <th className="amount-col">日期</th>
            <th>状态</th>
            <th>说明</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="cell-name mono">{row.id}</td>
              <td className="mono">{isCommitment ? row.poNo : row.source.invoiceNo}</td>
              <td style={{ textAlign: 'left' }}>
                {row.deptId === 'D90' ? (
                  <span className="num--neg">{model.deptMap.get(row.deptId)?.name ?? '未匹配'}</span>
                ) : (
                  model.deptMap.get(row.deptId)?.name ?? row.deptId
                )}
              </td>
              <td style={{ textAlign: 'left' }}>
                {model.projectMap.get(row.projectId)?.name ?? row.projectId}
              </td>
              <td style={{ textAlign: 'left' }}>
                {model.categoryMap.get(row.categoryId)?.name ?? row.categoryId}
              </td>
              <td className="mono amount-col">{fmtWanNumber(group.amount(row), 1)}</td>
              <td className="mono amount-col">{isCommitment ? row.cancelledAt ?? '—' : row.date}</td>
              <td style={{ textAlign: 'left' }}>
                <StatusTag tone={group.id === 'unmatched' ? 'bad' : group.id === 'duplicates' ? 'warn' : undefined}>
                  {group.status(row)}
                </StatusTag>
              </td>
              <td style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                {isCommitment ? row.cancelReason : row.reason ?? '—'}
              </td>
              <td>
                {!isCommitment && (
                  <button className="btn btn--ghost btn--sm" onClick={() => onOpenTrace(row.id)}>
                    追溯
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExceptionsView({ model, onOpenTrace }) {
  const [active, setActive] = useState('unmatched');
  const counts = model.exceptions.counts;
  const totals = model.exceptions.totals;

  const rowsByGroup = useMemo(
    () => ({
      unmatched: model.exceptions.unmatched,
      duplicates: model.exceptions.duplicates,
      reversals: model.exceptions.reversals,
      cancelled: model.exceptions.cancelledCommitments,
    }),
    [model],
  );

  const group = GROUPS.find((g) => g.id === active);
  const rows = rowsByGroup[active];

  return (
    <>
      <div className="exception-grid">
        {GROUPS.map((entry) => (
          <button
            key={entry.id}
            className="exception-card"
            data-active={active === entry.id}
            onClick={() => setActive(entry.id)}
            aria-pressed={active === entry.id}
          >
            <span className="label">
              <i
                className="legend-key"
                style={{
                  background:
                    entry.id === 'unmatched'
                      ? 'var(--critical)'
                      : entry.id === 'duplicates'
                        ? 'var(--warning)'
                        : entry.id === 'reversals'
                          ? 'var(--series-7)'
                          : 'var(--text-muted)',
                }}
              />
              {entry.label}
            </span>
            <span className="count">{counts[entry.countKey ?? entry.id]}</span>
            <span className="amount">
              {entry.id === 'reversals'
                ? '冲减 '
                : entry.id === 'cancelled'
                  ? '释放 '
                  : '金额 '}
              {fmtMoney(Math.abs(totals[entry.totalKey ?? entry.id]), 1)}
            </span>
          </button>
        ))}
      </div>

      <Card
        title={group.label}
        subtitle="异常项单独呈现，不并入部门与项目的实际支出；取消承诺另核对占用释放。"
        className="card--flush"
      >
        <div className="exception-note">{group.note}</div>
        {rows.length ? (
          <ExceptionTable
            group={group}
            rows={rows}
            model={model}
            onOpenTrace={onOpenTrace}
          />
        ) : (
          <div className="empty">当前没有此类异常。</div>
        )}
      </Card>
    </>
  );
}

export function TraceDrawer({ trace, onClose }) {
  if (!trace) return null;
  const v = trace.voucher;
  return (
    <Drawer
      open
      title={`凭证 ${v.id}`}
      subtitle={trace.definition}
      onClose={onClose}
      actions={
        <button className="btn btn--sm" onClick={() => exportTrace(trace)}>
          导出追溯 CSV
        </button>
      }
    >
      <div className="drawer-section">
        <h3>金额与归属</h3>
        <dl className="kv">
          <dt>金额</dt>
          <dd className={v.amount < 0 ? 'num--neg' : ''}>{fmtMoney(v.amount, 2)}</dd>
          <dt>部门</dt>
          <dd>{trace.deptName ?? `${v.deptId}（未匹配）`}</dd>
          <dt>项目</dt>
          <dd>{trace.projectName ?? `${v.projectId}（未匹配）`}</dd>
          <dt>费用科目</dt>
          <dd>{trace.categoryName ?? `${v.categoryId}（未匹配）`}</dd>
          <dt>科目预算</dt>
          <dd>{trace.lineBudget != null ? fmtMoney(trace.lineBudget, 1) : '—'}</dd>
          <dt>科目实际</dt>
          <dd>{trace.lineActual != null ? fmtMoney(trace.lineActual, 1) : '—'}</dd>
          <dt>记账月份</dt>
          <dd>{v.month} 月 · {fmtDate(v.date)}</dd>
        </dl>
      </div>

      <div className="drawer-section">
        <h3>来源单据</h3>
        <div className="source-card">
          <dl className="source-grid">
            <div>
              <dt>采购单号</dt>
              <dd>{v.source.poNo}</dd>
            </div>
            <div>
              <dt>发票号</dt>
              <dd>{v.source.invoiceNo}</dd>
            </div>
            <div>
              <dt>供应商</dt>
              <dd>{v.source.vendor}</dd>
            </div>
            <div>
              <dt>提交人</dt>
              <dd>{v.source.submittedBy}</dd>
            </div>
            <div>
              <dt>提交日期</dt>
              <dd>{fmtDate(v.source.submittedAt)}</dd>
            </div>
            <div>
              <dt>审批环节</dt>
              <dd>{v.source.approvalStep}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="drawer-section">
        <h3>关联凭证</h3>
        {trace.related.length ? (
          <div className="trace-chain">
            {trace.related.map((item) => (
              <div className="trace-item" key={item.voucher.id}>
                <span className="relation">{item.relation}</span>
                <div>
                  <div className="mono">{item.voucher.id}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>
                    {fmtMoney(item.voucher.amount, 2)} · {item.voucher.date} ·{' '}
                    {item.voucher.source.invoiceNo}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty" style={{ padding: '16px 0' }}>
            该凭证没有关联的重复或冲销记录。
          </div>
        )}
      </div>

      <div className="drawer-section">
        <h3>追溯说明</h3>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
          凭证号 → 采购单/发票 → 提交人与审批环节，可逐级核对到来源单据。
          未匹配凭证会显示原始部门代码，便于回到主数据补录后重新归集。
        </p>
      </div>
    </Drawer>
  );
}

export function LineVouchersDrawer({ model, line, onClose, onOpenTrace }) {
  if (!line) return null;
  const vouchers = model.dataset.vouchers.filter((v) => (model.lineMap.get(line.key)?.voucherIds ?? []).includes(v.id));
  const commitments = model.dataset.commitments.filter((c) =>
    (model.lineMap.get(line.key)?.commitmentIds ?? []).includes(c.id),
  );
  return (
    <Drawer
      open
      title={`${line.name} · 凭证明细`}
      subtitle={`${model.deptMap.get(line.deptId)?.name ?? ''} / ${model.projectMap.get(line.projectId)?.name ?? ''} · 共 ${vouchers.length} 张凭证`}
      onClose={onClose}
    >
      <div className="drawer-section">
        <h3>未结承诺</h3>
        {commitments.length ? (
          <div className="trace-chain">
            {commitments.map((c) => (
              <div className="trace-item" key={c.id}>
                <span className="relation">{c.poNo}</span>
                <div>
                  <div>{fmtMoney(c.amount, 1)} · 预计 {c.expectedMonth} 月</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{c.vendor}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>该科目没有未结承诺。</p>
        )}
      </div>
      <div className="drawer-section">
        <h3>实际支出凭证</h3>
        <div className="trace-chain">
          {vouchers.map((v) => (
            <button
              key={v.id}
              className="trace-item trace-item--button"
              onClick={() => onOpenTrace(v.id)}
            >
              <span className="relation">{v.month} 月</span>
              <div style={{ textAlign: 'left' }}>
                <div className="mono">{v.id} · {fmtMoney(v.amount, 1)}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>
                  {v.source.vendor} · {v.source.invoiceNo}
                  {v.kind === 'reversal' ? ' · 冲销' : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Drawer>
  );
}
