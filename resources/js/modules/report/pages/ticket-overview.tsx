/**
 * "Ticket & SLA overview" report page (/reports/tickets-overview): filters, KPI tiles,
 * weekly chart, SLA by priority, backlog age, breakdowns and the row table, plus Export.
 * Layout follows the "รายงาน Ticket & SLA" screen of docs/mockup/report-module.html.
 */
import { useT } from '@/lang';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUiStore } from '@/stores/ui';
import { ChevronLeft, Clock, Download } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BacklogAging } from '../components/backlog-aging';
import { HorizontalBars } from '../components/horizontal-bars';
import { KpiTile } from '../components/kpi-tile';
import { categoryKey, priorityKey } from '../components/ticket-labels';
import { TicketReportFilterBar } from '../components/ticket-report-filter-bar';
import { TicketReportTable } from '../components/ticket-report-table';
import { WeeklyTicketChart } from '../components/weekly-ticket-chart';
import { useTicketOverview } from '../hooks/use-reports';
import { useTicketReportFilters } from '../hooks/use-ticket-report-filters';

const PRIORITY_FILL: Record<string, string> = { critical: 'bg-red-500', high: 'bg-amber-500', medium: 'bg-emerald-500', low: 'bg-emerald-500' };

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
    return (
        <Card className="overflow-hidden">
            <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-3">
                <span className="font-semibold">{title}</span>
                {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
            </div>
            {children}
        </Card>
    );
}

export default function TicketOverviewReportPage() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { filters, patch, reset } = useTicketReportFilters();
    const { data, isLoading } = useTicketOverview(filters);
    const [exportOpen, setExportOpen] = useState(false);

    const fmt = (v: number | null) => (v === null ? '—' : String(v));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <Link to="/reports" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
                        <ChevronLeft className="h-4 w-4" />
                        {t('rep_center_title')}
                    </Link>
                    <h1 className="mt-1 text-2xl font-bold">{t('rep_tickets_overview_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('rep_tickets_overview_desc')}</p>
                </div>
                <Button onClick={() => setExportOpen(true)} disabled={!data}>
                    <Download className="h-4 w-4" />
                    {t('rep_export')}
                </Button>
            </div>

            <TicketReportFilterBar filters={filters} options={data?.options} onChange={patch} onReset={reset} />

            {isLoading || !data ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                        {Array.from({ length: 5 }, (_, i) => (
                            <Skeleton key={i} className="h-24" />
                        ))}
                    </div>
                    <Skeleton className="h-72" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                        <KpiTile
                            label={t('rep_kpi_total')}
                            value={String(data.kpi.total)}
                            footer={t('rep_vs_previous').replace('{n}', String(data.previous.total))}
                        />
                        <KpiTile
                            label={t('rep_kpi_completed')}
                            value={String(data.kpi.completed)}
                            footer={t('rep_kpi_canceled').replace('{n}', String(data.kpi.canceled))}
                        />
                        <KpiTile
                            label={t('rep_kpi_sla')}
                            badge={<span className="text-xs">{t('rep_kpi_goal').replace('{n}', String(data.sla_goal))}</span>}
                            value={fmt(data.kpi.sla_rate)}
                            unit={data.kpi.sla_rate === null ? undefined : '%'}
                            alert={data.kpi.sla_rate !== null && data.kpi.sla_rate < data.sla_goal}
                        />
                        <KpiTile
                            label={t('rep_kpi_median')}
                            value={fmt(data.kpi.median_resolve_hours)}
                            unit={data.kpi.median_resolve_hours === null ? undefined : t('rep_hours')}
                            footer={data.kpi.p90_resolve_hours === null ? undefined : t('rep_kpi_p90').replace('{n}', String(data.kpi.p90_resolve_hours))}
                        />
                        <KpiTile
                            label={t('rep_kpi_backlog')}
                            badge={
                                data.backlog.breached > 0 ? (
                                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                                        {t('rep_kpi_breached').replace('{n}', String(data.backlog.breached))}
                                    </span>
                                ) : undefined
                            }
                            value={String(data.backlog.open + data.backlog.in_progress)}
                            footer={t('rep_kpi_backlog_split').replace('{a}', String(data.backlog.open)).replace('{b}', String(data.backlog.in_progress))}
                            alert={data.backlog.breached > 0}
                        />
                    </div>

                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
                        <Section title={t('rep_weekly_title')} sub={`■ ${t('rep_weekly_opened')}  ■ ${t('rep_weekly_closed')}`}>
                            <div className="px-4 py-3">
                                <WeeklyTicketChart weeks={data.weekly} />
                            </div>
                        </Section>
                        <div className="space-y-3">
                            <Section title={t('rep_sla_priority_title')} sub={t('rep_sla_priority_sub')}>
                                <HorizontalBars
                                    bars={data.sla_by_priority.map((p) => ({ key: p.priority, label: t(priorityKey(p.priority)), value: p.rate, tone: PRIORITY_FILL[p.priority] }))}
                                    max={100}
                                    unit="%"
                                    goal={data.sla_goal}
                                    emptyLabel={t('rep_no_data')}
                                />
                            </Section>
                            <Section title={t('rep_aging_title')}>
                                <BacklogAging aging={data.backlog.aging} />
                            </Section>
                        </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-3">
                        <Section title={t('rep_by_category')}>
                            <HorizontalBars
                                bars={data.by_category.map((c) => ({ key: c.category, label: t(categoryKey(c.category)), value: c.count }))}
                                max={Math.max(1, ...data.by_category.map((c) => c.count))}
                                emptyLabel={t('rep_no_data')}
                            />
                        </Section>
                        <Section title={t('rep_by_department')}>
                            <table className="w-full text-sm">
                                <thead className="bg-muted text-muted-foreground text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-2 text-left">{t('rep_col_department')}</th>
                                        <th className="px-4 py-2 text-right">{t('rep_col_tickets')}</th>
                                        <th className="px-4 py-2 text-right">{t('rep_col_sla')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.by_department.map((d) => (
                                        <tr key={d.department_id ?? 'none'} className="border-border border-t">
                                            <td className="px-4 py-2">{(lang === 'th' && d.name_th) || d.name || t('rep_no_department')}</td>
                                            <td className="px-4 py-2 text-right font-mono">{d.count}</td>
                                            <td
                                                className={`px-4 py-2 text-right font-mono ${
                                                    d.sla_rate !== null && d.sla_rate < data.sla_goal ? 'font-bold text-red-600 dark:text-red-400' : ''
                                                }`}
                                            >
                                                {d.sla_rate === null ? '—' : `${d.sla_rate}%`}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>
                        <Section title={t('rep_by_assignee')}>
                            <table className="w-full text-sm">
                                <thead className="bg-muted text-muted-foreground text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-2 text-left">{t('rep_col_staff')}</th>
                                        <th className="px-4 py-2 text-right">{t('rep_col_closed')}</th>
                                        <th className="px-4 py-2 text-right">{t('rep_col_time')}</th>
                                    </tr>
                                </thead>
                                <tbody>
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
                        <div className="text-muted-foreground flex items-center gap-1.5 px-5 pt-3 text-xs">
                            <Clock className="h-3.5 w-3.5" />
                            {t('rep_generated_at').replace('{t}', data.generated_at)}
                        </div>
                        <TicketReportTable key={JSON.stringify(filters)} filters={filters} />
                    </Section>
                </>
            )}
            {/* ExportReportDialog is mounted here in Task 9 using exportOpen / setExportOpen. */}
            {exportOpen && null}
        </div>
    );
}
