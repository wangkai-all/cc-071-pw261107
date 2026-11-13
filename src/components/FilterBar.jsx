import { useMemo } from 'react';
import { describeFilters } from '../lib/export.js';

export function FilterBar({ model, filters, onChange, summary, onReset }) {
  const { deptIds, projectIds, categoryIds } = filters;

  const projectOptions = useMemo(() => {
    const list = model.dataset.projects;
    if (!deptIds.length) return list;
    return list.filter((p) => deptIds.includes(p.deptId));
  }, [model, deptIds]);

  const toggleDept = (id) => {
    const next = deptIds.includes(id)
      ? deptIds.filter((d) => d !== id)
      : [...deptIds, id];
    // Keep project selections that are still reachable from the new dept set.
    const allowed = new Set(
      model.dataset.projects.filter((p) => !next.length || next.includes(p.deptId)).map((p) => p.id),
    );
    onChange({ deptIds: next, projectIds: projectIds.filter((p) => allowed.has(p)) });
  };

  const setCategory = (value) => {
    onChange({ categoryIds: value ? [value] : [] });
  };

  const reset = () => {
    onChange({ deptIds: [], projectIds: [], categoryIds: [] });
    onReset?.();
  };

  const anyFilter = deptIds.length || projectIds.length || categoryIds.length;

  return (
    <div className="filterbar" role="region" aria-label="筛选条件">
      <span className="filter-label">部门</span>
      <div className="chips">
        {model.dataset.departments.map((dept) => (
          <button
            key={dept.id}
            className="chip"
            aria-pressed={deptIds.includes(dept.id)}
            onClick={() => toggleDept(dept.id)}
          >
            {dept.name}
          </button>
        ))}
      </div>

      <div className="filter-sep" aria-hidden="true" />

      <span className="filter-label">项目</span>
      <select
        className="select"
        aria-label="按项目筛选"
        value={projectIds.length === 1 ? projectIds[0] : ''}
        onChange={(event) => {
          const value = event.target.value;
          onChange({ projectIds: value ? [value] : [] });
        }}
      >
        <option value="">全部项目（{projectOptions.length}）</option>
        {projectOptions.map((project) => (
          <option key={project.id} value={project.id}>
            {model.deptMap.get(project.deptId)?.name} · {project.name}
          </option>
        ))}
      </select>

      <span className="filter-label">科目</span>
      <select
        className="select"
        aria-label="按费用科目筛选"
        value={categoryIds.length === 1 ? categoryIds[0] : ''}
        onChange={(event) => setCategory(event.target.value || '')}
      >
        <option value="">全部科目（{model.dataset.categories.length}）</option>
        {model.dataset.categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>

      {anyFilter ? (
        <button className="btn btn--ghost btn--sm" onClick={reset}>
          清除筛选
        </button>
      ) : null}

      <span className="filter-spacer" />

      <span className="filter-summary" aria-live="polite">
        当前范围：{describeFilters(filters, model)} · <strong>{summary.count}</strong> 条预算行
      </span>
    </div>
  );
}
