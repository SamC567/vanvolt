import { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { analyseDesign, compareDesigns } from '@vanvolt/engine';
import { Callout, Card, EmptyState, PageHeader } from '../components/ui';
import { DesignBars } from '../components/charts';
import { useStore } from '../store/designStore';
import { fmt } from '../lib/format';

/** Designs keep their colour by position in the comparison (categorical slots 1–4). */
const DESIGN_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

export function ComparePage() {
  const order = useStore((s) => s.order);
  const designs = useStore((s) => s.designs);
  const compareIds = useStore((s) => s.compareIds);
  const toggleCompare = useStore((s) => s.toggleCompare);
  const selected = compareIds.filter((id) => designs[id]);
  const items = useMemo(
    () => selected.map((id) => ({ design: designs[id]!, analysis: analyseDesign(designs[id]!) })),
    [selected, designs],
  );
  const rows = useMemo(() => compareDesigns(items), [items]);
  const chartKeys = ['dailyWh', 'usableWh', 'solarWinter', 'worstNet'];

  return (
    <>
      <PageHeader
        title="Compare designs"
        subtitle="Pick up to four designs to compare side by side. The best value for each metric is highlighted."
      />

      <Card title="Designs to compare" className="mb-4">
        <div className="flex flex-wrap gap-2">
          {order.map((id) => {
            const on = selected.includes(id);
            const idx = selected.indexOf(id);
            return (
              <button
                key={id}
                className={`btn text-xs ${on ? 'border-accent bg-accent-soft' : ''}`}
                aria-pressed={on}
                onClick={() => toggleCompare(id)}
              >
                {on && (
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: DESIGN_COLORS[idx] }}
                    aria-hidden
                  />
                )}
                {designs[id]?.name}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink3">{selected.length}/4 selected</p>
      </Card>

      {items.length < 2 ? (
        <EmptyState title="Select at least two designs">
          Tip: duplicate a design in Projects, change one thing (battery size, voltage, solar), then
          compare.
        </EmptyState>
      ) : (
        <>
          <Card bodyClassName="p-0" title="Side-by-side">
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Metric</th>
                    {items.map(({ design }, i) => (
                      <th key={design.id} className="text-right normal-case">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ background: DESIGN_COLORS[i] }}
                            aria-hidden
                          />
                          {design.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.metric.key}>
                      <td className="text-ink2">{r.metric.label}</td>
                      {r.values.map((v, i) => (
                        <td
                          key={i}
                          className={`num text-right ${r.bestIndex === i ? 'font-semibold' : ''}`}
                        >
                          {v === null
                            ? '—'
                            : `${fmt(v, r.metric.decimals)}${r.metric.unit ? ` ${r.metric.unit}` : ''}`}
                          {r.bestIndex === i && (
                            <Trophy size={12} className="ml-1 inline text-good" aria-label="Best" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="mt-4" title="Key metrics">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {chartKeys.map((k) => {
                const row = rows.find((r) => r.metric.key === k)!;
                return (
                  <DesignBars
                    key={k}
                    title={row.metric.label}
                    unit={row.metric.unit}
                    items={items.map(({ design }, i) => ({
                      name: design.name,
                      value: row.values[i] ?? 0,
                      color: DESIGN_COLORS[i]!,
                    }))}
                  />
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink2">
              {items.map(({ design }, i) => (
                <span key={design.id} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: DESIGN_COLORS[i] }}
                    aria-hidden
                  />
                  {design.name}
                </span>
              ))}
            </div>
          </Card>
          <div className="mt-4">
            <Callout>
              Results come from each design's own location, loads and settings, so make sure you are
              comparing like with like.
            </Callout>
          </div>
        </>
      )}
    </>
  );
}
