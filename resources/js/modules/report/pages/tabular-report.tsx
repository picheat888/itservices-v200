/**
 * Generic tabular report page (/reports/r/:key): fetches the report's own definition
 * (filters/columns/formats), then its rows (with summary + pagination), and renders them
 * through the shared filter bar, summary strip, cell formatter and export dialog — one
 * page serves every report declared as a `TabularReport` on the backend.
 */
import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useToastStore } from '@/stores/toast';
import { isAxiosError } from 'axios';
import { AlertCircle, CalendarClock, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ColumnPicker } from '../components/column-picker';
import { ExportReportDialog } from '../components/export-report-dialog';
import { ReportHeader } from '../components/report-header';
import { DataTableSkeleton, FilterBarSkeleton, KpiRowSkeleton } from '../components/report-skeletons';
import { ScheduleReportDialog, scheduleCoverage } from '../components/schedule-report-dialog';
import { SummaryStrip } from '../components/summary-strip';
import { TabularCell } from '../components/tabular-cell';
import { TabularFilterBar } from '../components/tabular-filter-bar';
import { useCanOpen } from '../hooks/use-can-open';
import { useHiddenColumns } from '../hooks/use-hidden-columns';
import { useCreateSchedule, useExportTabular, useTabularDefinition, useTabularRows } from '../hooks/use-reports';
import { useTabularFilters } from '../hooks/use-tabular-filters';
import type { TabularColumnDef, TabularDefinition, TabularFilters } from '../types';

function errorMessageFor(t: (key: string) => string, error: unknown): string {
    const status = isAxiosError(error) ? error.response?.status : undefined;
    if (status === 403) return t('rep_err_no_access');
    if (status === 404) return t('rep_err_not_found');
    if (status === 422) return t('rep_err_filter_invalid');
    return t('rep_err_load_failed');
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
    onTotalChange,
}: {
    reportKey: string;
    /** The definition's columns minus the ones hidden with the column picker. */
    visibleColumns: TabularColumnDef[];
    filters: TabularFilters;
    onTotalChange: (total: number) => void;
}) {
    const t = useT();
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const { data, isLoading, isFetching, isError, error } = useTabularRows(reportKey, filters, page, perPage, true);
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
        align: column.type === 'number' || column.type === 'money' ? 'right' : undefined,
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
            <DataTable
                columns={columns}
                rows={data?.data ?? []}
                rowKey={(r) => r.id}
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
    );
}

/**
 * Everything that needs the loaded definition to exist: the export button, the filter
 * bar, the rows, and the export dialog. Mounted only once `useTabularDefinition` has
 * resolved, and keyed by `definition.key` in the parent — so `useTabularFilters` always
 * seeds synchronously from a real definition, and switching to a different report key
 * remounts this fresh rather than reusing the previous report's filter state.
 */
function TabularReportBody({ reportKey, stem, definition }: { reportKey: string; stem: string; definition: TabularDefinition }) {
    const t = useT();
    const { filters, patch, reset } = useTabularFilters(definition);
    const { hidden, visibleColumns, toggle, showAll } = useHiddenColumns(definition);
    const [exportOpen, setExportOpen] = useState(false);
    const [rowsTotal, setRowsTotal] = useState(0);
    const exportMut = useExportTabular();
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const scheduleMut = useCreateSchedule();
    // Only sent when something is hidden, so a full export stays a plain request.
    const exportColumns = hidden.length > 0 ? visibleColumns.map((c) => c.key) : undefined;

    return (
        <>
            <ReportHeader
                title={t(`rep_${stem}_title`)}
                description={t(`rep_${stem}_desc`)}
                actions={
                    <>
                        <ColumnPicker definition={definition} hidden={hidden} onToggle={toggle} onShowAll={showAll} />
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
            <TabularFilterBar definition={definition} filters={filters} onChange={patch} onReset={reset} />
            <TabularReportRows
                key={JSON.stringify(filters)}
                reportKey={reportKey}
                visibleColumns={visibleColumns}
                filters={filters}
                onTotalChange={setRowsTotal}
            />
            <ExportReportDialog
                open={exportOpen}
                onOpenChange={setExportOpen}
                title={t(`rep_${stem}_title`)}
                total={rowsTotal}
                formats={definition.formats}
                note={exportColumns ? t('rep_export_columns_note').replace('{n}', String(exportColumns.length)) : undefined}
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

export default function TabularReportPage() {
    const t = useT();
    const { key = '' } = useParams<{ key: string }>();
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
                    <DataTableSkeleton />
                </div>
            ) : (
                <TabularReportBody key={definition.key} reportKey={key} stem={stem} definition={definition} />
            )}
        </div>
    );
}
