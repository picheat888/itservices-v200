// Body of every tabular report page: definition, filter bar, summary tiles, paged rows, export and schedule dialogs.
import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import { DisabledReason } from '@/shared/components/disabled-reason';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { isAxiosError } from 'axios';
import { AlertCircle, CalendarClock, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useHiddenColumns } from '../hooks/use-hidden-columns';
import { useReportDialog } from '../hooks/use-report-rights';
import { useCreateSchedule, useExportTabular, useTabularDefinition, useTabularRows, useTabularSummary } from '../hooks/use-reports';
import { useTabularFilters } from '../hooks/use-tabular-filters';
import type { TabularColumnDef, TabularDefinition, TabularFilters } from '../types';
import { CARD_HEADING_TINT } from './card-heading';
import { ColumnPicker } from './column-picker';
import { ExportReportDialog } from './export-report-dialog';
import { ReportHeader } from './report-header';
import { CardHeadingSkeleton, DataTableSkeleton, FilterBarSkeleton, KpiRowSkeleton } from './report-skeletons';
import { tabularFilterChips } from './schedule-filter-summary';
import { ScheduleReportDialog, scheduleCoverage } from './schedule-report-dialog';
import { SummaryStrip, summaryColumns } from './summary-strip';
import { TabularCell } from './tabular-cell';
import { ChartsSkeleton, TabularCharts } from './tabular-charts';
import { TabularEmptyState } from './tabular-empty-state';
import { TabularFilterBar } from './tabular-filter-bar';

const PAGE_SIZES = [20, 50, 100];

export function errorMessageFor(t: (key: string) => string, error: unknown): string {
    const status = isAxiosError(error) ? error.response?.status : undefined;
    if (status === 403) return t('rep_err_no_access');
    if (status === 404) return t('rep_err_not_found');
    if (status === 422) return t('rep_err_filter_invalid');
    return t('rep_err_load_failed');
}

export function ErrorCard({ message }: { message: string }) {
    return (
        <Card role="alert" className="flex flex-col items-center gap-2 border-dashed p-10 text-center">
            <AlertCircle aria-hidden className="text-muted-foreground h-8 w-8" />
            <p className="text-muted-foreground text-sm">{message}</p>
        </Card>
    );
}

/** Rows + summary for the current filters; page and page size live in the URL (?page, ?per). */
function TabularReportRows({
    reportKey,
    visibleColumns,
    filters,
    hasCharts,
    showsTable,
    onTotalChange,
    onPatch,
    extras,
    columnPicker,
    emptyState,
}: {
    reportKey: string;
    extras: TabularReportExtras;
    /** The column picker, shown at the right of the rows card heading. */
    columnPicker: React.ReactNode;
    /** What the table says when the filters leave no rows (TabularEmptyState). */
    emptyState: React.ReactNode;
    /** TabularDefinition.has_charts — holds the charts' place until the first rows arrive. */
    hasCharts: boolean;
    /** TabularDefinition.shows_table — a chart-led report lists no rows on screen. */
    showsTable: boolean;
    /** The definition's columns minus the ones hidden with the column picker. */
    visibleColumns: TabularColumnDef[];
    filters: TabularFilters;
    onTotalChange: (total: number) => void;
    /** The page's filter patch — handed to `extras.beforeTable` so its cards can filter the page. */
    onPatch: (next: TabularFilters) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [params, setParams] = useSearchParams();
    const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
    const perParam = Number(params.get('per'));
    const perPage = PAGE_SIZES.includes(perParam) ? perParam : PAGE_SIZES[0];
    const setPaging = (next: { page: number; per?: number }) =>
        setParams(
            (p) => {
                if (next.page > 1) p.set('page', String(next.page));
                else p.delete('page');
                if (next.per !== undefined) {
                    if (next.per !== PAGE_SIZES[0]) p.set('per', String(next.per));
                    else p.delete('per');
                }
                return p;
            },
            { replace: true },
        );
    // Filters that only shape the cards above stay out of the rows request, so switching one does not refetch the list.
    const cardOnly = extras.cardOnlyFilters ?? [];
    const rowFilters = cardOnly.length > 0 ? Object.fromEntries(Object.entries(filters).filter(([name]) => !cardOnly.includes(name))) : filters;
    const { data, isLoading, isFetching, isError, error } = useTabularRows(reportKey, rowFilters, page, perPage, true);
    // The tiles and charts come once per filter set; a page turn fetches only the rows.
    const headline = useTabularSummary(reportKey, rowFilters, !extras.hideSummary || hasCharts);
    const canOpen = useCanOpen();
    const rowsTitle = t((typeof extras.rowsTitle === 'function' ? extras.rowsTitle(filters) : extras.rowsTitle) ?? 'rep_rows_generic');
    const rowsHead = extras.rowsHead?.({ filters, patch: onPatch }) ?? null;

    useEffect(() => {
        if (data) onTotalChange(data.meta.total);
    }, [data, onTotalChange]);

    if (isError || headline.isError) {
        return <ErrorCard message={errorMessageFor(t, error ?? headline.error)} />;
    }

    const columns: Column<Record<string, unknown> & { id: number; _links?: Record<string, string> }>[] = visibleColumns.map((column) => ({
        key: column.key,
        header: t(column.label_key),
        align: column.type === 'number' || column.type === 'money' || column.type === 'hours_left' ? 'right' : undefined,
        className: column.type === 'text' || column.type === 'localized' ? 'max-w-[22rem] truncate whitespace-nowrap' : 'whitespace-nowrap',
        render: (row) => {
            const own = extras.renderCell?.(column.key, row, { filters, patch: onPatch });
            if (own !== undefined) return own;
            const href = row._links?.[column.key];
            return <TabularCell column={column} value={row[column.key]} href={href && canOpen(href) ? href : undefined} />;
        },
    }));

    return (
        <div className="space-y-4">
            {!extras.hideSummary &&
                (headline.data ? (
                    <SummaryStrip items={headline.data.summary} />
                ) : (
                    <KpiRowSkeleton count={extras.tiles ?? 4} className={summaryColumns(extras.tiles ?? 4)} />
                ))}
            {headline.data ? headline.data.charts.length > 0 && <TabularCharts charts={headline.data.charts} /> : hasCharts && <ChartsSkeleton />}
            {extras.beforeTable?.({ filters, patch: onPatch })}
            {showsTable && (
                <Card id="report-rows" className="scroll-mt-4 overflow-clip">
                    {rowsHead}
                    <div className={cn(!rowsHead && CARD_HEADING_TINT, 'border-border flex items-center justify-between gap-3 border-b px-5 py-3')}>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                            <h2 className="text-sm font-semibold">{rowsTitle}</h2>
                            {extras.rowsLead?.({ filters, patch: onPatch })}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                            {data && (
                                <span className="text-muted-foreground text-xs tabular-nums">
                                    {t('rep_rows_count').replace('{n}', data.meta.total.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US'))}
                                </span>
                            )}
                            <span aria-hidden className="bg-border h-5 w-px" />
                            {columnPicker}
                        </div>
                    </div>
                    <div className="p-5">
                        <DataTable
                            columns={columns}
                            rows={data?.data ?? []}
                            rowKey={(r) => r.id}
                            rowClassName={extras.rowClassName}
                            emptyState={emptyState}
                            caption={rowsTitle}
                            loading={isLoading || isFetching}
                            server={{
                                page,
                                pageSize: perPage,
                                total: data?.meta.total ?? 0,
                                onPageChange: (next) => setPaging({ page: next, per: perPage }),
                                onPageSizeChange: (size) => setPaging({ page: 1, per: size }),
                            }}
                        />
                    </div>
                </Card>
            )}
            {extras.afterTable?.({ filters, patch: onPatch })}
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
    const { filters, patch, reset } = useTabularFilters(definition, { keepPage: extras.cardOnlyFilters });
    const { hidden, visibleColumns, toggle, reset: resetColumns } = useHiddenColumns(definition);
    // Export / schedule dialogs live in the URL (?dialog=export|schedule) — shareable, and Back closes them.
    const { dialog, setDialog, canExport, canSchedule } = useReportDialog();
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
    // View settings (ReportFilter::viewOnly — what a table groups by) live on the page's own control:
    // out of the filter bar, never "filtered", and kept when the filters are cleared.
    const viewFilters = definition.filters.filter((f) => f.view).map((f) => f.name);
    // Columns a page draws inside another cell stay in the rows and the files, but get no column of their own.
    const inner = extras.innerColumns ?? [];
    const drawnColumns = visibleColumns.filter((c) => !inner.includes(c.key));
    const pickable = inner.length > 0 ? { ...definition, columns: definition.columns.filter((c) => !inner.includes(c.key)) } : definition;

    return (
        <>
            <ReportHeader
                title={t(`rep_${stem}_title`)}
                description={t(`rep_${stem}_desc`)}
                actions={
                    <>
                        <DisabledReason reason={canSchedule ? null : t('rep_no_schedule_right')} label={t('rep_schedule')}>
                            <Button variant="outline" onClick={() => setScheduleOpen(true)} disabled={!canSchedule}>
                                <CalendarClock className="h-4 w-4" />
                                {t('rep_schedule')}
                            </Button>
                        </DisabledReason>
                        <DisabledReason reason={canExport ? null : t('rep_no_export_right')} label={t('rep_export')}>
                            <Button onClick={() => setExportOpen(true)} disabled={!canExport}>
                                <Download className="h-4 w-4" />
                                {t('rep_export')}
                            </Button>
                        </DisabledReason>
                    </>
                }
            />
            <TabularFilterBar
                definition={definition}
                filters={filters}
                onChange={patch}
                onReset={() => {
                    // Clearing the filters keeps how the page is shown (the view filters) as it is.
                    const keep = Object.fromEntries(viewFilters.map((name) => [name, filters[name]]));
                    reset();
                    patch(keep);
                }}
                hidden={[...(extras.hiddenFilters ?? []), ...viewFilters]}
                viewOnly={viewFilters}
                leading={extras.filterLead?.({ filters, patch })}
                trailing={extras.filterTrail?.({ filters, patch })}
            />
            <TabularReportRows
                reportKey={reportKey}
                visibleColumns={drawnColumns}
                filters={filters}
                hasCharts={definition.has_charts}
                showsTable={definition.shows_table}
                onTotalChange={setRowsTotal}
                onPatch={patch}
                extras={extras}
                columnPicker={<ColumnPicker definition={pickable} hidden={hidden} onToggle={toggle} onReset={resetColumns} />}
                emptyState={
                    extras.emptyState?.({ filters, patch }) ?? <TabularEmptyState definition={definition} filters={filters} onPatch={patch} />
                }
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

/** One tabular report, by its backend key ("assets.overview"). */
/**
 * What a report's own page can add around the shared body (pages/tickets-backlog.tsx does):
 * filters it draws itself instead of the bar, something at the head of the bar, cards between
 * the summary and the table, and a class per table row.
 */
export interface TabularReportExtras {
    /** How many summary tiles the report shows, so the loading row has the same shape. */
    tiles?: number;
    /** The page draws its own tiles (in beforeTable) instead of the rows' summary strip. */
    hideSummary?: boolean;
    hiddenFilters?: string[];
    /** Columns the page draws inside another column's cell (a ticket number under its subject) — kept in
     *  each row and in the files, left out of the table's own columns and the column picker. */
    innerColumns?: string[];
    filterLead?: (ctx: { filters: TabularFilters; patch: (next: TabularFilters) => void }) => React.ReactNode;
    /** Something at the end of the bar, after its controls (a "data as of" note). */
    filterTrail?: (ctx: { filters: TabularFilters; patch: (next: TabularFilters) => void }) => React.ReactNode;
    /** View filters that only shape the cards above the list (a card's "แยกตาม"): left out of the rows
     *  request and its cache key, and changing one keeps the list's page. */
    cardOnlyFilters?: string[];
    /** A control beside the rows card's heading, for a filter that narrows only the list. */
    rowsLead?: (ctx: { filters: TabularFilters; patch: (next: TabularFilters) => void }) => React.ReactNode;
    /** A band at the top of the rows card, above its heading (what the list is narrowed to); null draws nothing. */
    rowsHead?: (ctx: { filters: TabularFilters; patch: (next: TabularFilters) => void }) => React.ReactNode;
    beforeTable?: (ctx: { filters: TabularFilters; patch: (next: TabularFilters) => void }) => React.ReactNode;
    /** Cards under the rows card. */
    afterTable?: (ctx: { filters: TabularFilters; patch: (next: TabularFilters) => void }) => React.ReactNode;
    /** What the table says when it has no rows, in place of the shared TabularEmptyState. */
    emptyState?: (ctx: { filters: TabularFilters; patch: (next: TabularFilters) => void }) => React.ReactNode;
    rowClassName?: (row: Record<string, unknown>) => string | undefined;
    /** i18n key of the rows card's heading when the generic "รายการ" says too little for this page —
     *  or a function of the filters, so the heading names what the table holds now. */
    rowsTitle?: string | ((filters: TabularFilters) => string);
    /** Draw one column's cell the page's own way; undefined = the shared TabularCell. */
    renderCell?: (
        key: string,
        row: Record<string, unknown>,
        ctx: { filters: TabularFilters; patch: (next: TabularFilters) => void },
    ) => React.ReactNode | undefined;
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
                    <KpiRowSkeleton count={extras.tiles ?? 4} className={summaryColumns(extras.tiles ?? 4)} />
                    <Card className="overflow-hidden">
                        <CardHeadingSkeleton />
                        <div className="p-5">
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
