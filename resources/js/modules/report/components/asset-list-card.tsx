/**
 * The 'list' chart — a few records by name in a small card (the written-off assets on the asset
 * overview): the card counts them in its heading, and each line gives the asset's code (opening it
 * on /assets for a reader who may), its category and model, where it is kept and why it went.
 * Past `TOP_LIST` the rest fold away behind "แสดงทั้งหมด (n)". Drawn by tabular-charts.tsx.
 */
import { useT } from '@/lang';
import { Card } from '@/shared/ui/card';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import type { TabularChart } from '../types';
import { ChartHeading, fold, FoldToggle, useChartLabel } from './chart-parts';
import { TitleWithCount } from './compact-stacks-card';

type List = Extract<TabularChart, { type: 'list' }>;

/** How many records the card lists before folding the rest away. */
const TOP_LIST = 5;

function ListLine({ row }: { row: List['rows'][number] }) {
    const label = useChartLabel();
    const canOpen = useCanOpen();
    const href = `/assets?view=${row.id}`;
    const what = [row.label ? label(row.label) : null, row.model].filter(Boolean).join(' · ');

    return (
        <div className="space-y-0.5 px-5 py-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
                {canOpen(href) ? (
                    <Link to={href} className="text-brand font-mono font-medium hover:underline">
                        {row.code}
                    </Link>
                ) : (
                    <span className="font-mono font-medium">{row.code}</span>
                )}
                {row.place && <span className="text-muted-foreground truncate text-xs">{row.place}</span>}
            </div>
            {what && <div className="truncate">{what}</div>}
            {row.reason && (
                <div className="text-muted-foreground truncate text-xs" title={row.reason}>
                    {row.reason}
                </div>
            )}
        </div>
    );
}

export function AssetListCard({ chart, expanded, onToggle }: { chart: List; expanded: boolean; onToggle: () => void }) {
    const t = useT();
    // Fold at exactly TOP_LIST: a list has no "อื่น ๆ" row to sum the rest into.
    const folding = fold(chart.rows, TOP_LIST, expanded, 0);

    return (
        <Card className="flex flex-col overflow-hidden">
            <ChartHeading title={<TitleWithCount title={t(chart.title_key)} count={chart.total} />} />
            {chart.rows.length === 0 ? (
                <div className="text-muted-foreground py-10 text-center text-sm">{t('rep_no_data')}</div>
            ) : (
                <div className="divide-border/60 divide-y">
                    {folding.shown.map((row) => (
                        <ListLine key={row.id} row={row} />
                    ))}
                </div>
            )}
            {folding.folds && <FoldToggle open={expanded} total={chart.rows.length} onToggle={onToggle} />}
        </Card>
    );
}
