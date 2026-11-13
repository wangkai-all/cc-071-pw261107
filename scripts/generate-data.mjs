/**
 * Generates the deterministic demo dataset.
 *
 * No financial system is connected: every record below is fabricated, but the
 * relationships are strict (voucher sums reconcile to line actuals, transfer
 * legs net to zero, cancelled commitments are excluded from occupancy).
 */
import { writeFileSync } from 'node:fs';

const YEAR = 2026;
const LAST_ACTUAL_MONTH = 10;
const SEED = 20261113;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const jitter = (pct) => 1 + (rand() * 2 - 1) * pct;
const round = (n, step = 100) => Math.round(n / step) * step;

const departments = [
  { id: 'D01', name: '研发中心', owner: '李敏', colorIndex: 1 },
  { id: 'D02', name: '市场营销部', owner: '周航', colorIndex: 2 },
  { id: 'D03', name: '产品运营部', owner: '陈思', colorIndex: 3 },
  { id: 'D04', name: '人力行政部', owner: '王倩', colorIndex: 4 },
  { id: 'D05', name: '财务法务部', owner: '赵磊', colorIndex: 5 },
];

const projects = [
  { id: 'P0101', deptId: 'D01', name: '智能客服平台', target: 24_000_000, startMonth: 1 },
  { id: 'P0102', deptId: 'D01', name: '数据中台二期', target: 18_000_000, startMonth: 3 },
  { id: 'P0103', deptId: 'D01', name: '基础架构升级', target: 12_000_000, startMonth: 1 },
  { id: 'P0201', deptId: 'D02', name: '品牌增长计划', target: 16_000_000, startMonth: 1 },
  { id: 'P0202', deptId: 'D02', name: '渠道投放', target: 14_000_000, startMonth: 1 },
  { id: 'P0301', deptId: 'D03', name: '会员运营', target: 12_000_000, startMonth: 1 },
  { id: 'P0302', deptId: 'D03', name: '内容生态', target: 9_000_000, startMonth: 4 },
  { id: 'P0401', deptId: 'D04', name: '人才发展', target: 7_000_000, startMonth: 1 },
  { id: 'P0402', deptId: 'D04', name: '职场与设施', target: 6_000_000, startMonth: 1 },
  { id: 'P0501', deptId: 'D05', name: '财务共享中心', target: 5_000_000, startMonth: 1 },
  { id: 'P0502', deptId: 'D05', name: '合规与审计', target: 4_000_000, startMonth: 2 },
  { id: 'P0503', deptId: 'D05', name: '年度预备费', target: 6_000_000, startMonth: 1, reserve: true },
];

const categories = [
  { id: 'C01', name: '人力成本', group: '人员' },
  { id: 'C02', name: '软件与订阅', group: '技术' },
  { id: 'C03', name: '外包服务', group: '技术' },
  { id: 'C04', name: '市场投放', group: '增长' },
  { id: 'C05', name: '差旅与会议', group: '运营' },
  { id: 'C06', name: '设备与采购', group: '资产' },
  { id: 'C07', name: '培训与认证', group: '人员' },
  { id: 'C08', name: '预备与调整', group: '预算池' },
];

// Category mix per project type, used to split each project target into lines.
const MIX = {
  P0101: { C01: 0.58, C02: 0.1, C03: 0.22, C05: 0.05, C07: 0.05 },
  P0102: { C01: 0.5, C02: 0.14, C03: 0.24, C06: 0.08, C05: 0.04 },
  P0103: { C01: 0.32, C02: 0.18, C06: 0.38, C03: 0.08, C05: 0.04 },
  P0201: { C01: 0.3, C04: 0.5, C05: 0.08, C03: 0.07, C06: 0.05 },
  P0202: { C01: 0.18, C04: 0.66, C03: 0.08, C05: 0.08 },
  P0301: { C01: 0.42, C02: 0.12, C03: 0.26, C04: 0.1, C05: 0.1 },
  P0302: { C01: 0.35, C04: 0.3, C03: 0.2, C05: 0.1, C07: 0.05 },
  P0401: { C01: 0.45, C07: 0.3, C05: 0.15, C03: 0.1 },
  P0402: { C01: 0.25, C06: 0.45, C02: 0.1, C05: 0.2 },
  P0501: { C01: 0.5, C02: 0.28, C03: 0.12, C05: 0.1 },
  P0502: { C01: 0.4, C03: 0.3, C05: 0.2, C07: 0.1 },
  P0503: { C08: 1 },
};

// Spend rhythm by category across the 12 months.
const PATTERN = {
  C01: [0.075, 0.075, 0.08, 0.08, 0.08, 0.082, 0.083, 0.085, 0.085, 0.085, 0.09, 0.09],
  C02: [0.07, 0.075, 0.08, 0.085, 0.085, 0.085, 0.085, 0.085, 0.085, 0.085, 0.09, 0.09],
  C03: [0.06, 0.07, 0.08, 0.085, 0.09, 0.09, 0.085, 0.09, 0.09, 0.09, 0.08, 0.08],
  C04: [0.05, 0.05, 0.07, 0.09, 0.11, 0.11, 0.09, 0.09, 0.08, 0.1, 0.08, 0.08],
  C05: [0.05, 0.06, 0.09, 0.1, 0.11, 0.1, 0.06, 0.06, 0.08, 0.11, 0.09, 0.09],
  C06: [0.04, 0.05, 0.09, 0.1, 0.08, 0.1, 0.12, 0.1, 0.08, 0.11, 0.07, 0.06],
  C07: [0.06, 0.08, 0.1, 0.1, 0.09, 0.09, 0.1, 0.08, 0.08, 0.1, 0.06, 0.06],
  C08: Array(12).fill(1 / 12),
};

const PRESSURE = { D01: 1.03, D02: 1.3, D03: 1.0, D04: 0.82, D05: 0.92 };

const baselineLines = [];
const monthlyTargets = new Map(); // key -> month target array

for (const project of projects) {
  const mix = MIX[project.id];
  let allocated = 0;
  const catIds = Object.keys(mix);
  catIds.forEach((catId, idx) => {
    const share = mix[catId];
    let amount = round(project.target * share, 10_000);
    if (idx === catIds.length - 1) amount = project.target - allocated;
    allocated += amount;
    const entry = {
      deptId: project.deptId,
      projectId: project.id,
      categoryId: catId,
      amount,
}
    baselineLines.push(entry);
  });
}

// Monthly plan per line, normalised over the months the project is active.
for (const line of baselineLines) {
  const project = projects.find((p) => p.id === line.projectId);
  const pattern = PATTERN[line.categoryId];
  const active = pattern.map((w, i) => (i + 1 >= project.startMonth ? w : 0));
  const total = active.reduce((a, b) => a + b, 0);
  const monthly = active.map((w) => (w ? (line.amount * w) / total : 0));
  monthlyTargets.set(`${line.deptId}|${line.projectId}|${line.categoryId}`, monthly);
}

// Attach the phasing to each baseline line, with the last month absorbing
// rounding so the twelve months always sum exactly to the annual amount.
for (const line of baselineLines) {
  const monthly = monthlyTargets.get(`${line.deptId}|${line.projectId}|${line.categoryId}`);
  const rounded = monthly.map((v) => Math.round(v));
  const drift = line.amount - rounded.reduce((a, b) => a + b, 0);
  const lastActive = rounded.reduce((last, v, i) => (v > 0 ? i : last), 0);
  rounded[lastActive] += drift;
  line.monthly = rounded;
}

const vouchers = [];
const commitments = [];

const people = ['刘洋', '孙悦', '郑凯', '何静', '杨帆', '吴桐', '徐宁', '马骁'];
const vendors = {
  C01: ['中智人力', '前程无忧', '智联招聘'],
  C02: ['阿里云', '飞书', 'Atlassian', '金山办公'],
  C03: ['软通动力', '中软国际', '博彦科技'],
  C04: ['分众传媒', '巨量引擎', '小红书', '腾讯广告'],
  C05: ['携程商旅', '国航', '华住会'],
  C06: ['联想', '戴尔', '京东企业购'],
  C07: ['极客时间', '三节课', 'PMI'],
  C08: ['预算委员会'],
};

let voucherSeq = 0;
let commitmentSeq = 0;

function sourceDocs(catId, month) {
  return {
    poNo: `PO-${YEAR}-${String(1000 + Math.floor(rand() * 8000))}`,
    invoiceNo: `INV-${YEAR}-${String(20000 + Math.floor(rand() * 60000))}`,
    submittedBy: people[Math.floor(rand() * people.length)],
    submittedAt: `${YEAR}-${String(month).padStart(2, '0')}-${String(5 + Math.floor(rand() * 22)).padStart(2, '0')}`,
    approvalStep: rand() > 0.55 ? '两级审批' : '单级审批',
    vendor: vendors[catId][Math.floor(rand() * vendors[catId].length)],
  };
}

for (const line of baselineLines) {
  const key = `${line.deptId}|${line.projectId}|${line.categoryId}`;
  const monthly = monthlyTargets.get(key);
  const pressure = PRESSURE[line.deptId] ?? 1;
  const project = projects.find((p) => p.id === line.projectId);
  // The reserve pool is a budget holder, not a spending programme: no vouchers
  // or commitments are generated against it, only adjustments move money in/out.
  if (project.reserve) continue;

  for (let m = 1; m <= LAST_ACTUAL_MONTH; m += 1) {
    if (m < project.startMonth) continue;
    const target = monthly[m - 1] * pressure * jitter(0.16);
    if (target < 20_000) continue;
    const amount = round(target, 100);
    const docs = sourceDocs(line.categoryId, m);
    voucherSeq += 1;
    vouchers.push({
      id: `V-${YEAR}-${String(voucherSeq).padStart(5, '0')}`,
      deptId: line.deptId,
      projectId: line.projectId,
      categoryId: line.categoryId,
      amount,
      month: m,
      date: `${YEAR}-${String(m).padStart(2, '0')}-${String(10 + Math.floor(rand() * 16)).padStart(2, '0')}`,
      kind: 'expense',
      reversalOf: null,
      duplicateOf: null,
      posted: true,
      source: docs,
    });

    // Large lines get split invoices, so tracing shows a realistic trail.
    if (amount > 400_000 && rand() > 0.45) {
      const split = round(amount * (0.35 + rand() * 0.2), 100);
      vouchers[vouchers.length - 1].amount = amount - split;
      voucherSeq += 1;
      const splitDocs = sourceDocs(line.categoryId, m);
      splitDocs.invoiceNo = docs.invoiceNo + '-B';
      vouchers.push({
        id: `V-${YEAR}-${String(voucherSeq).padStart(5, '0')}`,
        deptId: line.deptId,
        projectId: line.projectId,
        categoryId: line.categoryId,
        amount: split,
        month: m,
        date: `${YEAR}-${String(m).padStart(2, '0')}-${String(10 + Math.floor(rand() * 16)).padStart(2, '0')}`,
        kind: 'expense',
        reversalOf: null,
        duplicateOf: null,
        posted: true,
        source: splitDocs,
      });
    }
  }

  // Outstanding commitments for the remaining months.
  const openShare = 0.035 + rand() * 0.075;
  const openAmount = round(line.amount * openShare, 1000);
  if (openAmount > 50_000) {
    const expectedMonth = rand() > 0.5 ? 11 : 12;
    commitmentSeq += 1;
    commitments.push({
      id: `CM-${YEAR}-${String(commitmentSeq).padStart(4, '0')}`,
      deptId: line.deptId,
      projectId: line.projectId,
      categoryId: line.categoryId,
      amount: openAmount,
      createdMonth: 9 + (expectedMonth === 12 ? 1 : 0),
      expectedMonth,
      status: 'open',
      cancelledAt: null,
      cancelReason: null,
      vendor: vendors[line.categoryId][Math.floor(rand() * vendors[line.categoryId].length)],
      poNo: `PO-${YEAR}-${String(9000 + commitmentSeq)}`,
    });
  }
}

// A cancelled commitment that must stop occupying budget (and be visible).
commitmentSeq += 1;
commitments.push({
  id: `CM-${YEAR}-${String(commitmentSeq).padStart(4, '0')}`,
  deptId: 'D04',
  projectId: 'P0402',
  categoryId: 'C06',
  amount: 1_800_000,
  createdMonth: 8,
  expectedMonth: 11,
  status: 'cancelled',
  cancelledAt: `${YEAR}-10-08`,
  cancelReason: '办公场地扩容计划取消',
  vendor: '京东企业购',
  poNo: `PO-${YEAR}-${String(9000 + commitmentSeq)}`,
});
commitmentSeq += 1;
commitments.push({
  id: `CM-${YEAR}-${String(commitmentSeq).padStart(4, '0')}`,
  deptId: 'D02',
  projectId: 'P0202',
  categoryId: 'C04',
  amount: 2_400_000,
  createdMonth: 9,
  expectedMonth: 12,
  status: 'cancelled',
  cancelledAt: `${YEAR}-10-21`,
  cancelReason: '渠道档期调整，投放取消',
  vendor: '巨量引擎',
  poNo: `PO-${YEAR}-${String(9000 + commitmentSeq)}`,
});

// Duplicate vouchers: kept in the ledger for review, excluded from actuals.
const duplicateBases = ['V-2026-00109', 'V-2026-00242', 'V-2026-00387'];
const realDuplicates = [];
duplicateBases.forEach((baseId) => {
  const base = vouchers.find((v) => v.id === baseId);
  if (!base) return;
  voucherSeq += 1;
  const dup = {
    ...base,
    id: `V-${YEAR}-${String(voucherSeq).padStart(5, '0')}`,
    kind: 'duplicate',
    duplicateOf: base.id,
    posted: false,
    source: { ...base.source, invoiceNo: base.source.invoiceNo, submittedBy: '系统对账' },
  };
  vouchers.push(dup);
  realDuplicates.push(dup);
});

// Reversal vouchers: negative entries that net out the original invoice.
const reversalBases = ['V-2026-00136', 'V-2026-00324'];
const realReversals = [];
reversalBases.forEach((baseId) => {
  const base = vouchers.find((v) => v.id === baseId);
  if (!base) return;
  voucherSeq += 1;
  const rev = {
    ...base,
    id: `V-${YEAR}-${String(voucherSeq).padStart(5, '0')}`,
    amount: -base.amount,
    kind: 'reversal',
    reversalOf: base.id,
    month: Math.min(base.month + 1, LAST_ACTUAL_MONTH),
    date: `${YEAR}-${String(Math.min(base.month + 1, LAST_ACTUAL_MONTH)).padStart(2, '0')}-04`,
    source: {
      ...base.source,
      invoiceNo: `RED-${base.source.invoiceNo}`,
      submittedBy: '财务复核',
      approvalStep: '红字冲销审批',
    },
  };
  vouchers.push(rev);
  realReversals.push(rev);
});

// Vouchers whose department is not in the master data: never silently dropped.
const unmatchedSeeds = [
  { month: 3, amount: 386_000, categoryId: 'C03', projectId: 'P0901', vendor: '未登记供应商' },
  { month: 6, amount: 218_500, categoryId: 'C05', projectId: 'P0902', vendor: '携程商旅' },
  { month: 9, amount: 742_000, categoryId: 'C02', projectId: 'P0903', vendor: '阿里云' },
  { month: 10, amount: 96_400, categoryId: 'C07', projectId: 'P0904', vendor: '极客时间' },
];
unmatchedSeeds.forEach((seed, idx) => {
  voucherSeq += 1;
  vouchers.push({
    id: `V-${YEAR}-${String(voucherSeq).padStart(5, '0')}`,
    deptId: 'D90',
    projectId: seed.projectId,
    categoryId: seed.categoryId,
    amount: seed.amount,
    month: seed.month,
    date: `${YEAR}-${String(seed.month).padStart(2, '0')}-${String(12 + idx * 3).padStart(2, '0')}`,
    kind: 'expense',
    reversalOf: null,
    duplicateOf: null,
    posted: true,
    source: {
      poNo: `PO-${YEAR}-${8000 + idx}`,
      invoiceNo: `INV-${YEAR}-${70000 + idx}`,
      submittedBy: '接口导入',
      submittedAt: `${YEAR}-${String(seed.month).padStart(2, '0')}-${String(12 + idx * 3).padStart(2, '0')}`,
      approvalStep: '未匹配成本中心',
      vendor: seed.vendor,
    },
  });
});

const baselineTotal = baselineLines.reduce((sum, l) => sum + l.amount, 0);

const lineByKey = new Map(baselineLines.map((l) => [`${l.deptId}|${l.projectId}|${l.categoryId}`, l]));
const lineAmount = (deptId, projectId, categoryId) => {
  const line = lineByKey.get(`${deptId}|${projectId}|${categoryId}`);
  if (!line) throw new Error(`adjustment references unknown line ${deptId}/${projectId}/${categoryId}`);
  return line.amount;
};

// Adjustments are declarative: deltas are applied to the generated baseline so
// the before/after figures always reconcile with the approved baseline version.
const budgetAdjustments = [
  {
    id: 'BA-2026-01',
    type: 'adjustment',
    title: '智能客服平台扩容追加',
    requestedBy: '李敏',
    requestedAt: '2026-02-10',
    approvedAt: '2026-02-18',
    approver: '预算委员会',
    status: 'approved',
    effectiveMonth: 3,
    memo: '客服并发量增长，追加外包与软件订阅预算，从年度预备费列支。',
    lines: [
      { deptId: 'D01', projectId: 'P0101', categoryId: 'C03', delta: 1_200_000 },
      { deptId: 'D01', projectId: 'P0101', categoryId: 'C02', delta: 600_000 },
      { deptId: 'D05', projectId: 'P0503', categoryId: 'C08', delta: -1_800_000, reserveDraw: true },
    ],
  },
  {
    id: 'BA-2026-02',
    type: 'transfer',
    title: '运营支持市场双十一投放',
    requestedBy: '周航',
    requestedAt: '2026-06-28',
    approvedAt: '2026-07-06',
    approver: 'CFO 办公室',
    status: 'approved',
    effectiveMonth: 8,
    memo: '跨部门预算转移：产品运营让渡内容生态外包预算，市场营销承接投放。转出与转入同时入账。',
    lines: [
      { deptId: 'D03', projectId: 'P0302', categoryId: 'C03', delta: -1_200_000, leg: '转出' },
      { deptId: 'D02', projectId: 'P0202', categoryId: 'C04', delta: 1_200_000, leg: '转入' },
    ],
  },
  {
    id: 'BA-2026-03',
    type: 'adjustment',
    title: '基础架构升级范围收缩',
    requestedBy: '李敏',
    requestedAt: '2026-08-20',
    approvedAt: '2026-09-01',
    approver: '预算委员会',
    status: 'approved',
    effectiveMonth: 10,
    memo: '服务器采购延后至下一年度，释放设备预算回到预备费。',
    lines: [
      { deptId: 'D01', projectId: 'P0103', categoryId: 'C06', delta: -800_000 },
      { deptId: 'D05', projectId: 'P0503', categoryId: 'C08', delta: 800_000, reserveReturn: true },
    ],
  },
  {
    id: 'BA-2026-04',
    type: 'adjustment',
    title: '人才发展专项追加（待审批）',
    requestedBy: '王倩',
    requestedAt: '2026-10-30',
    approvedAt: null,
    approver: '预算委员会',
    status: 'pending',
    effectiveMonth: 12,
    memo: '关键岗位认证计划扩容，审批通过后 12 月生效。未审批前不计入生效预算。',
    lines: [
      { deptId: 'D04', projectId: 'P0401', categoryId: 'C07', delta: 600_000 },
      { deptId: 'D05', projectId: 'P0503', categoryId: 'C08', delta: -600_000, reserveDraw: true },
    ],
  },
].map((adj) => ({
  ...adj,
  lines: adj.lines.map((line) => ({
    ...line,
    before: lineAmount(line.deptId, line.projectId, line.categoryId),
    after: lineAmount(line.deptId, line.projectId, line.categoryId) + line.delta,
  })),
}));

// Sanity checks: transfer legs must net to zero, baseline total matches lines.
for (const adj of budgetAdjustments) {
  if (adj.type === 'transfer' && adj.status === 'approved') {
    const net = adj.lines.reduce((sum, l) => sum + l.delta, 0);
    if (net !== 0) throw new Error(`transfer ${adj.id} legs do not net to zero: ${net}`);
  }
}

const dataset = {
  meta: {
    year: YEAR,
    asOf: `${YEAR}-11-13`,
    lastActualMonth: LAST_ACTUAL_MONTH,
    currency: 'CNY',
    unit: '元',
    source: '演示数据集（未接入财务系统）',
    generatedAt: '2026-11-13',
    baselineVersion: 'BV-2026-00',
    baselineApprovedAt: '2025-12-20',
    baselineTotal,
  },
  departments,
  projects,
  categories,
  baseline: {
    version: 'BV-2026-00',
    approvedAt: '2025-12-20',
    effectiveMonth: 1,
    status: 'approved',
    lines: baselineLines,
  },
  budgetAdjustments,
  commitments,
  vouchers,
};

writeFileSync(new URL('../src/data/dataset.json', import.meta.url), JSON.stringify(dataset, null, 2) + '\n');
console.log(
  `dataset: ${departments.length} depts, ${projects.length} projects, ${baselineLines.length} lines, ` +
    `${vouchers.length} vouchers, ${commitments.length} commitments, budget ¥${(baselineTotal / 1e6).toFixed(1)}M`,
);
