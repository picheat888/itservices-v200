/**
 * A 'stacks' chart marked `compact` — a small card in the row under the department card (ready
 * stock by warehouse, shared use by location on the asset overview). Each place is one SplitLine
 * as on the /assets card: its name, how many were bought and rented with their dots, its total,
 * and the split bar under it. A row with no place recorded comes last under a dashed rule. Past
 * `TOP_COMPACT` the rest fold into one "อื่น ๆ (n)" row. Drawn by tabular-charts.tsx.
 */
import { useT } from '@/lang';
import { Card } from '@/shared/ui/card';
import { MoreHorizontal } from 'lucide-react';
import type { TabularChart } from '../types';
import { SplitLegend, SplitLine } from './bucket-rows-card';
import { ChartHeading, fold, FoldToggle, useChartLabel } from './chart-parts';

type Stacks = Extract<TabularChart, { type: 'stacks' }>;

/** How many places a small card shows before the rest fold into "อื่น ๆ". */
const TOP_COMPACT = 5;

/** The card's title with how many assets it counts beside it. */
export function TitleWithCount({ title, count }: { title: string; count: number }) {
    const t = useT();

    return (
        <span className="flex items-baseline gap-2">
            {title}
            <span className="text-muted-foreground text-xs font-normal">{t('rep_chart_items').replace('{n}', count.toLocaleString())}</span>
        </span>
    );
}

export function CompactStacksCard({ chart, expanded, onToggle }: { chart: Stacks; expanded: boolean; onToggle: () => void }) {
    const t = useT();
    const label = useChartLabel();
    const series = chart.views[0]?.series ?? [];
    const places = chart.rows.filter((r) => !r.apart);
    const apart = chart.rows.filter((r) => r.apart);
    const folding = fold(places, TOP_COMPACT, expanded);
    const rest: Record<string, number> = {};
    for (const s of series) rest[s.key] = folding.rest.reduce((sum, r) => sum + (r.values[s.key] ?? 0), 0);
    const restTotal = folding.rest.reduce((sum, r) => sum + r.total, 0);
    // One scale for every line on show, "ไม่ระบุ" included — so the lengths compare down the card.
    const max = Math.max(1, restTotal, ...folding.shown.map((r) => r.total), ...apart.map((r) => r.total));
    const total = chart.total ?? chart.rows.reduce((sum, r) => sum + r.total, 0);

    return (
        <Card className="flex flex-col overflow-hidden">
            <ChartHeading title={<TitleWithCount title={t(chart.title_key)} count={total} />} sub={<SplitLegend series={series} />} />
            {chart.rows.length === 0 ? (
                <div className="text-muted-foreground py-10 text-center text-sm">{t('rep_no_data')}</div>
            ) : (
                <>
                    <div className="space-y-4 px-5 py-4">
                        {folding.shown.map((row, i) => (
                            <SplitLine key={i} name={label(row.label)} values={row.values} total={row.total} series={series} max={max} />
                        ))}
                        {folding.rest.length > 0 && (
                            <SplitLine
                                name={t('rep_chart_others').replace('{n}', String(folding.rest.length))}
                                icon={MoreHorizontal}
                                values={rest}
                                total={restTotal}
                                series={series}
                                max={max}
                                muted
                            />
                        )}
                    </div>
                    {apart.length > 0 && (
                        <div className="border-border space-y-4 border-t-2 border-dashed px-5 py-4">
                            {apart.map((row, i) => (
                                <SplitLine key={i} name={label(row.label)} values={row.values} total={row.total} series={series} max={max} muted />
                            ))}
                        </div>
                    )}
                </>
            )}
            {folding.folds && <FoldToggle open={expanded} total={places.length} onToggle={onToggle} />}
        </Card>
    );
}
