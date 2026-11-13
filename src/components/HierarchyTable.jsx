import { Fragment, useMemo } from 'react';
import { fmtMoney, fmtPct, fmtWanNumber, fmtSignedWanNumber } from '../lib/format.js';
import { StatusTag } from './ui.jsx';

function UsageCell({ actual, commitments, budget }) {
  const ratio = budget ? (actual + commitments) / budget : 0;
  const width = Math.min(100, ratio * 100);
  const tone = ratio > 1 ? 'usage-bar--over' : ratio > 0.9 ? 'usage-bar--warn' : '';
  return (
    <div className="bar-cell">
      <span>{fmtPct(ratio)}</span>
      <span className={`usage-bar ${tone}`} aria-hidden="true">
        <span style={{ width: `${width}%` }} />
      </span>
    </div>
  );
}

function BalanceCell({ value }) {
  return (
    <td className={value < 0 ? 'num--neg' : value > 0 ? 'num--pos' : ''}>
      {fmtSignedWanNumber(value, 1)}
    </td>
  );
}

/**
 * Expandable department -> project -> expense-category table. Every level is a
 * sum of the rows beneath it, and every number is in 万元 (the header unit).
 */
export function HierarchyTable({
  rollup,
  expanded,
  onToggle,
  onOpenTrace,
  onOpenLine,
  scenario,
}) {
  const projectsByDept = useMemo(() => {
    const map = new Map();
    for (const project of rollup.projects) {
      if (!map.has(project.deptId)) map.set(project.deptId, []);
      map.get(project.deptId).push(project);
    }
    for (const list of map.values()) list.sort((a, b) => b.budget - a.budget);
    return map;
  }, [rollup.projects]);

  const anyExpanded = expanded.size > 0;

  return (
    <>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">
            按部门、项目、费用科目展开的预算执行表，单位为万元
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ minWidth: 220 }}>
                部门 / 项目 / 科目
              </th>
              <th scope="col">年度预算</th>
              <th scope="col">实际支出</th>
              <th scope="col">未结承诺</th>
              <th scope="col">预测新增</th>
              <th scope="col">年末预计支出</th>
              <th scope="col">年末余额</th>
              <th scope="col">执行率</th>
              <th scope="col">状态</th>
            </tr>
          </thead>
          <tbody>
            {rollup.departments.map((dept) => {
              const isOpen = expanded.has(dept.id);
              const projects = projectsByDept.get(dept.id) ?? [];
              const over = dept.remaining < 0;
              return (
                <Fragment key={dept.id}>
                  <tr className="is-group">
                    <td>
                      <div className="cell-name">
                        <button
                          className="expand"
                          data-open={isOpen}
                          aria-expanded={isOpen}
                          aria-controls={`dept-${dept.id}`}
                          onClick={() => onToggle(dept.id)}
                          title={isOpen ? '收起项目' : '展开项目'}
                        >
                          {isOpen ? '−' : '+'}
                        </button>
                        <span>{dept.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>
                          {dept.owner} · {projects.length} 个项目
                        </span>
                      </div>
                    </td>
                    <td>{fmtWanNumber(dept.budget, 1)}</td>
                    <td>{fmtWanNumber(dept.actual, 1)}</td>
                    <td>{fmtWanNumber(dept.commitments, 1)}</td>
                    <td>{fmtWanNumber(dept.forecast, 1)}</td>
                    <td>{fmtWanNumber(dept.yearEndSpend, 1)}</td>
                    <BalanceCell value={dept.remaining} />
                    <td>
                      <UsageCell
                        actual={dept.actual}
                        commitments={dept.commitments}
                        budget={dept.budget}
                      />
                    </td>
                    <td>
                      {over ? (
                        <StatusTag tone="bad">预计超支</StatusTag>
                      ) : dept.remaining / dept.budget < 0.03 ? (
                        <StatusTag tone="warn">临界</StatusTag>
                      ) : (
                        <StatusTag tone="good">可控</StatusTag>
                      )}
                    </td>
                  </tr>

                  {isOpen &&
                    projects.map((project) => {
                      const projectOpen = expanded.has(project.id);
                      return (
                        <Fragment key={`${dept.id}-${project.id}`}>
                          <tr>
                            <td>
                              <div className="cell-name cell-name--child">
                                <button
                                  className="expand"
                                  data-open={projectOpen}
                                  aria-expanded={projectOpen}
                                  aria-controls={`project-${project.id}`}
                                  onClick={() => onToggle(project.id)}
                                  title={projectOpen ? '收起科目' : '展开科目'}
                                >
                                  {projectOpen ? '−' : '+'}
                                </button>
                                <span>{project.name}</span>
                                {project.reserve && (
                                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                    预算池
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>{fmtWanNumber(project.budget, 1)}</td>
                            <td>{project.actual ? fmtWanNumber(project.actual, 1) : '—'}</td>
                            <td>{project.commitments ? fmtWanNumber(project.commitments, 1) : '—'}</td>
                            <td>{project.forecast ? fmtWanNumber(project.forecast, 1) : '—'}</td>
                            <td>{fmtWanNumber(project.yearEndSpend, 1)}</td>
                            <BalanceCell value={project.remaining} />
                            <td>
                              <UsageCell
                                actual={project.actual}
                                commitments={project.commitments}
                                budget={project.budget}
                              />
                            </td>
                            <td>
                              {project.remaining < 0 ? (
                                <StatusTag tone="bad">预计超支</StatusTag>
                              ) : (
                                <StatusTag>正常</StatusTag>
                              )}
                            </td>
                          </tr>

                          {projectOpen &&
                            project.categories
                              .slice()
                              .sort((a, b) => b.budget - a.budget)
                              .map((category) => (
                                <tr key={category.key}>
                                  <td>
                                    <div className="cell-name cell-name--leaf">
                                      <span>{category.name}</span>
                                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                        {category.group}
                                      </span>
                                      <button
                                        className="btn btn--ghost btn--sm"
                                        onClick={() => onOpenLine(category)}
                                        title="查看该科目的凭证"
                                      >
                                        凭证
                                      </button>
                                    </div>
                                  </td>
                                  <td>{fmtWanNumber(category.budget, 1)}</td>
                                  <td>{fmtWanNumber(category.actual, 1)}</td>
                                  <td>{fmtWanNumber(category.commitments, 1)}</td>
                                  <td>{fmtWanNumber(category.forecast, 1)}</td>
                                  <td>{fmtWanNumber(category.yearEndSpend, 1)}</td>
                                  <BalanceCell value={category.remaining} />
                                  <td>
                                    <UsageCell
                                      actual={category.actual}
                                      commitments={category.commitments}
                                      budget={category.budget}
                                    />
                                  </td>
                                  <td />
                                </tr>
                              ))}
                        </Fragment>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="is-group">
              <td>合计</td>
              <td>{fmtWanNumber(rollup.budget, 1)}</td>
              <td>{fmtWanNumber(rollup.actual, 1)}</td>
              <td>{fmtWanNumber(rollup.commitments, 1)}</td>
              <td>{fmtWanNumber(rollup.forecastTotal, 1)}</td>
              <td>{fmtWanNumber(rollup.yearEndSpend, 1)}</td>
              <BalanceCell value={rollup.balance} />
              <td>
                <UsageCell
                  actual={rollup.actual}
                  commitments={rollup.commitments}
                  budget={rollup.budget}
                />
              </td>
              <td>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  {scenario.name}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {!anyExpanded && (
        <div className="table-hint">
          点部门前的 <b>+</b> 展开到项目，再点项目前的 <b>+</b> 展开到费用科目；每层数字均等于下层合计。
        </div>
      )}
    </>
  );
}
