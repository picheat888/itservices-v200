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
import { Skeleton } from '@/shared/ui/skeleton';
import { isAxiosError } from 'axios';
import { AlertCircle, ChevronLeft, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ExportReportDialog } from '../components/export-report-dialog';
import { SummaryStrip } from '../components/summary-strip';
import { TabularCell } from '../components/tabular-cell';
import { TabularFilterBar } from '../components/tabular-filter-bar';
import { useExportTabular, useTabularDefinition, useTabularRows } from '../hooks/use-reports';
import { useTabularFilters } from '../hooks/use-tabular-filters';
import type { TabularDefinition, TabularFilters } from '../types';

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
    definition,
    filters,
    onTotalChange,
}: {
    reportKey: string;
    definition: TabularDefinition;
    filters: TabularFilters;
    onTotalChange: (total: number) => void;
}) {
    const t = useT();
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const { data, isLoading, isFetching, isError, error } = useTabularRows(reportKey, filters, page, perPage, true);

    useEffect(() => {
        if (data) onTotalChange(data.meta.total);
    }, [data, onTotalChange]);

    if (isError) {
        return <ErrorCard message={errorMessageFor(t, error)} />;
    }

    const columns: Column<Record<string, unknown> & { id: number }>[] = definition.columns.map((column) => ({
        key: column.key,
        header: t(column.label_key),
        align: column.type === 'number' || column.type === 'money' ? 'right' : undefined,
        render: (row) => <TabularCell column={column} value={row[column.key]} />,
    }));

    return (
        <div className="space-y-4">
            {data && <SummaryStrip items={data.summary} />}
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
    const [exportOpen, setExportOpen] = useState(false);
    const [rowsTotal, setRowsTotal] = useState(0);
    const exportMut = useExportTabular();

    return (
        <>
            <div className="flex justify-end">
                <Button onClick={() => setExportOpen(true)}>
                    <Download className="h-4 w-4" />
                    {t('rep_export')}
                </Button>
            </div>
            <TabularFilterBar definition={definition} filters={filters} onChange={patch} onReset={reset} />
            <TabularReportRows
                key={JSON.stringify(filters)}
                reportKey={reportKey}
                definition={definition}
                filters={filters}
                onTotalChange={setRowsTotal}
            />
            <ExportReportDialog
                open={exportOpen}
                onOpenChange={setExportOpen}
                title={t(`rep_${stem}_title`)}
                total={rowsTotal}
                formats={definition.formats}
                onExport={(format) => exportMut.mutateAsync({ key: reportKey, filters, format })}
                isPending={exportMut.isPending}
                isError={exportMut.isError}
                onReset={exportMut.reset}
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
            <div>
                <Link to="/reports" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
                    <ChevronLeft className="h-4 w-4" />
                    {t('rep_center_title')}
                </Link>
                <h1 className="mt-1 text-2xl font-bold">{t(`rep_${stem}_title`)}</h1>
                <p className="text-muted-foreground text-sm">{t(`rep_${stem}_desc`)}</p>
            </div>

            {defQuery.isError ? (
                <ErrorCard message={errorMessageFor(t, defQuery.error)} />
            ) : defQuery.isLoading || !definition ? (
                <div className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton key={i} className="h-24" />
                        ))}
                    </div>
                    <Skeleton className="h-72" />
                </div>
            ) : (
                <TabularReportBody key={definition.key} reportKey={key} stem={stem} definition={definition} />
            )}
        </div>
    );
}
