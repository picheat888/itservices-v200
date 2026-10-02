/**
 * "Ticket & SLA overview" report page (/reports/tickets-overview): filters, KPI tiles,
 * weekly chart, SLA by priority, backlog age, breakdowns and the row table, plus Export.
 * Layout follows the "รายงาน Ticket & SLA" screen of docs/mockup/report-module.html.
 */
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { isAxiosError } from 'axios';
import { AlertCircle, CalendarClock, Clock, Download } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BacklogAging } from '../components/backlog-aging';
import { CARD_HEADING_TINT } from '../components/card-heading';
import { ExportReportDialog } from '../components/export-report-dialog';
import { HorizontalBars } from '../components/horizontal-bars';
import { KpiTile } from '../components/kpi-tile';
import { ReportHeader } from '../components/report-header';
import { compactRange } from '../components/report-scope';
import {
    AgingSkeleton,
    BarRowsSkeleton,
    CardHeadingSkeleton,
    ChartSkeleton,
    DataTableSkeleton,
    KpiRowSkeleton,
    TableRowsSkeleton,
} from '../components/report-skeletons';
import { ScheduleReportDialog } from '../components/schedule-report-dialog';
import { categoryKey, priorityKey } from '../components/ticket-labels';
import { TicketReportFilterBar } from '../components/ticket-report-filter-bar';
import { TicketReportTable } from '../components/ticket-report-table';
import { WeeklyTicketChart } from '../components/weekly-ticket-chart';
import { useCreateSchedule, useExportTicketOverview, useTicketOverview } from '../hooks/use-reports';
import { useTicketReportFilters } from '../hooks/use-ticket-report-filters';

const PRIORITY_FILL: Record<string, string> = { critical: 'bg-red-500', high: 'bg-amber-500', medium: 'bg-emerald-500', low: 'bg-emerald-500' };

/** A card's heading row: title on the left, a short note (legend, unit, "Top 6") on the right. */
function SectionHeading({ title, sub, className }: { title: React.ReactNode; sub?: React.ReactNode; className?: string }) {
    return (
        <div className={cn(CARD_HEADING_TINT, 'border-border flex items-center justify-between gap-3 border-b px-5 py-3', className)}>
            <span className="text-sm font-semibold">{title}</span>
            {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
        </div>
    );
}

function Section({
    title,
    sub,
    className,
    children,
}: {
    title: React.ReactNode;
    sub?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <Card className={cn('overflow-hidden', className)}>
            <SectionHeading title={title} sub={sub} />
            {children}
        </Card>
    );
}

/** A breakdown table's row when the range has nothing to break down. */
function EmptyRow({ label }: { label: string }) {
    return (
        <tr>
            <td colSpan={3} className="text-muted-foreground py-6 text-center text-sm">
                {label}
            </td>
        </tr>
    );
}

/**
 * ▲/▼ coloured by what the move means for the figure, as the hub's snapshot strip does
 * (snapshot-strip.tsx): better is green, worse red. Both changes on this page are "lower is
 * better" — fewer tickets coming in, less time to resolve one.
 */
const BETTER = 'text-emerald-600 dark:text-emerald-400';
const WORSE = 'text-red-600 dark:text-red-400';

/** "▼ 0.6 ชม." — the resolve-time change against the period before: faster is better. */
function HoursChange({ current, previous, unit }: { current: number | null; previous: number | null; unit: string }) {
    if (current === null || previous === null || current === previous) return null;
    const diff = Math.round((current - previous) * 10) / 10;

    return (
        <span className={cn('font-semibold', diff < 0 ? BETTER : WORSE)}>
            {diff > 0 ? '▲' : '▼'} {Math.abs(diff)} {unit}
        </span>
    );
}

/**
 * "▲ 17% จาก 35 ในช่วงก่อนหน้า" — the ticket-count change against the period before. More
 * tickets coming in means more problems, so up reads red and down green.
 */
function Change({ current, previous, label }: { current: number; previous: number; label: string }) {
    if (previous === 0 || current === previous) return <>{label}</>;
    const pct = Math.round(((current - previous) / previous) * 100);

    return (
        <span className="inline-flex items-center gap-1">
            <span className={cn('font-semibold', pct > 0 ? WORSE : BETTER)}>
                {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%
            </span>
            {label}
        </span>
    );
}

export default function TicketOverviewReportPage() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { filters, patch, reset } = useTicketReportFilters();
    const { data, isLoading, isError, error } = useTicketOverview(filters);
    const [exportOpen, setExportOpen] = useState(false);
    const exportMut = useExportTicketOverview();
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const scheduleMut = useCreateSchedule();

    const fmt = (v: number | null) => (v === null ? '—' : String(v));

    // Client-side range check runs before any request; server errors (403/422/other) are
    // reported once the request comes back. Either way the skeleton never spins forever.
    const rangeOrderInvalid = filters.from > filters.to;
    const errorStatus = isAxiosError(error) ? error.response?.status : undefined;
    const errorMessage = rangeOrderInvalid
        ? t('rep_err_range_order')
        : isError
          ? errorStatus === 403
              ? t('rep_err_no_access')
              : errorStatus === 422
                ? t('rep_err_range_invalid')
                : t('rep_err_load_failed')
          : null;

    return (
        <div className="space-y-4">
            <ReportHeader
                title={t('rep_tickets_overview_title')}
                description={t('rep_tickets_overview_desc')}
                actions={
                    <>
                        <Button variant="outline" onClick={() => setScheduleOpen(true)} disabled={!data}>
                            <CalendarClock className="h-4 w-4" />
                            {t('rep_schedule')}
                        </Button>
                        <Button onClick={() => setExportOpen(true)} disabled={!data}>
                            <Download className="h-4 w-4" />
                            {t('rep_export')}
                        </Button>
                    </>
                }
            />

            <TicketReportFilterBar filters={filters} options={data?.options} onChange={patch} onReset={reset} />

            {errorMessage ? (
                <Card className="flex flex-col items-center gap-2 border-dashed p-10 text-center">
                    <AlertCircle className="text-muted-foreground h-8 w-8" />
                    <p className="text-muted-foreground text-sm">{errorMessage}</p>
                </Card>
            ) : isLoading || !data ? (
                // The page's own shape — tiles, chart + SLA/age card, three breakdowns, the
                // ticket table — so each piece lands where its bars were.
                <div className="space-y-4" aria-hidden="true">
                    <KpiRowSkeleton count={5} className="lg:grid-cols-5" />
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
                        <Card className="overflow-hidden">
                            <CardHeadingSkeleton />
                            <ChartSkeleton className="h-64" />
                        </Card>
                        <Card className="flex flex-col overflow-hidden">
                            <CardHeadingSkeleton />
                            <BarRowsSkeleton rows={4} />
                            <CardHeadingSkeleton className="border-t" />
                            <AgingSkeleton />
                        </Card>
                    </div>
                    <div className="grid gap-3 xl:grid-cols-3">
                        <Card className="overflow-hidden">
                            <CardHeadingSkeleton />
                            <BarRowsSkeleton rows={5} />
                        </Card>
                        {[0, 1].map((i) => (
                            <Card key={i} className="overflow-hidden">
                                <CardHeadingSkeleton />
                                <TableRowsSkeleton rows={5} />
                            </Card>
                        ))}
                    </div>
                    <Card className="overflow-hidden">
                        <CardHeadingSkeleton note={false} />
                        <div className="space-y-3 p-5">
                            <Skeleton className="h-3 w-40" />
                            <DataTableSkeleton cols={8} />
                        </div>
                    </Card>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                        <KpiTile
                            label={t('rep_kpi_total')}
                            value={String(data.kpi.total)}
                            footer={
                                <Change
                                    current={data.kpi.total}
                                    previous={data.previous.total}
                                    label={t('rep_vs_previous').replace('{n}', String(data.previous.total))}
                                />
                            }
                        />
                        <KpiTile
                            label={t('rep_kpi_completed')}
                            value={String(data.kpi.completed)}
                            footer={t('rep_kpi_canceled').replace('{n}', String(data.kpi.canceled))}
                        />
                        <KpiTile
                            label={t('rep_kpi_sla')}
                            badge={<StatusBadge tone="green">{t('rep_kpi_goal').replace('{n}', String(data.sla_goal))}</StatusBadge>}
                            value={fmt(data.kpi.sla_rate)}
                            unit={data.kpi.sla_rate === null ? undefined : '%'}
                            alert={data.kpi.sla_rate !== null && data.kpi.sla_rate < data.sla_goal}
                            meter={data.kpi.sla_rate === null ? undefined : { value: data.kpi.sla_rate, goal: data.sla_goal }}
                            footer={
                                data.previous.sla_rate === null ? undefined : t('rep_vs_previous_sla').replace('{n}', String(data.previous.sla_rate))
                            }
                        />
                        <KpiTile
                            label={t('rep_kpi_median')}
                            value={fmt(data.kpi.median_resolve_hours)}
                            unit={data.kpi.median_resolve_hours === null ? undefined : t('rep_hours')}
                            footer={
                                data.kpi.p90_resolve_hours === null ? undefined : (
                                    <span className="inline-flex items-center gap-1.5">
                                        <HoursChange
                                            current={data.kpi.median_resolve_hours}
                                            previous={data.previous.median_resolve_hours}
                                            unit={t('rep_hours')}
                                        />
                                        {t('rep_kpi_p90').replace('{n}', String(data.kpi.p90_resolve_hours))}
                                    </span>
                                )
                            }
                        />
                        <KpiTile
                            label={t('rep_kpi_backlog')}
                            badge={
                                data.backlog.breached > 0 ? (
                                    <StatusBadge tone="amber">{t('rep_kpi_breached').replace('{n}', String(data.backlog.breached))}</StatusBadge>
                                ) : undefined
                            }
                            value={String(data.backlog.open + data.backlog.in_progress)}
                            footer={t('rep_kpi_backlog_split')
                                .replace('{a}', String(data.backlog.open))
                                .replace('{b}', String(data.backlog.in_progress))}
                            alert={data.backlog.breached > 0}
                        />
                    </div>

                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
                        <Section
                            // The range in the title, so the weeks read as the chosen period's, not the latest ones.
                            title={
                                <>
                                    {t('rep_weekly_title')}
                                    <span className="text-muted-foreground ml-2 text-xs font-normal">
                                        {compactRange(data.range.from, data.range.to, lang)}
                                    </span>
                                </>
                            }
                            sub={
                                // Swatches in the bars' own fills (weekly-ticket-chart.tsx), so the key reads.
                                <span className="inline-flex items-center gap-3">
                                    <span className="inline-flex items-center gap-1.5">
                                        <i className="bg-brand inline-block h-2.5 w-2.5 rounded-sm" />
                                        {t('rep_weekly_opened')}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <i className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                                        {t('rep_weekly_closed')}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <i className="inline-block h-0.5 w-3 rounded-full bg-red-500" />
                                        {t('rep_weekly_backlog')}
                                    </span>
                                </span>
                            }
                        >
                            <div className="px-4 py-3">
                                <WeeklyTicketChart weeks={data.weekly} range={data.range} />
                            </div>
                        </Section>
                        {/* One card, as in the design: SLA by priority, then backlog age. The card is as
                            tall as the chart beside it and the age chart takes what is left. */}
                        <Card className="flex flex-col overflow-hidden">
                            <SectionHeading title={t('rep_sla_priority_title')} sub={t('rep_sla_priority_sub')} />
                            <HorizontalBars
                                bars={data.sla_by_priority.map((p) => ({
                                    key: p.priority,
                                    label: t(priorityKey(p.priority)),
                                    value: p.rate,
                                    tone: PRIORITY_FILL[p.priority],
                                }))}
                                max={100}
                                unit="%"
                                goal={data.sla_goal}
                                emptyLabel={t('rep_no_data')}
                            />
                            <SectionHeading
                                className="border-t"
                                title={t('rep_aging_title')}
                                sub={t('rep_aging_total').replace('{n}', String(Object.values(data.backlog.aging).reduce((sum, n) => sum + n, 0)))}
                            />
                            <BacklogAging aging={data.backlog.aging} />
                        </Card>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-3">
                        <Section title={t('rep_by_category')} sub={t('rep_by_category_sub')}>
                            <HorizontalBars
                                bars={data.by_category.map((c) => ({ key: c.category, label: t(categoryKey(c.category)), value: c.count }))}
                                max={Math.max(1, ...data.by_category.map((c) => c.count))}
                                emptyLabel={t('rep_no_data')}
                            />
                        </Section>
                        <Section title={t('rep_by_department')} sub={t('rep_top_n').replace('{n}', String(data.by_department.length))}>
                            <table className="w-full text-sm">
                                <thead className="bg-muted text-muted-foreground text-xs">
                                    <tr>
                                        <th className="px-4 py-2 text-left">{t('rep_col_department')}</th>
                                        <th className="px-4 py-2 text-right">{t('rep_col_tickets')}</th>
                                        <th className="px-4 py-2 text-right">{t('rep_col_sla')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.by_department.length === 0 && <EmptyRow label={t('rep_no_data')} />}
                                    {data.by_department.map((d) => (
                                        <tr key={d.department_id ?? 'none'} className="border-border border-t">
                                            <td className="px-4 py-2">{(lang === 'th' && d.name_th) || d.name || t('rep_no_department')}</td>
                                            <td className="px-4 py-2">
                                                {/* Bar against the busiest department, so the ranking reads at a glance. */}
                                                <div className="flex items-center justify-end gap-2">
                                                    <span
                                                        className="bg-brand/70 block h-1.5 rounded-full"
                                                        style={{
                                                            width: `${(d.count / Math.max(1, ...data.by_department.map((x) => x.count))) * 48}px`,
                                                        }}
                                                    />
                                                    <span className="font-mono">{d.count}</span>
                                                </div>
                                            </td>
                                            <td
                                                className={`px-4 py-2 text-right font-mono ${
                                                    d.sla_rate !== null && d.sla_rate < data.sla_goal
                                                        ? 'font-bold text-red-600 dark:text-red-400'
                                                        : ''
                                                }`}
                                            >
                                                {d.sla_rate === null ? '—' : `${d.sla_rate}%`}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>
                        {/* Only the top five fit here; "ดูทั้งหมด" opens the full, paginated staff
                            report on the same dates (and the category, when just one is picked —
                            that report filters one category at a time). */}
                        <Section
                            title={t('rep_by_assignee')}
                            sub={
                                <span className="flex items-center gap-2">
                                    {t('rep_top_n').replace('{n}', String(data.by_assignee.length))}
                                    <span aria-hidden>·</span>
                                    <Link
                                        to={`/reports/r/tickets.staff_performance?${new URLSearchParams({
                                            from: filters.from,
                                            to: filters.to,
                                            ...(filters.categories.length === 1 ? { category: filters.categories[0] } : {}),
                                        })}`}
                                        className="text-brand font-medium hover:underline"
                                    >
                                        {t('view_all')} →
                                    </Link>
                                </span>
                            }
                        >
                            <table className="w-full text-sm">
                                <thead className="bg-muted text-muted-foreground text-xs">
                                    <tr>
                                        <th className="px-4 py-2 text-left">{t('rep_col_staff')}</th>
                                        <th className="px-4 py-2 text-right">{t('rep_col_closed')}</th>
                                        <th className="px-4 py-2 text-right">{t('rep_col_time')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.by_assignee.length === 0 && <EmptyRow label={t('rep_no_data')} />}
                                    {data.by_assignee.map((a) => (
                                        <tr key={a.assignee_id} className="border-border border-t">
                                            <td className="px-4 py-2">{a.name ?? '—'}</td>
                                            <td className="px-4 py-2 text-right font-mono">{a.completed}</td>
                                            <td className="px-4 py-2 text-right font-mono">
                                                {a.median_resolve_hours === null ? '—' : `${a.median_resolve_hours} ${t('rep_hours')}`}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>
                    </div>

                    <Section title={t('rep_rows_title')} sub={undefined}>
                        {/* The table sits inset in the card, as the contracts "ทั้งหมด" tab does. */}
                        <div className="space-y-3 p-5">
                            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                                <Clock className="h-3.5 w-3.5" />
                                {t('rep_generated_at').replace('{t}', data.generated_at)}
                            </div>
                            <TicketReportTable key={JSON.stringify(filters)} filters={filters} />
                        </div>
                    </Section>
                </>
            )}
            <ScheduleReportDialog
                open={scheduleOpen}
                onOpenChange={setScheduleOpen}
                title={t('rep_tickets_overview_title')}
                formats={['xlsx', 'pdf']}
                coverage="range"
                onSubmit={(input) =>
                    scheduleMut
                        .mutateAsync({ kind: 'tickets', filters, input })
                        .then(() => useToastStore.getState().push(t('rep_schedule_created'), 'success', undefined, undefined, { duration: 6000 }))
                }
                isPending={scheduleMut.isPending}
                error={scheduleMut.error}
                onReset={scheduleMut.reset}
            />
            {data && (
                <ExportReportDialog
                    open={exportOpen}
                    onOpenChange={setExportOpen}
                    title={t('rep_tickets_overview_title')}
                    subtitle={`${filters.from} – ${filters.to}`}
                    total={data.kpi.total}
                    formats={['xlsx', 'pdf']}
                    onExport={(format) => exportMut.mutateAsync({ filters, format })}
                    isPending={exportMut.isPending}
                    error={exportMut.error}
                    onReset={exportMut.reset}
                />
            )}
        </div>
    );
}
