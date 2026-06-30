import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface Column<T> {
    key: string;
    header: React.ReactNode;
    render?: (row: T) => React.ReactNode;
    className?: string;
    align?: 'left' | 'right' | 'center';
}

interface DataTableProps<T> {
    columns: Column<T>[];
    rows: T[];
    searchable?: (row: T) => string;
    rowKey: (row: T) => string | number;
    onRowClick?: (row: T) => void;
    /** Hide the built-in pagination bar — use when the parent handles server-side pagination */
    hidePagination?: boolean;
    /** Content rendered on the right of the search row (e.g. an Add button). */
    actions?: React.ReactNode;
    /** Content rendered on the left, right next to the search box (e.g. filter/sort selects). */
    filters?: React.ReactNode;
    /** Show shimmering skeleton rows instead of the empty state while data loads. */
    loading?: boolean;
    /** Cap the table body height (e.g. "55vh") so rows scroll under a sticky header — keeps search/pagination in view inside a dialog. */
    maxBodyHeight?: string;
    /**
     * Server-side pagination. When provided, the table renders `rows` as the current
     * page (no client slicing/searching) and delegates page/size changes to the parent.
     * Leave undefined for the default client-side behaviour.
     */
    server?: {
        page: number;
        pageSize: number;
        total: number;
        onPageChange: (page: number) => void;
        onPageSizeChange: (size: number) => void;
    };
}

const PAGE_SIZES = [20, 50, 100];

export function DataTable<T>({
    columns,
    rows,
    searchable,
    rowKey,
    onRowClick,
    hidePagination,
    actions,
    filters,
    loading,
    maxBodyHeight,
    server,
}: DataTableProps<T>) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [query, setQuery] = useState('');
    const [clientPageSize, setClientPageSize] = useState(20);
    const [clientPage, setClientPage] = useState(1);

    const filtered = useMemo(() => {
        if (!query || !searchable) return rows;
        const q = query.toLowerCase();
        return rows.filter((r) => searchable(r).toLowerCase().includes(q));
    }, [rows, query, searchable]);

    // Server-paginated tables render `rows` as-is (the parent fetched just this page);
    // client tables slice the filtered set locally. Pagination state/handlers route accordingly.
    const pageSize = server ? server.pageSize : clientPageSize;
    const total = server ? server.total : filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = server ? server.page : Math.min(clientPage, pageCount);
    const start = (safePage - 1) * pageSize;
    const setPage = (p: number) => (server ? server.onPageChange(p) : setClientPage(p));
    const setPageSize = (s: number) => (server ? server.onPageSizeChange(s) : setClientPageSize(s));
    // Server: rows are already the page. Client: slice (unless pagination is hidden).
    const pageRows = server ? rows : hidePagination ? filtered : filtered.slice(start, start + pageSize);

    const alignClass = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

    return (
        <div className="space-y-3">
            {(searchable || actions || filters) && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                        {searchable ? (
                            <div className="relative w-full max-w-xs">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    value={query}
                                    onChange={(e) => {
                                        setQuery(e.target.value);
                                        setPage(1);
                                    }}
                                    placeholder={t('search_placeholder')}
                                    className="pl-9"
                                />
                            </div>
                        ) : (
                            !filters && <span />
                        )}
                        {filters}
                    </div>
                    {actions}
                </div>
            )}

            <div
                className={cn('border-border rounded-xl border', maxBodyHeight ? 'overflow-y-auto' : 'overflow-hidden')}
                style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
            >
                <table className="w-full text-sm">
                    <thead className={cn(maxBodyHeight && 'bg-card sticky top-0 z-10')}>
                        <tr className="border-border bg-muted/40 border-b">
                            {columns.map((c) => (
                                <th
                                    key={c.key}
                                    className={cn(
                                        'text-muted-foreground px-[var(--row-px)] py-[var(--row-py)] text-[11.5px] font-semibold tracking-wide uppercase',
                                        alignClass(c.align),
                                    )}
                                >
                                    {c.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading &&
                            Array.from({ length: 6 }).map((_, r) => (
                                <tr key={`skeleton-${r}`} className="border-border/60 border-b last:border-0">
                                    {columns.map((c) => (
                                        <td key={c.key} className={cn('px-[var(--row-px)] py-[var(--row-py)]', alignClass(c.align))}>
                                            <div
                                                className={cn(
                                                    'bg-muted h-4 animate-pulse rounded',
                                                    c.align === 'right'
                                                        ? 'ml-auto w-12'
                                                        : c.align === 'center'
                                                          ? 'mx-auto w-16'
                                                          : 'w-3/4 max-w-[160px]',
                                                )}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        {!loading && pageRows.length === 0 && (
                            <tr>
                                <td colSpan={columns.length} className="text-muted-foreground px-4 py-10 text-center">
                                    {lang === 'th' ? 'ไม่พบข้อมูล' : 'No data'}
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            pageRows.map((row) => (
                                <tr
                                    key={rowKey(row)}
                                    onClick={() => onRowClick?.(row)}
                                    className={cn('border-border/60 border-b last:border-0', onRowClick && 'hover:bg-accent/50 cursor-pointer')}
                                >
                                    {columns.map((c) => (
                                        <td key={c.key} className={cn('px-[var(--row-px)] py-[var(--row-py)]', alignClass(c.align), c.className)}>
                                            {c.render ? c.render(row) : ((row as Record<string, unknown>)[c.key] as React.ReactNode)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            {!hidePagination && (
                <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2">
                        <span>{lang === 'th' ? 'แสดง' : 'Rows per page'}</span>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(v) => {
                                setPageSize(Number(v));
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="h-8 w-[72px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PAGE_SIZES.map((s) => (
                                    <SelectItem key={s} value={String(s)}>
                                        {s}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-3">
                        <span>
                            {total === 0 ? 0 : start + 1}–{Math.min(start + pageSize, total)} {lang === 'th' ? 'จาก' : 'of'} {total}
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(Math.max(1, safePage - 1))}
                                disabled={safePage <= 1}
                                className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="text-foreground px-1 font-medium">
                                {safePage} / {pageCount}
                            </span>
                            <button
                                onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                                disabled={safePage >= pageCount}
                                className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
