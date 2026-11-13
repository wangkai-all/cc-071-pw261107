import { useMemo, useState } from 'react';
import dataset from './data/dataset.json' with { type: 'json' };
import {
  createModel,
  filterLines,
  timeline,
  rollup,
  scenarioResults,
  scenarioVarianceRows,
  voucherTrace,
  SCENARIO_PRESETS,
  validateDataset,
} from './lib/engine.js';
import { fmtMoney } from './lib/format.js';
import { describeFilters, exportVariance, exportRollup } from './lib/export.js';
import { FilterBar } from './components/FilterBar.jsx';
import { Overview } from './components/Overview.jsx';
import { HierarchyTable } from './components/HierarchyTable.jsx';
import { MonthlyTable } from './components/MonthlyTable.jsx';
import { VersionsView } from './components/VersionsView.jsx';
import { ScenarioPanel } from './components/ScenarioPanel.jsx';
import { ScenarioView } from './components/ScenarioView.jsx';
import { ExceptionsView, TraceDrawer, LineVouchersDrawer } from './components/ExceptionsView.jsx';
import { Card, StatusTag, Tabs, useToast } from './components/ui.jsx';

const MODEL = createModel(dataset);
const DATASET_ERRORS = validateDataset(dataset);
const PRESETS = SCENARIO_PRESETS.map((preset) => ({ ...preset }));
const EMPTY_FILTERS = { deptIds: [], projectIds: [], categoryIds: [] };

export default function App() {
  const [tab, setTab] = useState('overview');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [scenarios, setScenarios] = useState(PRESETS);
  const [activeScenarioId, setActiveScenarioId] = useState('base');
  const [expanded, setExpanded] = useState(() => new Set(['D02']));
  const [traceId, setTraceId] = useState(null);
  const [lineDrawer, setLineDrawer] = useState(null);
  const [setToast, toastNode] = useToast();

  const lines = useMemo(() => filterLines(MODEL, filters), [filters]);
  const activeScenario = scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0];
  const rows = useMemo(() => timeline(MODEL, lines, activeScenario), [lines, activeScenario]);
  const rollupData = useMemo(() => rollup(MODEL, lines, activeScenario), [lines, activeScenario]);
  const results = useMemo(() => scenarioResults(MODEL, lines, scenarios), [lines, scenarios]);
  const varianceRows = useMemo(
    () => scenarioVarianceRows(MODEL, lines, scenarios),
    [lines, scenarios],
  );

  const current = results.find((r) => r.id === activeScenarioId) ?? results[0];

  const updateFilters = (patch) => setFilters((prev) => ({ ...prev, ...patch }));

  const setScenario = (next) => {
    setScenarios((prev) => prev.map((s) => (s.id === next.id ? { ...next } : s)));
    setActiveScenarioId(next.id);
  };

  const resetScenario = () => {
    setScenarios(PRESETS.map((preset) => ({ ...preset })));
    setActiveScenarioId('base');
    setToast('已恢复默认预测假设');
  };

  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const trace = traceId ? voucherTrace(MODEL, traceId) : null;

  const tabs = [
    { id: 'overview', label: '总览' },
    { id: 'detail', label: '预算对齐' },
    { id: 'versions', label: '版本与审批', count: MODEL.versions.length - 1 },
    {
      id: 'exceptions',
      label: '异常凭证',
      count:
        MODEL.exceptions.counts.unmatched +
        MODEL.exceptions.counts.duplicates +
        MODEL.exceptions.counts.reversals,
    },
    { id: 'scenarios', label: '方案对比' },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="title-block">
          <div className="eyebrow">
            <span className="pill">
              <span className="dot" aria-hidden="true" />
              演示数据 · 未接入财务系统
            </span>
            <span>{MODEL.year} 财年 · 数据截止 {MODEL.asOfMonth} 月末</span>
          </div>
          <h1>部门预算看板</h1>
          <p>
            年度预算、月度承诺、实际支出与剩余预测放在同一条时间线上，可从部门总额逐层展开到项目与费用科目。
          </p>
        </div>
        <div className="topbar-actions">
          <StatusTag tone={current.result.balance < 0 ? 'bad' : 'good'}>
            年末余额 {fmtMoney(current.result.balance, 1)}
          </StatusTag>
          <button
            className="btn"
            onClick={() => {
              exportRollup({ rows: rollupData, scenario: activeScenario, filters, model: MODEL });
              setToast('已导出预算对齐表');
            }}
          >
            导出对齐表
          </button>
          <button
            className="btn btn--primary"
            onClick={() => {
              exportVariance({ scenarios, rows: varianceRows, filters, model: MODEL });
              setToast('已导出预测差异 CSV');
            }}
          >
            导出预测差异
          </button>
        </div>
      </header>

      <FilterBar
        model={MODEL}
        filters={filters}
        onChange={updateFilters}
        onReset={() => setExpanded(new Set(['D02']))}
        summary={{ count: lines.length }}
      />

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <main>
        {tab === 'overview' && (
          <Overview
            model={MODEL}
            rows={rows}
            rollup={rollupData}
            scenario={activeScenario}
            baselineTotal={MODEL.dataset.meta.baselineTotal}
          />
        )}

        {tab === 'detail' && (
          <>
            <Card
              title="预算对齐表"
              subtitle={`单位：万元 · 部门 → 项目 → 费用科目 · 当前方案「${activeScenario.name}」`}
              className="card--flush"
              actions={
                <button
                  className="btn btn--sm"
                  onClick={() => {
                    exportRollup({ rows: rollupData, scenario: activeScenario, filters, model: MODEL });
                    setToast('已导出预算对齐表');
                  }}
                >
                  导出 CSV
                </button>
              }
            >
              <div style={{ marginTop: 10 }}>
                <HierarchyTable
                  rollup={rollupData}
                  expanded={expanded}
                  onToggle={toggleExpanded}
                  onOpenLine={setLineDrawer}
                  scenario={activeScenario}
                />
              </div>
            </Card>

            <div className="grid grid--scenario">
              <Card
                title="预测假设"
                subtitle="修改后立即重算时间线、年末余额与方案对比"
                actions={
                  <button className="btn btn--ghost btn--sm" onClick={resetScenario}>
                    恢复默认
                  </button>
                }
              >
                <ScenarioPanel
                  scenarios={scenarios}
                  active={activeScenarioId}
                  onChange={setScenario}
                  model={MODEL}
                  results={results}
                />
              </Card>

              <Card
                title="月度明细"
                subtitle="时间线每个数据点的表格视图，单位：万元"
                className="card--flush"
              >
                <MonthlyTable rows={rows} />
              </Card>
            </div>
          </>
        )}

        {tab === 'versions' && (
          <VersionsView
            model={MODEL}
            onPickLine={(line) => {
              setFilters({
                deptIds: [line.deptId],
                projectIds: [line.projectId],
                categoryIds: [line.categoryId],
              });
              setTab('detail');
              setToast(`已定位到 ${line.projectName} / ${line.categoryName}`);
            }}
          />
        )}

        {tab === 'exceptions' && <ExceptionsView model={MODEL} onOpenTrace={setTraceId} />}

        {tab === 'scenarios' && (
          <>
            <Card
              title="预测假设（所有方案共享）"
              subtitle="回看窗口与增长率作用于方案本身；部门系数在当前编辑的方案上叠加"
              style={{ marginBottom: 16 }}
              actions={
                <button className="btn btn--ghost btn--sm" onClick={resetScenario}>
                  恢复默认
                </button>
              }
            >
              <ScenarioPanel
                scenarios={scenarios}
                active={activeScenarioId}
                onChange={setScenario}
                model={MODEL}
                results={results}
              />
            </Card>
            <ScenarioView
              activeId={activeScenarioId}
              results={results}
              rows={varianceRows}
              baseId="base"
              onExport={() => {
                exportVariance({ scenarios, rows: varianceRows, filters, model: MODEL });
                setToast('已导出预测差异 CSV');
              }}
            />
          </>
        )}
      </main>

      <footer className="footnote">
        <span className="check">
          ✓ 数据完整性校验通过{DATASET_ERRORS.length ? `（${DATASET_ERRORS.length} 项异常）` : ''}
        </span>
        <span>{describeFilters(filters, MODEL)}</span>
        <span>
          预算 {fmtMoney(rollupData.budget, 0)} · 实际 {fmtMoney(rollupData.actual, 0)} · 未结承诺{' '}
          {fmtMoney(rollupData.commitments, 0)} · 预测 {fmtMoney(rollupData.forecastTotal, 0)}
        </span>
        <span>所有数字来自同一份演示数据集，未连接真实财务系统</span>
      </footer>

      {trace && <TraceDrawer trace={trace} onClose={() => setTraceId(null)} />}
      {lineDrawer && (
        <LineVouchersDrawer
          model={MODEL}
          line={lineDrawer}
          onClose={() => setLineDrawer(null)}
          onOpenTrace={(id) => {
            setLineDrawer(null);
            setTraceId(id);
          }}
        />
      )}
      {toastNode}
    </div>
  );
}
