import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * The forecast model is controlled by one scenario object. Presets are starting
 * points; any manual change flips the active preset to "自定义" and immediately
 * re-runs every downstream figure (KPI, timeline, table, comparison, export).
 */
export function ScenarioPanel({ scenarios, active, onChange, model, results }) {
  const activeScenario = scenarios.find((s) => s.id === active) ?? scenarios[0];
  const [draftName, setDraftName] = useState('');

  const update = (patch) => {
    onChange({ ...activeScenario, ...patch, id: activeScenario.id, name: activeScenario.name });
  };

  const numberField = (key, label, min, max, step, suffix) => (
    <div className="field">
      <label htmlFor={`scenario-${key}`}>
        <span>{label}</span>
        <span className="value-tag">
          {activeScenario[key]}
          {suffix}
        </span>
      </label>
      <input
        id={`scenario-${key}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={activeScenario[key]}
        onChange={(event) => update({ [key]: Number(event.target.value) })}
      />
    </div>
  );

  return (
    <div>
      <div className="scenario-list" role="radiogroup" aria-label="预测方案">
        {scenarios.map((scenario) => {
          const result = results.find((r) => r.id === scenario.id);
          return (
            <label
              key={scenario.id}
              className="scenario-row"
              data-active={active === scenario.id}
            >
              <input
                type="radio"
                name="scenario"
                checked={active === scenario.id}
                onChange={() => onChange(scenario)}
              />
              <span>
                <span className="scenario-name">{scenario.name}</span>
                <span className="scenario-desc" style={{ display: 'block' }}>
                  {scenario.description}
                </span>
              </span>
              <span className="scenario-balance">
                {result ? formatSigned(result.result.balance) : '—'}
                <small>
                  {result && result.varianceVsBase !== 0
                    ? `较基准 ${formatSigned(result.varianceVsBase)}`
                    : '基准'}
                </small>
              </span>
            </label>
          );
        })}
      </div>

      <div className="assumption-grid">
        {numberField('lookback', '回看窗口', 1, 12, 1, ' 个月')}
        {numberField('growthPct', '月度增长率', -10, 10, 0.5, '%')}
        <div className="switch-row" style={{ gridColumn: 'span 2' }}>
          <span>计入未结承诺（避免重复计算）</span>
          <span className="switch">
            <input
              type="checkbox"
              checked={activeScenario.includeCommitments !== false}
              onChange={(event) => update({ includeCommitments: event.target.checked })}
              aria-label="计入未结承诺"
            />
            <span />
          </span>
        </div>
        <div className="switch-row" style={{ gridColumn: 'span 2' }}>
          <span>按节奏预测新增支出</span>
          <span className="switch">
            <input
              type="checkbox"
              checked={activeScenario.includeNewSpend !== false}
              onChange={(event) => update({ includeNewSpend: event.target.checked })}
              aria-label="按节奏预测新增支出"
            />
            <span />
          </span>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="filter-label" style={{ marginBottom: 6 }}>
          部门手工系数（在回看节奏基础上叠加）
        </div>
        <div className="dept-multipliers">
          {model.dataset.departments.map((dept) => (
            <div className="field" key={dept.id}>
              <label htmlFor={`mult-${dept.id}`}>
                <span>{dept.name}</span>
                <span className="value-tag">
                  {(activeScenario.deptMultipliers?.[dept.id] ?? 0) > 0 ? '+' : ''}
                  {activeScenario.deptMultipliers?.[dept.id] ?? 0}%
                </span>
              </label>
              <input
                id={`mult-${dept.id}`}
                type="range"
                min={-50}
                max={50}
                step={5}
                value={activeScenario.deptMultipliers?.[dept.id] ?? 0}
                onChange={(event) =>
                  update({
                    deptMultipliers: {
                      ...(activeScenario.deptMultipliers ?? {}),
                      [dept.id]: Number(event.target.value),
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatSigned(value) {
  const wan = value / 10000;
  return `${value < 0 ? '−' : '+'}¥${Math.abs(wan).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} 万`;
}
