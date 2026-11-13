/**
 * Budget engine — pure functions, no React, no DOM.
 *
 * Every figure in the dashboard is derived here, from one line-level model.
 * KPIs, the timeline, the hierarchy table and the scenario comparison all sit
 * on the same `filterLines` predicate, so a filter change can never make one
 * view disagree with another.
 *
 * Definitions (also surfaced in the UI):
 *  - Budget       approved baseline version + approved adjustments effective by
 *                 the as-of month. Pending adjustments are shown but never counted.
 *  - Actual       posted expense vouchers, plus reversals (negative). Duplicates
 *                 are excluded and reported in the exceptions tab.
 *  - Commitments  open purchase commitments expected within the year. Cancelled
 *                 commitments are excluded from every total.
 *  - Forecast     new spend after the as-of month, from the last N months' run
 *                 rate, optional monthly growth, per-department manual factors.
 *                 Where an open commitment already covers a future month, the
 *                 forecast tops up to it instead of counting it twice.
 *  - Year-end     actual + open commitments + forecast new spend.
 *  - Balance      budget - year-end spend. Negative means over budget.
 */

export const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const sum = (values) => values.reduce((a, b) => a + b, 0);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function lineKey(deptId, projectId, categoryId) {
  return `${deptId}|${projectId}|${categoryId}`;
}

function phasedBudget(baselineMonthly, effectiveAdjustments) {
  const monthly = baselineMonthly.slice();
  for (const adjustment of effectiveAdjustments) {
    const start = clamp(adjustment.effectiveMonth, 1, 12);
    const months = 12 - start + 1;
    for (let m = start; m <= 12; m += 1) monthly[m - 1] += adjustment.delta / months;
  }
  return monthly;
}

export function createModel(dataset, options = {}) {
  const asOfMonth = clamp(options.asOfMonth ?? dataset.meta.lastActualMonth, 1, 12);
  const deptMap = new Map(dataset.departments.map((d) => [d.id, d]));
  const projectMap = new Map(dataset.projects.map((p) => [p.id, p]));
  const categoryMap = new Map(dataset.categories.map((c) => [c.id, c]));

  const adjustmentsByLine = new Map();
  for (const adjustment of dataset.budgetAdjustments) {
    for (const line of adjustment.lines) {
      const key = lineKey(line.deptId, line.projectId, line.categoryId);
      if (!adjustmentsByLine.has(key)) adjustmentsByLine.set(key, []);
      adjustmentsByLine.get(key).push({
        id: adjustment.id,
        title: adjustment.title,
        type: adjustment.type,
        status: adjustment.status,
        effectiveMonth: adjustment.effectiveMonth,
        approvedAt: adjustment.approvedAt,
        delta: line.delta,
      });
    }
  }

  const lines = dataset.baseline.lines.map((line) => {
    const key = lineKey(line.deptId, line.projectId, line.categoryId);
    const allAdjustments = adjustmentsByLine.get(key) ?? [];
    const effective = allAdjustments.filter(
      (a) => a.status === 'approved' && a.effectiveMonth <= asOfMonth,
    );
    const monthlyBudget = phasedBudget(line.monthly, effective);
    return {
      key,
      deptId: line.deptId,
      projectId: line.projectId,
      categoryId: line.categoryId,
      baseline: line.amount,
      budget: sum(monthlyBudget),
      monthlyBudget,
      adjustments: allAdjustments,
      monthlyActual: Array(12).fill(0),
      monthlyCommitment: Array(12).fill(0),
      actualYtd: 0,
      openCommitTotal: 0,
      voucherIds: [],
      commitmentIds: [],
      activityMonths: [],
    };
  });
  const lineMap = new Map(lines.map((l) => [l.key, l]));

  const exceptions = {
    unmatched: [],
    duplicates: [],
    reversals: [],
    cancelledCommitments: [],
  };

  for (const voucher of dataset.vouchers) {
    const known =
      deptMap.has(voucher.deptId) &&
      projectMap.has(voucher.projectId) &&
      categoryMap.has(voucher.categoryId);
    const line = lineMap.get(lineKey(voucher.deptId, voucher.projectId, voucher.categoryId));
    if (!known || !line) {
      exceptions.unmatched.push({
        ...voucher,
        reason: [
          !deptMap.has(voucher.deptId) && '部门未匹配',
          !projectMap.has(voucher.projectId) && '项目未匹配',
          !categoryMap.has(voucher.categoryId) && '科目未匹配',
        ]
          .filter(Boolean)
          .join('、'),
      });
      continue;
    }
    if (voucher.kind === 'duplicate') {
      exceptions.duplicates.push(voucher);
      continue;
    }
    if (voucher.kind === 'reversal') exceptions.reversals.push(voucher);
    if (!voucher.posted || voucher.month > asOfMonth) continue;
    const m = clamp(voucher.month, 1, 12);
    line.monthlyActual[m - 1] += voucher.amount; // reversals carry a negative amount
    line.actualYtd += voucher.amount;
    line.voucherIds.push(voucher.id);
  }

  for (const commitment of dataset.commitments) {
    if (commitment.status !== 'open') {
      if (commitment.status === 'cancelled') exceptions.cancelledCommitments.push(commitment);
      continue;
    }
    const line = lineMap.get(lineKey(commitment.deptId, commitment.projectId, commitment.categoryId));
    if (!line) continue;
    const month = clamp(commitment.expectedMonth, asOfMonth + 1, 12);
    line.monthlyCommitment[month - 1] += commitment.amount;
    line.openCommitTotal += commitment.amount;
    line.commitmentIds.push(commitment.id);
  }

  for (const line of lines) {
    line.activityMonths = MONTHS.filter(
      (m) => m <= asOfMonth && (line.monthlyBudget[m - 1] > 0 || line.monthlyActual[m - 1] !== 0),
    );
  }

  const versions = [
    {
      id: dataset.baseline.version,
      label: '年度预算基线',
      type: 'baseline',
      status: 'approved',
      approvedAt: dataset.baseline.approvedAt,
      approver: '董事会',
      effectiveMonth: dataset.baseline.effectiveMonth,
      totalBefore: null,
      totalAfter: sum(dataset.baseline.lines.map((l) => l.amount)),
      totalDelta: 0,
      totalIncrease: 0,
      totalDecrease: 0,
      lines: [],
    },
    ...dataset.budgetAdjustments.map((adj) => ({
      id: adj.id,
      label: adj.title,
      type: adj.type,
      status: adj.status,
      requestedBy: adj.requestedBy,
      requestedAt: adj.requestedAt,
      approvedAt: adj.approvedAt,
      approver: adj.approver,
      effectiveMonth: adj.effectiveMonth,
      memo: adj.memo,
      totalBefore: sum(adj.lines.map((l) => l.before)),
      totalAfter: sum(adj.lines.map((l) => l.after)),
      totalDelta: sum(adj.lines.map((l) => l.delta)),
      // A transfer or a reserve-funded adjustment nets to zero overall; the
      // gross increase/decrease still shows how much budget actually moved.
      totalIncrease: sum(adj.lines.filter((l) => l.delta > 0).map((l) => l.delta)),
      totalDecrease: sum(adj.lines.filter((l) => l.delta < 0).map((l) => l.delta)),
      lines: adj.lines.map((l) => ({
        ...l,
        deptName: deptMap.get(l.deptId)?.name ?? l.deptId,
        projectName: projectMap.get(l.projectId)?.name ?? l.projectId,
        categoryName: categoryMap.get(l.categoryId)?.name ?? l.categoryId,
      })),
    })),
  ];

  const totals = lines.reduce(
    (acc, line) => {
      acc.budget += line.budget;
      acc.actual += line.actualYtd;
      acc.commitments += line.openCommitTotal;
      return acc;
    },
    { budget: 0, actual: 0, commitments: 0 },
  );

  return {
    dataset,
    year: dataset.meta.year,
    asOfMonth,
    lastActualMonth: dataset.meta.lastActualMonth,
    deptMap,
    projectMap,
    categoryMap,
    lines,
    lineMap,
    versions,
    exceptions: {
      ...exceptions,
      counts: {
        unmatched: exceptions.unmatched.length,
        duplicates: exceptions.duplicates.length,
        reversals: exceptions.reversals.length,
        cancelledCommitments: exceptions.cancelledCommitments.length,
      },
      totals: {
        unmatched: sum(exceptions.unmatched.map((v) => v.amount)),
        duplicates: sum(exceptions.duplicates.map((v) => v.amount)),
        reversals: sum(exceptions.reversals.map((v) => v.amount)),
        cancelledCommitments: sum(exceptions.cancelledCommitments.map((c) => c.amount)),
      },
    },
    totals,
  };
}

export function filterLines(model, filters = {}) {
  const deptIds = filters.deptIds?.length ? new Set(filters.deptIds) : null;
  const projectIds = filters.projectIds?.length ? new Set(filters.projectIds) : null;
  const categoryIds = filters.categoryIds?.length ? new Set(filters.categoryIds) : null;
  return model.lines.filter(
    (line) =>
      (!deptIds || deptIds.has(line.deptId)) &&
      (!projectIds || projectIds.has(line.projectId)) &&
      (!categoryIds || categoryIds.has(line.categoryId)),
  );
}

export function aggregate(lines) {
  return lines.reduce(
    (acc, line) => {
      acc.budget += line.budget;
      acc.baseline += line.baseline;
      acc.actual += line.actualYtd;
      acc.commitments += line.openCommitTotal;
      acc.count += 1;
      return acc;
    },
    { budget: 0, baseline: 0, actual: 0, commitments: 0, count: 0 },
  );
}

/**
 * Run-rate forecast of *new* spend (spend not already covered by an open
 * commitment), per month, January..December. Months at or before the as-of
 * month are zero: they are actuals, not forecast.
 *
 * Per line, the remaining run-rate expectation and the remaining committed
 * amount cover the same underlying spend, so they are not added together:
 * expected remaining spend is max(run-rate, commitments). Only the top-up is
 * "new spend"; spreading it proportionally over the remaining months keeps the
 * projection from jumping in months where a commitment happens to land.
 */
export function forecastLine(model, line, scenario) {
  const asOf = model.asOfMonth;
  const lookback = clamp(scenario.lookback ?? 3, 1, 12);
  const historyMonths = line.activityMonths.filter((m) => m > asOf - lookback);
  const history = sum(historyMonths.map((m) => line.monthlyActual[m - 1]));
  const runRate = historyMonths.length ? history / historyMonths.length : 0;

  const growth = 1 + (scenario.growthPct ?? 0) / 100;
  const deptMultiplier = 1 + (scenario.deptMultipliers?.[line.deptId] ?? 0) / 100;

  const futureMonths = MONTHS.filter((m) => m > asOf);
  const baseByMonth = new Map();
  const commitmentByMonth = new Map();
  let baseTotal = 0;
  let commitmentTotal = 0;

  for (const m of futureMonths) {
    const step = m - asOf;
    const planned = line.monthlyBudget[m - 1];
    const base = planned > 0 ? runRate * Math.pow(growth, step) * deptMultiplier : 0;
    const commitment = scenario.includeCommitments === false ? 0 : line.monthlyCommitment[m - 1];
    baseByMonth.set(m, scenario.includeNewSpend === false ? 0 : base);
    commitmentByMonth.set(m, commitment);
    baseTotal += baseByMonth.get(m);
    commitmentTotal += commitment;
  }

  const expectedTotal = Math.max(baseTotal, commitmentTotal);
  const newSpendTotal = Math.max(0, expectedTotal - commitmentTotal);

  const monthly = Array(12).fill(0);
  const commitmentCovered = Array(12).fill(0);
  for (const m of futureMonths) {
    commitmentCovered[m - 1] = commitmentByMonth.get(m);
    if (baseTotal > 0) {
      monthly[m - 1] = newSpendTotal * (baseByMonth.get(m) / baseTotal);
    } else if (futureMonths.length) {
      monthly[m - 1] = newSpendTotal / futureMonths.length;
    }
  }
  return {
    monthly,
    commitmentCovered,
    runRate,
    historyMonths: historyMonths.length,
    expectedTotal,
  };
}

export function forecastLineTotals(model, lines, scenario) {
  const totals = Array(12).fill(0);
  for (const line of lines) {
    const forecast = forecastLine(model, line, scenario);
    for (let m = 0; m < 12; m += 1) totals[m] += forecast.monthly[m];
  }
  return totals;
}

export function evaluate(model, lines, scenario) {
  let actual = 0;
  let commitments = 0;
  let budget = 0;
  let forecastTotal = 0;
  const forecastMonthly = Array(12).fill(0);

  for (const line of lines) {
    const forecast = forecastLine(model, line, scenario);
    budget += line.budget;
    actual += line.actualYtd;
    commitments += line.openCommitTotal;
    for (let m = 0; m < 12; m += 1) {
      forecastTotal += forecast.monthly[m];
      forecastMonthly[m] += forecast.monthly[m];
    }
  }

  const yearEndSpend = actual + commitments + forecastTotal;
  const balance = budget - yearEndSpend;
  return {
    budget,
    actual,
    commitments,
    forecastTotal,
    forecastMonthly,
    yearEndSpend,
    balance,
    utilization: budget ? (actual + commitments) / budget : 0,
    overspend: balance < 0,
  };
}

/** Monthly timeline: budget, actual and scheduled commitments are cumulative;
 *  forecast is the cumulative new-spend projection beyond the as-of month. */
export function timeline(model, lines, scenario) {
  const monthlyBudget = Array(12).fill(0);
  const monthlyActual = Array(12).fill(0);
  const monthlyCommitment = Array(12).fill(0);

  for (const line of lines) {
    for (let m = 0; m < 12; m += 1) {
      monthlyBudget[m] += line.monthlyBudget[m];
      monthlyActual[m] += line.monthlyActual[m];
      monthlyCommitment[m] += line.monthlyCommitment[m];
    }
  }
  const monthlyForecast = forecastLineTotals(model, lines, scenario);

  const rows = [];
  let budget = 0;
  let actual = 0;
  let commitments = 0;
  let forecast = 0;
  for (let m = 1; m <= 12; m += 1) {
    budget += monthlyBudget[m - 1];
    actual += monthlyActual[m - 1];
    commitments += monthlyCommitment[m - 1];
    forecast += monthlyForecast[m - 1];
    rows.push({
      month: m,
      isActual: m <= model.asOfMonth,
      monthlyBudget: monthlyBudget[m - 1],
      monthlyActual: monthlyActual[m - 1],
      monthlyCommitment: monthlyCommitment[m - 1],
      monthlyForecast: monthlyForecast[m - 1],
      budget,
      actual,
      commitments,
      forecast,
      occupancy: actual + commitments + forecast,
      remaining: budget - actual - commitments - forecast,
    });
  }
  return rows;
}

export const SCENARIO_PRESETS = [
  {
    id: 'base',
    name: '基准方案',
    description: '最近 3 个月节奏，无额外增长',
    lookback: 3,
    growthPct: 0,
    includeCommitments: true,
    includeNewSpend: true,
    deptMultipliers: {},
  },
  {
    id: 'conservative',
    name: '审慎方案',
    description: '最近 6 个月节奏，每月递增 2%',
    lookback: 6,
    growthPct: 2,
    includeCommitments: true,
    includeNewSpend: true,
    deptMultipliers: {},
  },
  {
    id: 'manual',
    name: '手工方案',
    description: '自定义回看窗口、增长率与部门系数',
    lookback: 4,
    growthPct: -1,
    includeCommitments: true,
    includeNewSpend: true,
    deptMultipliers: {},
  },
];

export function scenarioResults(model, lines, scenarios, baseId = 'base') {
  const results = scenarios.map((scenario) => ({
    ...scenario,
    result: evaluate(model, lines, scenario),
  }));
  const base = results.find((r) => r.id === baseId)?.result;
  return results.map((entry) => ({
    ...entry,
    varianceVsBase: base ? entry.result.balance - base.balance : 0,
  }));
}

/** Department / project / category rollup for the expandable table. */
export function rollup(model, lines, scenario) {
  const result = evaluate(model, lines, scenario);
  const depts = new Map();
  const projects = new Map();
  const categories = new Map();

  for (const line of lines) {
    const forecast = forecastLine(model, line, scenario);
    const forecastTotal = sum(forecast.monthly);
    const row = {
      budget: line.budget,
      actual: line.actualYtd,
      commitments: line.openCommitTotal,
      forecast: forecastTotal,
      remaining: line.budget - line.actualYtd - line.openCommitTotal - forecastTotal,
      yearEndSpend: line.actualYtd + line.openCommitTotal + forecastTotal,
      utilization: line.budget ? (line.actualYtd + line.openCommitTotal) / line.budget : 0,
    };

    if (!depts.has(line.deptId)) {
      depts.set(line.deptId, {
        id: line.deptId,
        name: model.deptMap.get(line.deptId)?.name ?? line.deptId,
        owner: model.deptMap.get(line.deptId)?.owner ?? '',
        budget: 0,
        actual: 0,
        commitments: 0,
        forecast: 0,
        remaining: 0,
        yearEndSpend: 0,
        projectIds: [],
      });
    }
    const dept = depts.get(line.deptId);
    dept.budget += row.budget;
    dept.actual += row.actual;
    dept.commitments += row.commitments;
    dept.forecast += row.forecast;
    dept.remaining += row.remaining;
    dept.yearEndSpend += row.yearEndSpend;
    if (!dept.projectIds.includes(line.projectId)) dept.projectIds.push(line.projectId);

    if (!projects.has(line.projectId)) {
      projects.set(line.projectId, {
        id: line.projectId,
        deptId: line.deptId,
        name: model.projectMap.get(line.projectId)?.name ?? line.projectId,
        reserve: Boolean(model.projectMap.get(line.projectId)?.reserve),
        budget: 0,
        actual: 0,
        commitments: 0,
        forecast: 0,
        remaining: 0,
        yearEndSpend: 0,
        categories: [],
      });
    }
    const project = projects.get(line.projectId);
    project.budget += row.budget;
    project.actual += row.actual;
    project.commitments += row.commitments;
    project.forecast += row.forecast;
    project.remaining += row.remaining;
    project.yearEndSpend += row.yearEndSpend;

    project.categories.push({
      key: line.key,
      id: line.categoryId,
      deptId: line.deptId,
      projectId: line.projectId,
      name: model.categoryMap.get(line.categoryId)?.name ?? line.categoryId,
      group: model.categoryMap.get(line.categoryId)?.group ?? '',
      ...row,
    });

    if (!categories.has(line.categoryId)) {
      categories.set(line.categoryId, {
        id: line.categoryId,
        name: model.categoryMap.get(line.categoryId)?.name ?? line.categoryId,
        budget: 0,
        actual: 0,
        commitments: 0,
        forecast: 0,
        remaining: 0,
      });
    }
    const category = categories.get(line.categoryId);
    category.budget += row.budget;
    category.actual += row.actual;
    category.commitments += row.commitments;
    category.forecast += row.forecast;
    category.remaining += row.remaining;
  }

  return {
    ...result,
    departments: [...depts.values()],
    projects: [...projects.values()],
    categories: [...categories.values()],
  };
}

/** Scenario × department comparison rows, including variance vs the base. */
export function scenarioVarianceRows(model, lines, scenarios, baseId = 'base') {
  const rows = [];
  for (const scenario of scenarios) {
    const byDept = rollup(model, lines, scenario).departments;
    const total = evaluate(model, lines, scenario);
    for (const dept of byDept) {
      rows.push({
        scenarioId: scenario.id,
        scenario: scenario.name,
        lookback: scenario.lookback,
        growthPct: scenario.growthPct,
        deptId: dept.id,
        deptName: dept.name,
        budget: dept.budget,
        actual: dept.actual,
        forecast: dept.forecast,
        commitments: dept.commitments,
        yearEndSpend: dept.yearEndSpend,
        balance: dept.budget - dept.yearEndSpend,
        totalBalance: total.balance,
        baseTotalBalance: 0,
        totalVariance: 0,
        varianceVsBase: 0,
      });
    }
  }
  const baseRows = rows.filter((r) => r.scenarioId === baseId);
  const baseDeptBalance = new Map(baseRows.map((r) => [r.deptId, r.balance]));
  const baseTotal = baseRows[0]?.totalBalance ?? 0;
  for (const row of rows) {
    row.baseTotalBalance = baseTotal;
    row.totalVariance = row.totalBalance - baseTotal;
    row.varianceVsBase = row.balance - (baseDeptBalance.get(row.deptId) ?? row.balance);
  }
  return rows;
}

export function vouchersForLine(model, key) {
  const ids = model.lineMap.get(key)?.voucherIds ?? [];
  return model.dataset.vouchers.filter((v) => ids.includes(v.id));
}

export function voucherTrace(model, voucherId) {
  const vouchers = model.dataset.vouchers;
  const voucher = vouchers.find((v) => v.id === voucherId);
  if (!voucher) return null;
  const related = [];
  if (voucher.duplicateOf) {
    related.push({ relation: '原始凭证', voucher: vouchers.find((v) => v.id === voucher.duplicateOf) });
  }
  if (voucher.reversalOf) {
    related.push({ relation: '被冲销凭证', voucher: vouchers.find((v) => v.id === voucher.reversalOf) });
  }
  for (const other of vouchers) {
    if (other.duplicateOf === voucher.id) related.push({ relation: '重复凭证', voucher: other });
    if (other.reversalOf === voucher.id) related.push({ relation: '冲销凭证', voucher: other });
  }
  const line = model.lineMap.get(lineKey(voucher.deptId, voucher.projectId, voucher.categoryId));
  return {
    voucher,
    related: related.filter((r) => r.voucher),
    deptName: model.deptMap.get(voucher.deptId)?.name ?? null,
    projectName: model.projectMap.get(voucher.projectId)?.name ?? null,
    categoryName: model.categoryMap.get(voucher.categoryId)?.name ?? null,
    lineBudget: line?.budget ?? null,
    lineActual: line?.actualYtd ?? null,
    definition:
      voucher.kind === 'duplicate'
        ? '重复凭证，不计入实际支出'
        : voucher.kind === 'reversal'
          ? '冲销凭证，以负金额计入实际支出'
          : '普通支出凭证，已过账并计入实际支出',
  };
}

/** Structural integrity checks — run in tests and in the UI footer check. */
export function validateDataset(dataset) {
  const errors = [];
  const deptIds = new Set(dataset.departments.map((d) => d.id));
  const projectIds = new Set(dataset.projects.map((p) => p.id));
  const categoryIds = new Set(dataset.categories.map((c) => c.id));
  const deptProject = new Map(dataset.projects.map((p) => [p.id, p.deptId]));

  for (const line of dataset.baseline.lines) {
    if (!deptIds.has(line.deptId)) errors.push(`baseline line has unknown dept ${line.deptId}`);
    if (!projectIds.has(line.projectId)) errors.push(`baseline line has unknown project ${line.projectId}`);
    if (!categoryIds.has(line.categoryId)) errors.push(`baseline line has unknown category ${line.categoryId}`);
    if (deptProject.get(line.projectId) !== line.deptId) {
      errors.push(`project ${line.projectId} sits under a different department than line ${line.deptId}`);
    }
    const phased = line.monthly.reduce((a, b) => a + b, 0);
    if (phased !== line.amount) errors.push(`phasing mismatch on ${line.projectId}/${line.categoryId}`);
  }
  for (const adj of dataset.budgetAdjustments) {
    if (adj.status === 'approved' && adj.type === 'transfer') {
      const net = adj.lines.reduce((a, l) => a + l.delta, 0);
      if (net !== 0) errors.push(`transfer ${adj.id} legs net ${net}, expected 0`);
    }
    const lineMap = new Map(
      dataset.baseline.lines.map((l) => [lineKey(l.deptId, l.projectId, l.categoryId), l]),
    );
    for (const line of adj.lines) {
      const base = lineMap.get(lineKey(line.deptId, line.projectId, line.categoryId));
      if (!base) errors.push(`adjustment ${adj.id} targets a missing line`);
      else if (base.amount !== line.before) {
        errors.push(`adjustment ${adj.id} before amount does not match baseline`);
      }
    }
  }
  for (const voucher of dataset.vouchers) {
    if (voucher.kind === 'reversal' && !voucher.reversalOf) {
      errors.push(`reversal ${voucher.id} has no original`);
    }
    if (voucher.kind === 'duplicate' && !voucher.duplicateOf) {
      errors.push(`duplicate ${voucher.id} has no original`);
    }
  }
  for (const commitment of dataset.commitments) {
    if (commitment.status === 'cancelled' && !commitment.cancelledAt) {
      errors.push(`cancelled commitment ${commitment.id} has no cancellation date`);
    }
  }
  return errors;
}
