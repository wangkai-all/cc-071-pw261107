import test from 'node:test';
import assert from 'node:assert/strict';
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
  voucherTrace,
  vouchersForLine,
  validateDataset,
  SCENARIO_PRESETS,
} from '../src/lib/engine.js';

const dataset = JSON.parse(
  readFileSync(new URL('../src/data/dataset.json', import.meta.url), 'utf8'),
);

test('dataset is structurally valid', () => {
  assert.deepEqual(validateDataset(dataset), []);
});

test('approved transfer legs net to zero and both sides are posted', () => {
  const transfer = dataset.budgetAdjustments.find((a) => a.id === 'BA-2026-02');
  assert.equal(transfer.lines.reduce((a, l) => a + l.delta, 0), 0);
  assert.deepEqual(new Set(transfer.lines.map((l) => l.deptId)), new Set(['D02', 'D03']));

  const model = createModel(dataset);
  const from = model.lineMap.get('D03|P0302|C03');
  const to = model.lineMap.get('D02|P0202|C04');
  assert.equal(from.budget, from.baseline - 1_200_000);
  assert.equal(to.budget, to.baseline + 1_200_000);
});

test('pending adjustment is visible in versions but never counted', () => {
  const model = createModel(dataset);
  assert.equal(model.versions.filter((v) => v.status === 'pending').length, 1);
  const line = model.lineMap.get('D04|P0401|C07');
  const adjustment = line.adjustments.find((a) => a.id === 'BA-2026-04');
  assert.equal(adjustment.status, 'pending');
  assert.equal(line.budget, line.baseline);
});

test('cancelled commitments never occupy budget', () => {
  const model = createModel(dataset);
  const cancelled = model.exceptions.cancelledCommitments;
  assert.ok(cancelled.length >= 2);
  for (const commitment of cancelled) {
    assert.equal(commitment.status, 'cancelled');
    const line = model.lineMap.get(
      `${commitment.deptId}|${commitment.projectId}|${commitment.categoryId}`,
    );
    assert.ok(!line.commitmentIds.includes(commitment.id));
    const scheduleTotal = line.monthlyCommitment.reduce((a, b) => a + b, 0);
    assert.equal(scheduleTotal, line.openCommitTotal);
  }
});

test('duplicates are excluded from actuals but reported', () => {
  const model = createModel(dataset);
  const duplicate = model.exceptions.duplicates[0];
  assert.ok(duplicate);
  const line = model.lineMap.get(
    `${duplicate.deptId}|${duplicate.projectId}|${duplicate.categoryId}`,
  );
  assert.ok(!line.voucherIds.includes(duplicate.id));
  const actualSum = model.lines.reduce((a, l) => a + l.actualYtd, 0);
  assert.equal(actualSum, model.totals.actual);
  assert.ok(model.exceptions.totals.duplicates > 0);
});

test('reversals reduce actuals with a negative amount', () => {
  const model = createModel(dataset);
  const reversal = model.exceptions.reversals[0];
  assert.ok(reversal);
  const line = model.lineMap.get(
    `${reversal.deptId}|${reversal.projectId}|${reversal.categoryId}`,
  );
  assert.ok(line.voucherIds.includes(reversal.id));
  const trace = voucherTrace(model, reversal.id);
  assert.equal(trace.related[0].relation, '被冲销凭证');
  assert.equal(trace.related[0].voucher.amount, -reversal.amount);
});

test('unmatched vouchers are reported and excluded from totals', () => {
  const model = createModel(dataset);
  assert.ok(model.exceptions.unmatched.length >= 4);
  for (const voucher of model.exceptions.unmatched) {
    assert.match(voucher.reason, /未匹配/);
    assert.ok(!model.lines.some((line) => line.voucherIds.includes(voucher.id)));
  }
  assert.ok(model.exceptions.totals.unmatched > 0);
});

test('filters keep KPI, timeline, rollup and scenario totals consistent', () => {
  const model = createModel(dataset);
  const filterSets = [
    {},
    { deptIds: ['D02'] },
    { deptIds: ['D01'], projectIds: ['P0101'] },
    { deptIds: ['D03', 'D05'], categoryIds: ['C01', 'C08'] },
  ];
  for (const filters of filterSets) {
    const lines = filterLines(model, filters);
    const agg = aggregate(lines);
    const scenario = SCENARIO_PRESETS[0];
    const result = evaluate(model, lines, scenario);
    const rows = timeline(model, lines, scenario);
    const byDept = rollup(model, lines, scenario);

    assert.equal(result.budget, agg.budget);
    assert.equal(rows[11].budget, result.budget, 'timeline ends at the budget total');
    assert.equal(
      Math.round(rows[11].occupancy),
      Math.round(result.yearEndSpend),
      'timeline occupancy equals year-end spend',
    );
    assert.equal(
      Math.round(byDept.balance),
      Math.round(result.balance),
      'hierarchy balance equals scenario balance',
    );
    assert.equal(
      Math.round(byDept.departments.reduce((a, d) => a + d.remaining, 0)),
      Math.round(result.balance),
      'department rows add up to the total',
    );
    assert.equal(
      Math.round(byDept.departments.reduce((a, d) => a + d.budget, 0)),
      Math.round(result.budget),
    );
    assert.equal(
      Math.round(byDept.projects.reduce((a, p) => a + p.budget, 0)),
      Math.round(result.budget),
    );
    assert.equal(
      Math.round(byDept.projects.flatMap((p) => p.categories).reduce((a, c) => a + c.budget, 0)),
      Math.round(result.budget),
      'category rows add up to the budget total',
    );
  }
});

test('changing a filter does not repaint or reshape unrelated rows', () => {
  const model = createModel(dataset);
  const scenario = SCENARIO_PRESETS[0];
  const all = rollup(model, filterLines(model, {}), scenario);
  const filtered = rollup(model, filterLines(model, { deptIds: ['D02'] }), scenario);
  const d02All = all.departments.find((d) => d.id === 'D02');
  const d02Filtered = filtered.departments.find((d) => d.id === 'D02');
  assert.equal(Math.round(d02All.budget), Math.round(d02Filtered.budget));
  assert.equal(Math.round(d02All.actual), Math.round(d02Filtered.actual));
  assert.equal(Math.round(d02All.remaining), Math.round(d02Filtered.remaining));
});

test('scenario comparison reports variance against the base scenario', () => {
  const model = createModel(dataset);
  const lines = filterLines(model, {});
  const results = scenarioResults(model, lines, SCENARIO_PRESETS, 'base');
  const base = results.find((r) => r.id === 'base');
  assert.equal(base.varianceVsBase, 0);
  const conservative = results.find((r) => r.id === 'conservative');
  assert.ok(conservative.result.forecastTotal > base.result.forecastTotal);
  assert.ok(conservative.result.balance < base.result.balance);

  const rows = scenarioVarianceRows(model, lines, SCENARIO_PRESETS, 'base');
  assert.equal(rows.length, SCENARIO_PRESETS.length * rollup(model, lines, SCENARIO_PRESETS[0]).departments.length);
  for (const row of rows.filter((r) => r.scenarioId === 'base')) {
    assert.equal(Math.round(row.varianceVsBase * 1000), 0);
  }
});

test('manual assumptions change the forecast in the expected direction', () => {
  const model = createModel(dataset);
  const lines = filterLines(model, { deptIds: ['D02'] });
  const scenario = { ...SCENARIO_PRESETS[0], growthPct: 10 };
  const base = evaluate(model, lines, SCENARIO_PRESETS[0]);
  const grown = evaluate(model, lines, scenario);
  assert.ok(grown.forecastTotal > base.forecastTotal);

  const withMultiplier = {
    ...SCENARIO_PRESETS[0],
    deptMultipliers: { D02: 25 },
  };
  assert.ok(evaluate(model, lines, withMultiplier).forecastTotal > base.forecastTotal);

  const longerLookback = { ...SCENARIO_PRESETS[0], lookback: 10 };
  assert.ok(evaluate(model, lines, longerLookback).forecastTotal > 0);
});

test('excluding commitments lowers forecast top-up but not the commitment total', () => {
  const model = createModel(dataset);
  const lines = filterLines(model, {});
  const withCommitments = evaluate(model, lines, SCENARIO_PRESETS[0]);
  const without = evaluate(model, lines, {
    ...SCENARIO_PRESETS[0],
    includeCommitments: false,
  });
  assert.equal(without.commitments, withCommitments.commitments);
  assert.ok(without.forecastTotal > withCommitments.forecastTotal,
    'when commitments are ignored, projected spend must come from run-rate instead');
});

test('turning off new spend leaves only commitments in the projection', () => {
  const model = createModel(dataset);
  const lines = filterLines(model, {});
  const result = evaluate(model, lines, { ...SCENARIO_PRESETS[0], includeNewSpend: false });
  assert.equal(result.forecastTotal, 0);
  assert.equal(result.yearEndSpend, result.actual + result.commitments);
});

test('run-rate uses only months inside the lookback window', () => {
  const model = createModel(dataset);
  const line = model.lineMap.get('D02|P0202|C04');
  const shortWindow = forecastLine(model, line, { lookback: 1 });
  const longWindow = forecastLine(model, line, { lookback: 10 });
  assert.ok(shortWindow.historyMonths <= 1);
  assert.ok(longWindow.historyMonths > shortWindow.historyMonths);
  assert.ok(shortWindow.runRate !== longWindow.runRate);
});

test('voucher trace walks back to the source documents', () => {
  const model = createModel(dataset);
  const line = model.lineMap.get('D02|P0202|C04');
  const vouchers = vouchersForLine(model, line.key);
  assert.ok(vouchers.length > 0);
  const trace = voucherTrace(model, vouchers[0].id);
  assert.equal(trace.deptName, '市场营销部');
  assert.ok(trace.voucher.source.invoiceNo);
  assert.ok(trace.voucher.source.poNo);
  assert.ok(trace.voucher.source.submittedBy);
  assert.ok(trace.lineBudget > 0);
});

test('duplicate trace points back to the original voucher', () => {
  const model = createModel(dataset);
  const duplicate = model.exceptions.duplicates[0];
  const trace = voucherTrace(model, duplicate.id);
  assert.equal(trace.definition.includes('重复凭证'), true);
  assert.ok(trace.related.some((r) => r.relation === '原始凭证'));
});

test('as-of month drives actual vs forecast split', () => {
  const model = createModel(dataset);
  const lines = filterLines(model, {});
  const rows = timeline(model, lines, SCENARIO_PRESETS[0]);
  assert.equal(rows.filter((r) => r.isActual).length, model.asOfMonth);
  assert.ok(rows.slice(model.asOfMonth).every((r) => r.monthlyActual === 0));
  assert.ok(rows.slice(model.asOfMonth).every((r) => r.monthlyForecast >= 0));
});
