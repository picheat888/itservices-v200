import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useUiStore } from '@/stores/ui';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

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
    /** Extra classes for a single row — for marking rows that need to stand out (e.g. a left accent). */
    rowClassName?: (row: T) => string | undefined;
    /** Hide the built-in pagination bar — use when the parent handles server-side pagination */
    hidePagination?: boolean;
    /** Content rendered on the right of the search row (e.g. an Add button). */
    actions?: React.ReactNode;
    /** Content rendered on the left, right next to the search box (e.g. filter/sort selects). */
    filters?: React.ReactNode;
    /** Show shimmering skeleton rows instead of the empty state while data loads. */
    loading?: boolean;
    /** Custom content for the empty state (defaults to a plain "No data" line). */
    emptyState?: React.ReactNode;
    /** Cap the table body height (e.g. "55vh") so rows scroll under a sticky header — keeps search/pagination in view inside a dialog. */
    maxBodyHeight?: string;
    /** Fill the parent's height: rows-per-page is computed from the available height,
     *  the rows-per-page picker is hidden, and the body never scrolls (page over instead).
     *  Opt-in; requires the parent to give the table a definite height. */
    fillHeight?: boolean;
    /** Approx rendered row height in px. Used by `fillHeight` to derive rows-per-page, and
     *  (whenever set) to pin filler rows so a short last page stays the same height as a full
     *  one — keeps a fixed-`pageSize` table from resizing between pages. Match the real row's
     *  height; raise it for taller rows (icons / two-line cells). */
    rowHeight?: number;
    /** Fixed client-side rows per page (hides the rows-per-page picker). Ignored when
     *  `server` or `fillHeight` is set. */
    pageSize?: number;
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
    rowClassName,
    hidePagination,
    actions,
    filters,
    loading,
    emptyState,
    maxBodyHeight,
    fillHeight,
    rowHeight,
    pageSize: fixedPageSize,
    server,
}: DataTableProps<T>) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [query, setQuery] = useState('');
    const [clientPageSize, setClientPageSize] = useState(fixedPageSize ?? 20);
    const [clientPage, setClientPage] = useState(1);

    // fillHeight: measure the body container and derive how many rows fit.
    const bodyRef = useRef<HTMLDivElement>(null);
    const [autoSize, setAutoSize] = useState(10);
    useEffect(() => {
        if (!fillHeight) return;
        const el = bodyRef.current;
        if (!el) return;
        const ROW_H = rowHeight ?? 45; // approx rendered row height (over-estimate → clip, so err high)
        const THEAD_H = 40; // approx header row height
        const compute = () => {
            const h = el.clientHeight;
            if (h > 0) setAutoSize(Math.max(1, Math.floor((h - THEAD_H) / ROW_H)));
        };
        compute();
        const ro = new ResizeObserver(compute);
        ro.observe(el);
        return () => ro.disconnect();
    }, [fillHeight, rowHeight]);

    const filtered = useMemo(() => {
        if (!query || !searchable) return rows;
        const q = query.toLowerCase();
        return rows.filter((r) => searchable(r).toLowerCase().includes(q));
    }, [rows, query, searchable]);

    // Server-paginated tables render `rows` as-is (the parent fetched just this page);
    // client tables slice the filtered set locally. Pagination state/handlers route accordingly.
    const pageSize = server ? server.pageSize : fillHeight ? autoSize : clientPageSize;
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
        <div className={cn(fillHeight ? 'flex h-full flex-col gap-3' : 'space-y-3')}>
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
                ref={bodyRef}
                className={cn(
                    'border-border rounded-xl border',
                    // Scroll sideways rather than clip. A table wider than its card used to lose
                    // the overhang with no way to reach it — eleven pixels of the last column on a
                    // wide screen, a whole column on a laptop, and nothing on screen to say so.
                    fillHeight ? 'min-h-0 flex-1 overflow-hidden' : maxBodyHeight ? 'overflow-auto' : 'overflow-x-auto',
                )}
                style={maxBodyHeight && !fillHeight ? { maxHeight: maxBodyHeight } : undefined}
            >
                {/* fillHeight: `h-full` makes the browser stretch the rows to fill the body exactly,
                    so the floored row count never leaves a gap under the last row. */}
                <table className={cn('w-full text-sm', fillHeight && 'h-full')}>
                    <thead className={cn(maxBodyHeight && 'bg-card sticky top-0 z-10')}>
                        <tr className="border-border bg-muted/40 border-b">
                            {columns.map((c) => (
                                <th
                                    key={c.key}
                                    className={cn(
                                        // A header is one label; broken across lines it reads as
                                        // several and makes the header row taller than every data row.
                                        'text-muted-foreground px-[var(--row-px)] py-[var(--row-py)] text-[11.5px] font-semibold tracking-wide whitespace-nowrap uppercase',
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
                                    {emptyState ?? (lang === 'th' ? 'ไม่พบข้อมูล' : 'No data')}
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            pageRows.map((row) => (
                                <tr
                                    key={rowKey(row)}
                                    onClick={() => onRowClick?.(row)}
                                    className={cn(
                                        // border-b-0 on the last row, NOT border-0: the latter zeroes every
                                        // side, which silently ate the left accent a rowClassName had set.
                                        'border-border/60 border-b last:border-b-0',
                                        onRowClick && 'hover:bg-accent/50 cursor-pointer',
                                        rowClassName?.(row),
                                    )}
                                >
                                    {columns.map((c) => (
                                        <td key={c.key} className={cn('px-[var(--row-px)] py-[var(--row-py)]', alignClass(c.align), c.className)}>
                                            {c.render ? c.render(row) : ((row as Record<string, unknown>)[c.key] as React.ReactNode)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        {/* Fixed / fill height: pad short pages with empty rows so the table height
                            (and the pagination bar below it) never shifts between pages, and the last
                            page doesn't leave a big gap under the final row. In fillHeight mode each
                            filler is pinned to `rowHeight` so it matches the real rows exactly. */}
                        {!loading &&
                            (fixedPageSize || fillHeight) &&
                            pageRows.length > 0 &&
                            pageRows.length < pageSize &&
                            Array.from({ length: pageSize - pageRows.length }).map((_, i) => (
                                <tr key={`filler-${i}`} aria-hidden style={rowHeight ? { height: rowHeight } : undefined}>
                                    {columns.map((c) => (
                                        <td key={c.key} className="px-[var(--row-px)] py-[var(--row-py)]">
                                            <span className="invisible text-sm">–</span>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            {!hidePagination && (
                <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-sm">
                    {/* Left: rows-per-page picker (when adjustable). */}
                    <div className="flex items-center gap-3">
                        {!(fillHeight || fixedPageSize) && (
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
                        )}
                    </div>

                    {/* Right: range summary sits next to the page navigation. */}
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
