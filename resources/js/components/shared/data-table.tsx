import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface Column<T> {
    key: string;
    header: string;
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
    /** Show shimmering skeleton rows instead of the empty state while data loads. */
    loading?: boolean;
}

const PAGE_SIZES = [20, 50, 100];

export function DataTable<T>({ columns, rows, searchable, rowKey, onRowClick, hidePagination, actions, loading }: DataTableProps<T>) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [query, setQuery] = useState('');
    const [pageSize, setPageSize] = useState(20);
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => {
        if (!query || !searchable) return rows;
        const q = query.toLowerCase();
        return rows.filter((r) => searchable(r).toLowerCase().includes(q));
    }, [rows, query, searchable]);

    const total = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pageCount);
    const start = (safePage - 1) * pageSize;
    // When hidePagination is true, show all passed rows without slicing
    const pageRows = hidePagination ? filtered : filtered.slice(start, start + pageSize);

    const alignClass = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

    return (
        <div className="space-y-3">
            {(searchable || actions) && (
                <div className="flex items-center justify-between gap-2">
                    {searchable ? (
                        <div className="relative w-full max-w-xs">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                        <span />
                    )}
                    {actions}
                </div>
            )}

            <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/40">
                            {columns.map((c) => (
                                <th
                                    key={c.key}
                                    className={cn(
                                        'px-[var(--row-px)] py-[var(--row-py)] text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground',
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
                                <tr key={`skeleton-${r}`} className="border-b border-border/60 last:border-0">
                                    {columns.map((c) => (
                                        <td key={c.key} className={cn('px-[var(--row-px)] py-[var(--row-py)]', alignClass(c.align))}>
                                            <div
                                                className={cn(
                                                    'h-4 animate-pulse rounded bg-muted',
                                                    c.align === 'right' ? 'ml-auto w-12' : c.align === 'center' ? 'mx-auto w-16' : 'w-3/4 max-w-[160px]',
                                                )}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        {!loading && pageRows.length === 0 && (
                            <tr>
                                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
                                    {lang === 'th' ? 'ไม่พบข้อมูล' : 'No data'}
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            pageRows.map((row) => (
                            <tr
                                key={rowKey(row)}
                                onClick={() => onRowClick?.(row)}
                                className={cn(
                                    'border-b border-border/60 last:border-0',
                                    onRowClick && 'cursor-pointer hover:bg-accent/50',
                                )}
                            >
                                {columns.map((c) => (
                                    <td key={c.key} className={cn('px-[var(--row-px)] py-[var(--row-py)]', alignClass(c.align), c.className)}>
                                        {c.render ? c.render(row) : (row as Record<string, unknown>)[c.key] as React.ReactNode}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {!hidePagination && <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
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
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={safePage <= 1}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-40"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="px-1 font-medium text-foreground">
                            {safePage} / {pageCount}
                        </span>
                        <button
                            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                            disabled={safePage >= pageCount}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-40"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>}
        </div>
    );
}
