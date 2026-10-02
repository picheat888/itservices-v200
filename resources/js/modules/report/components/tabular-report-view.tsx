/**
 * The body of every tabular report page (pages/<slug>.tsx, e.g. pages/assets-by-status-department.tsx):
 * fetches the report's own definition (filters/columns/formats) from the backend, then its rows
 * (with summary + pagination), and renders them through the shared filter bar, summary strip,
 * cell formatter and export / schedule dialogs. The columns and filters stay defined once, in the
 * report's backend TabularReport class, so the screen, Excel, PDF and scheduled mail never differ;
 * a page that needs more than this can wrap or replace it.
 */
import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import { useDialogParam } from '@/shared/hooks/use-dialog-param';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { isAxiosError } from 'axios';
import { AlertCircle, CalendarClock, Clock, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCanOpen } from '../hooks/use-can-open';
import { useHiddenColumns } from '../hooks/use-hidden-columns';
import { useCreateSchedule, useExportTabular, useTabularDefinition, useTabularRows } from '../hooks/use-reports';
import { useTabularFilters } from '../hooks/use-tabular-filters';
import type { TabularColumnDef, TabularDefinition, TabularFilters } from '../types';
import { CARD_HEADING_TINT } from './card-heading';
import { ColumnPicker } from './column-picker';
import { ExportReportDialog } from './export-report-dialog';
import { ReportHeader } from './report-header';
import { CardHeadingSkeleton, DataTableSkeleton, FilterBarSkeleton, KpiRowSkeleton } from './report-skeletons';
import { tabularFilterChips } from './schedule-filter-summary';
import { ScheduleReportDialog, scheduleCoverage } from './schedule-report-dialog';
import { SummaryStrip } from './summary-strip';
import { TabularCell } from './tabular-cell';
import { ChartsSkeleton, TabularCharts } from './tabular-charts';
import { TabularFilterBar } from './tabular-filter-bar';

const REPORT_DIALOGS = ['export', 'schedule'] as const;

function errorMessageFor(t: (key: string) => string, error: unknown): string {
    const status = isAxiosError(error) ? error.response?.status : undefined;
    if (status === 403) return t('rep_err_no_access');
    if (status === 404) return t('rep_err_not_found');
    if (status === 422) return t('rep_err_filter_invalid');
    return t('rep_err_load_failed');
}

/** "2026-10-02 09:41" — the same shape as the Ticket & SLA page's server-stamped time. */
function stamp(ms: number): string {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ErrorCard({ message }: { message: string }) {
    return (
        <Card className="flex flex-col items-center gap-2 border-dashed p-10 text-center">
            <AlertCircle className="text-muted-foreground h-8 w-8" />
            <p className="text-muted-foreground text-sm">{message}</p>
        </Card>
    );
}

/** Rows + summary for the current filters — owns its own page/perPage so the parent can
 *  reset both to page 1 simply by remounting this (`key={JSON.stringify(filters)}`).
 *  Reports the current row total up to the parent, for the export dialog's scope note. */
function TabularReportRows({
    reportKey,
    visibleColumns,
    filters,
    hasCharts,
    showsTable,
    onTotalChange,
    extras,
}: {
    reportKey: string;
    extras: TabularReportExtras;
    /** TabularDefinition.has_charts — holds the charts' place until the first rows arrive. */
    hasCharts: boolean;
    /** TabularDefinition.shows_table — a chart-led report lists no rows on screen. */
    showsTable: boolean;
    /** The definition's columns minus the ones hidden with the column picker. */
    visibleColumns: TabularColumnDef[];
    filters: TabularFilters;
    onTotalChange: (total: number) => void;
}) {
    const t = useT();
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const { data, isLoading, isFetching, isError, error, dataUpdatedAt } = useTabularRows(reportKey, filters, page, perPage, true);
    const canOpen = useCanOpen();

    useEffect(() => {
        if (data) onTotalChange(data.meta.total);
    }, [data, onTotalChange]);

    if (isError) {
        return <ErrorCard message={errorMessageFor(t, error)} />;
    }

    // Codes, dates, numbers and names stay on one line (the table scrolls sideways instead);
    // free text is cut at a readable width and keeps its full value in a tooltip.
    const columns: Column<Record<string, unknown> & { id: number; _links?: Record<string, string> }>[] = visibleColumns.map((column) => ({
        key: column.key,
        header: t(column.label_key),
        align: column.type === 'number' || column.type === 'money' || column.type === 'hours_left' ? 'right' : undefined,
        className: column.type === 'text' || column.type === 'localized' ? 'max-w-[22rem] truncate whitespace-nowrap' : 'whitespace-nowrap',
        render: (row) => {
            const href = row._links?.[column.key];
            return <TabularCell column={column} value={row[column.key]} href={href && canOpen(href) ? href : undefined} />;
        },
    }));

    return (
        <div className="space-y-4">
            {/* Tiles pulse until the first rows arrive, so the table does not jump down when they do. */}
            {data ? <SummaryStrip items={data.summary} /> : <KpiRowSkeleton count={4} className="lg:grid-cols-4" />}
            {data ? data.charts.length > 0 && <TabularCharts charts={data.charts} /> : hasCharts && <ChartsSkeleton />}
            {extras.beforeTable?.({ filters })}
            {/* The rows in a headed card with the table inset, as the Ticket & SLA page's
                "รายการ Ticket" — the same heading tint, "ข้อมูล ณ" line and padding. */}
            {showsTable && (
                <Card className="overflow-hidden">
                    <div className={cn(CARD_HEADING_TINT, 'border-border flex items-center justify-between gap-3 border-b px-5 py-3')}>
                        <span className="text-sm font-semibold">{t('rep_rows_generic')}</span>
                        {data && (
                            <span className="text-muted-foreground text-xs">
                                {t('rep_rows_count').replace('{n}', data.meta.total.toLocaleString())}
                            </span>
                        )}
                    </div>
                    <div className="space-y-3 p-5">
                        {dataUpdatedAt > 0 && (
                            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                                <Clock className="h-3.5 w-3.5" />
                                {t('rep_generated_at').replace('{t}', stamp(dataUpdatedAt))}
                            </div>
                        )}
                        <DataTable
                            columns={columns}
                            rows={data?.data ?? []}
                            rowKey={(r) => r.id}
                            rowClassName={extras.rowClassName}
                            loading={isLoading || isFetching}
                            server={{
                                page,
                                pageSize: perPage,
                                total: data?.meta.total ?? 0,
                                onPageChange: setPage,
                                onPageSizeChange: (s) => {
                                    setPerPage(s);
                                    setPage(1);
                                },
                            }}
                        />
                    </div>
                </Card>
            )}
        </div>
    );
}

/**
 * Everything that needs the loaded definition to exist: the export button, the filter
 * bar, the rows, and the export dialog. Mounted only once `useTabularDefinition` has
 * resolved, and keyed by `definition.key` in the parent — so `useTabularFilters` always
 * seeds synchronously from a real definition, and switching to a different report key
 * remounts this fresh rather than reusing the previous report's filter state.
 */
function TabularReportBody({
    reportKey,
    stem,
    definition,
    extras,
}: {
    reportKey: string;
    stem: string;
    definition: TabularDefinition;
    extras: TabularReportExtras;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { filters, patch, reset } = useTabularFilters(definition);
    const { hidden, visibleColumns, toggle, showAll } = useHiddenColumns(definition);
    // Export / schedule dialogs live in the URL (?dialog=export|schedule) — shareable, and Back closes them.
    const [dialog, setDialog] = useDialogParam(REPORT_DIALOGS);
    const exportOpen = dialog === 'export';
    const setExportOpen = (open: boolean) => setDialog(open ? 'export' : null);
    const scheduleOpen = dialog === 'schedule';
    const setScheduleOpen = (open: boolean) => setDialog(open ? 'schedule' : null);
    const [rowsTotal, setRowsTotal] = useState(0);
    const exportMut = useExportTabular();
    const scheduleMut = useCreateSchedule();
    // Only sent when something is hidden, so a full export stays a plain request. A report with
    // no table on screen has no column picker either, so its files always carry every column —
    // even if columns were hidden in this browser before the table went.
    const exportColumns = definition.shows_table && hidden.length > 0 ? visibleColumns.map((c) => c.key) : undefined;

    return (
        <>
            <ReportHeader
                title={t(`rep_${stem}_title`)}
                description={t(`rep_${stem}_desc`)}
                actions={
                    <>
                        {definition.shows_table && <ColumnPicker definition={definition} hidden={hidden} onToggle={toggle} onShowAll={showAll} />}
                        <Button variant="outline" onClick={() => setScheduleOpen(true)}>
                            <CalendarClock className="h-4 w-4" />
                            {t('rep_schedule')}
                        </Button>
                        <Button onClick={() => setExportOpen(true)}>
                            <Download className="h-4 w-4" />
                            {t('rep_export')}
                        </Button>
                    </>
                }
            />
            <TabularFilterBar
                definition={definition}
                filters={filters}
                onChange={patch}
                onReset={reset}
                hidden={extras.hiddenFilters}
                leading={extras.filterLead?.({ filters, patch })}
            />
            <TabularReportRows
                key={JSON.stringify(filters)}
                reportKey={reportKey}
                visibleColumns={visibleColumns}
                filters={filters}
                hasCharts={definition.has_charts}
                showsTable={definition.shows_table}
                onTotalChange={setRowsTotal}
                extras={extras}
            />
            <ExportReportDialog
                open={exportOpen}
                onOpenChange={setExportOpen}
                title={t(`rep_${stem}_title`)}
                total={rowsTotal}
                formats={definition.formats}
                note={exportColumns ? t('rep_export_columns_note').replace('{n}', String(exportColumns.length)) : undefined}
                filterChips={tabularFilterChips(definition, filters, t, lang, true)}
                onExport={(format) => exportMut.mutateAsync({ key: reportKey, filters, format, columns: exportColumns })}
                isPending={exportMut.isPending}
                error={exportMut.error}
                onReset={exportMut.reset}
            />
            <ScheduleReportDialog
                open={scheduleOpen}
                onOpenChange={setScheduleOpen}
                title={t(`rep_${stem}_title`)}
                formats={definition.formats}
                coverage={scheduleCoverage(definition.filters.filter((f) => f.type === 'date').map((f) => f.name))}
                filterChips={tabularFilterChips(definition, filters, t, lang)}
                onSubmit={(input) =>
                    scheduleMut
                        .mutateAsync({ kind: 'tabular', key: reportKey, filters, columns: exportColumns, input })
                        .then(() => useToastStore.getState().push(t('rep_schedule_created'), 'success', undefined, undefined, { duration: 6000 }))
                }
                isPending={scheduleMut.isPending}
                error={scheduleMut.error}
                onReset={scheduleMut.reset}
            />
        </>
    );
}

/** One tabular report, by its backend key ("assets.by_status_department"). */
/**
 * What a report's own page can add around the shared body (pages/tickets-backlog.tsx does):
 * filters it draws itself instead of the bar, something at the head of the bar, cards between
 * the summary and the table, and a class per table row.
 */
export interface TabularReportExtras {
    hiddenFilters?: string[];
    filterLead?: (ctx: { filters: TabularFilters; patch: (next: TabularFilters) => void }) => React.ReactNode;
    beforeTable?: (ctx: { filters: TabularFilters }) => React.ReactNode;
    rowClassName?: (row: Record<string, unknown>) => string | undefined;
}

export function TabularReportView({ reportKey: key, extras = {} }: { reportKey: string; extras?: TabularReportExtras }) {
    const t = useT();
    const stem = key.replace('.', '_');
    const defQuery = useTabularDefinition(key);
    const definition = defQuery.data;

    return (
        <div className="space-y-4">
            {defQuery.isError ? (
                <>
                    <ReportHeader title={t(`rep_${stem}_title`)} description={t(`rep_${stem}_desc`)} />
                    <ErrorCard message={errorMessageFor(t, defQuery.error)} />
                </>
            ) : defQuery.isLoading || !definition ? (
                <div className="space-y-4">
                    {/* The heading shows at once; its actions arrive with the definition. */}
                    <ReportHeader title={t(`rep_${stem}_title`)} description={t(`rep_${stem}_desc`)} />
                    {/* Filters, summary tiles and table in their own shapes. */}
                    <FilterBarSkeleton fields={4} />
                    <KpiRowSkeleton count={4} className="lg:grid-cols-4" />
                    <Card className="overflow-hidden">
                        <CardHeadingSkeleton />
                        <div className="space-y-3 p-5">
                            <Skeleton className="h-3 w-40" />
                            <DataTableSkeleton />
                        </div>
                    </Card>
                </div>
            ) : (
                <TabularReportBody key={definition.key} reportKey={key} stem={stem} definition={definition} extras={extras} />
            )}
        </div>
    );
}
