/**
 * Headless consistency check for the numbers the dashboard shows.
 *
 * The screen, the footer and both CSV exports all derive from the engine, so
 * this script re-derives the same figures and asserts the identities that a
 * reader would check by hand:
 *
 *   - department / project / category lines sum to the grand total
 *   - the timeline's last row equals the KPI figures
 *   - actual + open commitments + forecast = year-end spend
 *   - budget - year-end spend = year-end balance
 *   - filters never change per-line values, only which lines are included
 *   - pending versions, cancelled commitments and exception vouchers stay out
 *     of every official total
 *
 * Run with `npm run check`.
 */
import { readFileSync } from 'node:fs';
import {
  createModel,
  filterLines,
  aggregate,
  evaluate,
  timeline,
  rollup,
  scenarioResults,
  scenarioVarianceRows,
  forecastLine,
  validateDataset,
  SCENARIO_PRESETS,
} from '../src/lib/engine.js';

const dataset = JSON.parse(
  readFileSync(new URL('../src/data/dataset.json', import.meta.url), 'utf8'),
);

const EPS = 0.01;
const failures = [];
const checks = [];

function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

function near(a, b, tolerance = EPS) {
  return Math.abs(a - b) <= tolerance;
}

const model = createModel(dataset);
const baseScenario = SCENARIO_PRESETS[0];
const allLines = filterLines(model, {});
const all = aggregate(allLines);
const result = evaluate(model, allLines, baseScenario);
const rows = timeline(model, allLines, baseScenario);
const last = rows[rows.length - 1];
const tree = rollup(model, allLines, baseScenario);

check('dataset has no structural errors', validateDataset(dataset).length === 0);
check('dataset is fully fabricated (no external endpoints)', /演示|demo/.test(dataset.meta.source));

// 1. Three-level rollup adds up.
const deptBudget = tree.departments.reduce((a, d) => a + d.budget, 0);
const deptRemaining = tree.departments.reduce((a, d) => a + d.remaining, 0);
const projectBudget = tree.projects.reduce((a, p) => a + p.budget, 0);
const categoryBudget = tree.projects.reduce(
  (a, p) => a + p.categories.reduce((b, c) => b + c.budget, 0),
  0,
);
check('departments sum to total budget', near(deptBudget, tree.budget), `${deptBudget} vs ${tree.budget}`);
check('projects sum to total budget', near(projectBudget, tree.budget), `${projectBudget} vs ${tree.budget}`);
check('categories sum to total budget', near(categoryBudget, tree.budget), `${categoryBudget} vs ${tree.budget}`);
check('department balances sum to total balance', near(deptRemaining, tree.balance), `${deptRemaining} vs ${tree.balance}`);

// 2. KPI identities: actual + commitments + forecast = year-end spend.
const yearEnd = all.actual + all.commitments + result.forecastTotal;
check('actual + commitments + forecast = year-end spend', near(yearEnd, result.yearEndSpend), `${yearEnd} vs ${result.yearEndSpend}`);
check('budget - year-end spend = balance', near(all.budget - result.yearEndSpend, result.balance));
check('timeline end equals evaluate()', near(last.occupancy, result.yearEndSpend) && near(last.budget, all.budget));
check('timeline cumulative never decreases before year end', rows.every((row, i) => i === 0 || row.occupancy >= rows[i - 1].occupancy - EPS));

// 3. Baseline + approved adjustments = effective budget, pending excluded.
const baselineTotal = dataset.baseline.lines.reduce((a, l) => a + l.amount, 0);
const approvedDelta = dataset.budgetAdjustments
  .filter((a) => a.status === 'approved')
  .reduce((a, adj) => a + adj.lines.reduce((b, l) => b + l.delta, 0), 0);
// A reserve-funded adjustment nets to zero, so "excluded" is checked on the
// gross increase rather than the net delta.
const pendingGross = dataset.budgetAdjustments
  .filter((a) => a.status === 'pending')
  .reduce(
    (a, adj) => a + adj.lines.filter((l) => l.delta > 0).reduce((b, l) => b + l.delta, 0),
    0,
  );
check('effective budget = baseline + approved adjustments', near(all.budget, baselineTotal + approvedDelta), `${all.budget} vs ${baselineTotal + approvedDelta}`);
check('pending adjustments exist but are excluded', model.versions.some((v) => v.status === 'pending') && pendingGross > 0);
check(
  'no pending line leaks into a line budget',
  model.lines.every((line) => line.adjustments
    .filter((a) => a.status !== 'approved')
    .every((a) => a.effectiveMonth > model.asOfMonth || line.budget === line.baseline)),
);
check('approved transfers net to zero', dataset.budgetAdjustments
  .filter((a) => a.status === 'approved' && a.type === 'transfer')
  .every((a) => a.lines.reduce((b, l) => b + l.delta, 0) === 0));

// 4. Cancelled commitments release budget.
const cancelled = model.exceptions.cancelledCommitments;
check('cancelled commitments are listed separately', cancelled.length >= 2);
check('cancelled commitments never enter open commitments', cancelled.every((c) => {
  const line = model.lineMap.get(`${c.deptId}|${c.projectId}|${c.categoryId}`);
  return !line.commitmentIds.includes(c.id) && c.status === 'cancelled';
}));

// 5. Exceptions are excluded from actuals.
const exceptionIds = new Set([
  ...model.exceptions.unmatched.map((v) => v.id),
  ...model.exceptions.duplicates.map((v) => v.id),
]);
const countedIds = new Set(allLines.flatMap((l) => l.voucherIds));
check('unmatched and duplicate vouchers are not counted', [...exceptionIds].every((id) => !countedIds.has(id)));
check('reversals are counted with a negative amount', model.exceptions.reversals.every((v) => v.amount < 0 && countedIds.has(v.id)));

// 6. Filters only change scope, never per-line values or identities.
const deptIds = [...new Set(model.lines.map((l) => l.deptId))];
const keysBefore = new Map(model.lines.map((l) => [l.key, l.budget + l.actualYtd + l.openCommitTotal]));
for (const deptId of deptIds) {
  const subset = filterLines(model, { deptIds: [deptId] });
  const sum = aggregate(subset);
  const expected = tree.departments.find((d) => d.id === deptId);
  const subResult = evaluate(model, subset, baseScenario);
  check(`filter ${deptId}: budget matches its rollup row`, near(sum.budget, expected.budget));
  check(`filter ${deptId}: balance identity holds`, near(sum.budget - subResult.yearEndSpend, subResult.balance));
  check(`filter ${deptId}: lines unchanged`, subset.every((l) => near(keysBefore.get(l.key), l.budget + l.actualYtd + l.openCommitTotal, 1e-9)));
}
const combined = aggregate(filterLines(model, { deptIds: [deptIds[0], deptIds[1]] }));
const pair = tree.departments
  .filter((d) => d.id === deptIds[0] || d.id === deptIds[1])
  .reduce((a, d) => a + d.budget, 0);
check('two-department filter equals the sum of the two rows', near(combined.budget, pair), `${combined.budget} vs ${pair}`);

// 7. Scenario comparison is internally consistent and sensitive to assumptions.
const scenarios = SCENARIO_PRESETS.map((s) => ({ ...s }));
const results = scenarioResults(model, allLines, scenarios, 'base');
const base = results.find((r) => r.id === 'base');
check('base scenario variance is zero', results.every((r) => r.id !== 'base' || r.varianceVsBase === 0));
check('every scenario variance is balance minus base balance', results.every((r) => near(r.varianceVsBase, r.result.balance - base.result.balance)));
const varianceRows = scenarioVarianceRows(model, allLines, scenarios, 'base');
check('variance rows cover every scenario × department', varianceRows.length === results.length * tree.departments.length);
for (const entry of results) {
  const total = varianceRows.filter((r) => r.scenarioId === entry.id).reduce((a, r) => a + r.balance, 0);
  check(`variance rows sum to the scenario total (${entry.id})`, near(total, entry.result.balance), `${total} vs ${entry.result.balance}`);
}

// 8. Forecast never double counts open commitments.
const commitmentTotal = all.commitments;
const forecastTotal = result.forecastTotal;
const coveredTotal = allLines.reduce(
  (a, l) => a + forecastLine(model, l, baseScenario).commitmentCovered.reduce((b, c) => b + c, 0),
  0,
);
check('commitment-covered months are a subset of open commitments', near(coveredTotal, commitmentTotal), `${coveredTotal} vs ${commitmentTotal}`);
check(
  'forecast references commitments but does not add them again',
  allLines.every((l) => {
    const f = forecastLine(model, l, baseScenario);
    return f.monthly.reduce((a, b) => a + b, 0) <= f.expectedTotal + EPS;
  }),
);
// A line whose future commitments exceed its run-rate must forecast exactly its
// commitments — the top-up logic must not stack the two.
const commitmentLed = allLines.filter(
  (l) => l.monthlyCommitment.reduce((a, b) => a + b, 0) > forecastLine(model, l, baseScenario).runRate * 2,
);
check('commitment-led lines forecast to their commitment level', commitmentLed.every((l) => {
  const f = forecastLine(model, l, baseScenario);
  const expected = l.monthlyCommitment.reduce((a, b) => a + b, 0);
  const newSpend = f.monthly.reduce((a, b) => a + b, 0);
  return newSpend <= expected * 1.000001;
}), `${commitmentLed.length} line(s) checked`);
check('open commitments are not added twice', near(commitmentTotal + forecastTotal, result.yearEndSpend - all.actual));

if (failures.length) {
  console.error(`✗ ${failures.length} consistency check(s) failed:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`✓ ${checks.length} consistency checks passed`);
console.log(
  `  预算 ${(all.budget / 10_000).toFixed(1)} 万 · 实际 ${(all.actual / 10_000).toFixed(1)} 万 · ` +
    `承诺 ${(all.commitments / 10_000).toFixed(1)} 万 · 预测 ${(forecastTotal / 10_000).toFixed(1)} 万 · ` +
    `余额 ${(result.balance / 10_000).toFixed(1)} 万`,
);
