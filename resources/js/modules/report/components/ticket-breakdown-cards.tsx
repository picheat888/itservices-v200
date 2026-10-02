/**
 * The Ticket & SLA page's two full-width breakdown cards, laid out as the design's ticket screen
 * (docs/mockup/report-module.html), which merged two former tabular reports into the page:
 *
 * - DepartmentStacksCard ("แยกตามแผนก", was "Ticket ตามแผนกและหมวด") — one row per requesting
 *   department, its tickets stacked by category with each piece's count over it, then its total,
 *   SLA hit rate and how many are still open. At most 10 show and the rest fold into one
 *   "อื่น ๆ (n)" row (with a true SLA rate from summed met/measured) until "แสดงทั้งหมด"; the
 *   no-department row sits apart under a dashed rule, scaled to its own total.
 * - StaffPerformanceCard ("ผลงานเจ้าหน้าที่ IT", was the report of that name) — every IT staff
 *   member who closed something in the range: closed / canceled, typical (median) resolve time and
 *   SLA hit rate — the chosen period only, nothing about what is in hand now. The shared DataTable, inset and paged like the "รายการ Ticket" card, so a desk of 30+
 *   keeps the page short.
 *
 * The stacked bar and the fold come from tabular-charts.tsx, so these read like the asset report.
 * Used by pages/ticket-overview.tsx.
 */
import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { useState } from 'react';
import type { ChartSeries, ChartTone, TicketOverviewSummary } from '../types';
import { CARD_HEADING_TINT } from './card-heading';
import { FILL } from './chart-tones';
import { fold, FoldToggle, StackBar } from './tabular-charts';
import { categoryKey } from './ticket-labels';

/** Rows a list shows before folding, as the asset report's department chart. */
const TOP_ROWS = 10;

/** Category order and colours of the design's department card. */
const CATEGORY_TONES: [string, ChartTone][] = [
    ['hardware', 'blue'],
    ['software', 'violet'],
    ['network', 'green'],
    ['telephone', 'amber'],
    ['cctv', 'red'],
    ['other', 'gray'],
];

const BAD = 'font-semibold text-red-600 dark:text-red-400';

type DepartmentRow = TicketOverviewSummary['by_department'][number];
type StaffRow = TicketOverviewSummary['by_assignee'][number];

function Heading({ title, sub }: { title: React.ReactNode; sub?: React.ReactNode }) {
    return (
        <div className={cn(CARD_HEADING_TINT, 'border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3')}>
            <span className="text-sm font-semibold">{title}</span>
            {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
        </div>
    );
}

function rate(met: number, measured: number): number | null {
    return measured === 0 ? null : Math.round((met / measured) * 1000) / 10;
}

/** "86.7%" — red under the SLA goal, "—" when nothing was measured. */
function SlaRate({ value, goal }: { value: number | null; goal: number }) {
    return <span className={cn('text-right font-mono', value !== null && value < goal && BAD)}>{value === null ? '—' : `${value}%`}</span>;
}

/** A count where zero reads as nothing to see. */
function Count({ value, className }: { value: number; className?: string }) {
    return <span className={cn('text-right font-mono', value === 0 && 'text-muted-foreground', className)}>{value}</span>;
}

/** Name, category bar, Ticket, ทัน SLA, ยังไม่ปิด — header and rows share the columns. */
const DEPT_GRID = 'grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3rem_4.5rem_4.5rem] items-center gap-3 px-5';

export function DepartmentStacksCard({ rows, slaGoal }: { rows: DepartmentRow[]; slaGoal: number }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [expanded, setExpanded] = useState(false);

    const series: ChartSeries[] = CATEGORY_TONES.map(([key, tone]) => ({ key, tone, label_key: categoryKey(key) }));
    // Only the categories that appear anywhere get a legend entry.
    const legend = series.filter((s) => rows.some((r) => (r.categories[s.key] ?? 0) > 0));

    const departments = rows.filter((r) => r.department_id !== null);
    const apart = rows.filter((r) => r.department_id === null);
    // Never more than 10 departments before "แสดงทั้งหมด" — even an 11th folds into "อื่น ๆ".
    const folding = fold(departments, TOP_ROWS, expanded, 0);
    const shown: (DepartmentRow & { others?: boolean })[] = [...folding.shown];
    if (folding.rest.length > 0) {
        const sum = (pick: (r: DepartmentRow) => number) => folding.rest.reduce((total, r) => total + pick(r), 0);
        const categories: Record<string, number> = {};
        for (const s of series) categories[s.key] = sum((r) => r.categories[s.key] ?? 0);
        const met = sum((r) => r.sla_met);
        const measured = sum((r) => r.sla_measured);
        shown.push({
            department_id: null,
            name: t('rep_chart_others').replace('{n}', String(folding.rest.length)),
            name_th: null,
            count: sum((r) => r.count),
            categories,
            open: sum((r) => r.open),
            sla_met: met,
            sla_measured: measured,
            sla_rate: rate(met, measured),
            others: true,
        });
    }
    // Widths against the largest row on show; the apart row is drawn on its own scale.
    const scale = Math.max(1, ...shown.map((r) => r.count));
    const name = (r: DepartmentRow) => (lang === 'th' && r.name_th) || r.name || t('rep_no_department');

    const row = (r: DepartmentRow, rowScale: number, muted: boolean, note?: string) => (
        <div className={cn(DEPT_GRID, 'py-2.5 text-sm')}>
            <span className="min-w-0">
                <span className={cn('block truncate', muted && 'text-muted-foreground')} title={name(r)}>
                    {name(r)}
                </span>
                {note && <span className="text-muted-foreground block truncate text-[11px]">{note}</span>}
            </span>
            <StackBar values={r.categories} series={series} scale={rowScale} />
            <span className="text-right font-mono font-semibold">{r.count.toLocaleString()}</span>
            <SlaRate value={r.sla_rate} goal={slaGoal} />
            <Count value={r.open} />
        </div>
    );

    return (
        <Card className="flex flex-col overflow-hidden">
            <Heading
                title={t('rep_by_department')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {legend.map((s) => (
                            <span key={s.key} className="inline-flex items-center gap-1.5">
                                <i className={cn('inline-block h-2.5 w-2.5 rounded-sm', FILL[s.tone])} />
                                {t(s.label_key)}
                            </span>
                        ))}
                    </span>
                }
            />
            {rows.length === 0 ? (
                <div className="text-muted-foreground py-10 text-center text-sm">{t('rep_no_data')}</div>
            ) : (
                // The five columns need room; a phone scrolls them sideways rather than crushing the bar.
                <div className="overflow-x-auto">
                    <div className="min-w-[36rem]">
                        <div className={cn(DEPT_GRID, 'text-muted-foreground border-border border-b py-2 text-xs font-semibold')}>
                            <span>{t('rep_col_department')}</span>
                            <span>{t('rep_col_categories')}</span>
                            <span className="text-right">{t('rep_col_tickets')}</span>
                            <span className="text-right">{t('rep_col_sla_rate')}</span>
                            <span className="text-right">{t('rep_col_open')}</span>
                        </div>
                        <div className="divide-border/60 divide-y">
                            {shown.map((r, i) => (
                                <div key={r.others ? 'others' : (r.department_id ?? i)}>{row(r, scale, !!r.others)}</div>
                            ))}
                        </div>
                        {apart.length > 0 && (
                            <div className="border-border divide-border/60 divide-y border-t-2 border-dashed">
                                {apart.map((r) => (
                                    <div key="none">{row(r, r.count, true, t('rep_chart_apart_note'))}</div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
            {folding.folds && <FoldToggle open={expanded} total={departments.length} onToggle={() => setExpanded((open) => !open)} />}
        </Card>
    );
}

export function StaffPerformanceCard({ rows, slaGoal }: { rows: StaffRow[]; slaGoal: number }) {
    const t = useT();
    const most = Math.max(1, ...rows.map((r) => r.completed));

    const columns: Column<StaffRow>[] = [
        {
            key: 'name',
            header: t('rep_col_staff'),
            className: 'max-w-[14rem] truncate whitespace-nowrap',
            render: (r) => <span title={r.name ?? undefined}>{r.name ?? '—'}</span>,
        },
        {
            key: 'completed',
            header: t('rep_col_completed'),
            align: 'right',
            // Bar against whoever closed the most, so the ranking reads at a glance.
            render: (r) => (
                <div className="flex items-center justify-end gap-2">
                    <span className="bg-brand/70 block h-1.5 rounded-full" style={{ width: `${(r.completed / most) * 60}px` }} />
                    <span className="font-mono font-semibold">{r.completed}</span>
                </div>
            ),
        },
        {
            key: 'canceled',
            header: t('rep_col_canceled'),
            align: 'right',
            render: (r) => <Count value={r.canceled} className="text-muted-foreground" />,
        },
        {
            key: 'median',
            // The median: half the cases closed faster — the hint says so on hover.
            header: <span title={t('rep_col_time_hint')}>{t('rep_col_time')}</span>,
            align: 'right',
            className: 'whitespace-nowrap',
            render: (r) => <span className="font-mono">{r.median_resolve_hours === null ? '—' : `${r.median_resolve_hours} ${t('rep_hours')}`}</span>,
        },
        { key: 'sla', header: t('rep_col_sla_rate'), align: 'right', render: (r) => <SlaRate value={r.sla_rate} goal={slaGoal} /> },
    ];

    return (
        <Card className="overflow-hidden">
            <Heading title={t('rep_by_assignee')} sub={t('rep_by_assignee_sub')} />
            {/* Inset in the card and paged like the "รายการ Ticket" table below it. */}
            <div className="p-5">
                <DataTable columns={columns} rows={rows} rowKey={(r) => r.assignee_id} emptyState={t('rep_no_data')} />
            </div>
        </Card>
    );
}
