/**
 * CSV export helpers. All exports are built from the same derived rows the
 * screen renders, so a downloaded file can never disagree with the view.
 */

function escape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return lines.join('\r\n');
}

export function downloadText(filename, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([`﻿${content}`], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const W = 10_000;
const money = (value) => (value / W).toFixed(2);

export function exportVariance({ scenarios, rows, filters, model }) {
  const filterText = describeFilters(filters, model);
  const scenarioText = scenarios
    .map((s) => `${s.name}(回看${s.lookback}月,月增${s.growthPct}%,${s.includeCommitments ? '含承诺' : '不含承诺'})`)
    .join(' | ');
  const headers = [
    '方案',
    '回看窗口(月)',
    '月增长率(%)',
    '部门',
    '预算(万元)',
    '实际支出(万元)',
    '未结承诺(万元)',
    '预测新增(万元)',
    '年末预计支出(万元)',
    '年末余额(万元)',
    '相对基准余额差异(万元)',
    '筛选条件',
  ];
  const body = rows.map((row) => [
    row.scenario,
    row.lookback,
    row.growthPct,
    row.deptName,
    money(row.budget),
    money(row.actual),
    money(row.commitments),
    money(row.forecast),
    money(row.yearEndSpend),
    money(row.balance),
    money(row.varianceVsBase),
    filterText,
  ]);
  downloadText(
    `预算预测差异-${model.year}年${model.asOfMonth}月.csv`,
    toCsv(headers, body),
  );
  return scenarioText;
}

export function exportRollup({ rows, scenario, filters, model }) {
  const headers = ['层级', '名称', '上级', '预算(万元)', '实际支出(万元)', '未结承诺(万元)', '预测新增(万元)', '年末预计支出(万元)', '年末余额(万元)', '执行率(%)'];
  const body = [];
  for (const dept of rows.departments) {
    body.push(['部门', dept.name, '—', money(dept.budget), money(dept.actual), money(dept.commitments), money(dept.forecast), money(dept.yearEndSpend), money(dept.remaining), ((dept.utilization ?? (dept.actual + dept.commitments) / (dept.budget || 1)) * 100).toFixed(1)]);
    for (const project of rows.projects.filter((p) => p.deptId === dept.id)) {
      body.push(['项目', project.name, dept.name, money(project.budget), money(project.actual), money(project.commitments), money(project.forecast), money(project.yearEndSpend), money(project.remaining), '']);
      for (const category of project.categories) {
        body.push(['费用科目', category.name, `${dept.name} / ${project.name}`, money(category.budget), money(category.actual), money(category.commitments), money(category.forecast), money(category.yearEndSpend), money(category.remaining), '']);
      }
    }
  }
  downloadText(
    `预算对齐表-${scenario.name}-${describeFilters(filters, model)}.csv`,
    toCsv(headers, body),
  );
}

export function describeFilters(filters, model) {
  const parts = [];
  if (filters.deptIds.length) {
    parts.push(filters.deptIds.map((id) => model.deptMap.get(id)?.name ?? id).join('/'));
  }
  if (filters.projectIds.length) {
    parts.push(filters.projectIds.map((id) => model.projectMap.get(id)?.name ?? id).join('/'));
  }
  if (filters.categoryIds.length) {
    parts.push(filters.categoryIds.map((id) => model.categoryMap.get(id)?.name ?? id).join('/'));
  }
  if (filters.monthRange && filters.monthRange[1] !== 12) {
    parts.push(`截至${filters.monthRange[1]}月`);
  }
  return parts.length ? parts.join(' · ') : '全部部门 / 全部项目 / 全部科目';
}

export function exportTrace(trace) {
  const headers = ['字段', '内容'];
  const v = trace.voucher;
  const rows = [
    ['凭证号', v.id],
    ['凭证类型', trace.definition],
    ['部门', trace.deptName ?? `${v.deptId}（未匹配）`],
    ['项目', trace.projectName ?? `${v.projectId}（未匹配）`],
    ['费用科目', trace.categoryName ?? `${v.categoryId}（未匹配）`],
    ['金额(元)', v.amount],
    ['记账月份', v.month],
    ['日期', v.date],
    ['采购单号', v.source.poNo],
    ['发票号', v.source.invoiceNo],
    ['供应商', v.source.vendor],
    ['提交人', v.source.submittedBy],
    ['提交日期', v.source.submittedAt],
    ['审批环节', v.source.approvalStep],
    ['关联凭证', trace.related.map((r) => `${r.relation}:${r.voucher.id}`).join(' | ') || '无'],
  ];
  downloadText(`凭证追溯-${v.id}.csv`, toCsv(headers, rows));
}
