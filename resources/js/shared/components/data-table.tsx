import { useT } from '@/lang';
import { useHeldHeight } from '@/shared/hooks/use-held-height';
import { useTableFitsWidth } from '@/shared/hooks/use-table-fits-width';
import { matchesAllWords } from '@/shared/lib/search-words';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface Column<T> {
    key: string;
    header: React.ReactNode;
    render?: (row: T) => React.ReactNode;
    className?: string;
    align?: 'left' | 'right' | 'center';
    /**
     * A CSS width (e.g. '145px'). Any column declaring one switches the table to a fixed
     * layout, where widths come from here instead of from whatever the rows happen to hold —
     * so the grid does not shift when the same table is shown with different data. Columns
     * that declare none share what is left; give exactly one of them no width and it takes
     * the remainder, truncating rather than pushing the others around.
     */
    width?: string;
    /** Hide the column (header and cells) on screens narrower than this breakpoint (lg 1024, xl 1280, 2xl 1536), e.g. a tablet in portrait. */
    hideBelow?: 'lg' | 'xl' | '2xl';
    /** A column without a width keeps at least this much in a sized table (default 12rem); a bar or chip column can take less. */
    minWidth?: string;
    /** Pin the column to a side while the table scrolls sideways; it needs a px width, and offsets stack in column order. */
    sticky?: 'left' | 'right';
}

/** The least a column without a width keeps in a sized table, unless it sets its own minWidth. */
const FLEX_COLUMN_MIN = '12rem';

const HIDE_BELOW: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
    lg: 'hidden lg:table-cell',
    xl: 'hidden xl:table-cell',
    '2xl': 'hidden 2xl:table-cell',
};
const HIDE_BELOW_COL: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
    lg: 'hidden lg:table-column',
    xl: 'hidden xl:table-column',
    '2xl': 'hidden 2xl:table-column',
};

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
    /** Skeleton rows on a first load, when the caller already knows how many rows are coming (default 6). */
    loadingRows?: number;
    /** The first column's skeleton leads with an avatar circle, for tables whose rows open with a UserAvatar. */
    loadingAvatar?: boolean;
    /** Custom content for the empty state (defaults to a plain "No data" line). */
    emptyState?: React.ReactNode;
    /** Screen-reader name of the table (a visually hidden <caption>). */
    caption?: string;
    /** Extra classes for the <table> — e.g. a `min-w-[…]` so the one flexible column keeps room on a
     *  narrow screen and the table scrolls sideways instead of squeezing that column to nothing. */
    tableClassName?: string;
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
     * page (no client slicing/searching) and delegates page/size changes to the parent;
     * `onPageSizeChange` also returns the parent to page 1.
     * Leave undefined for the default client-side behaviour.
     */
    server?: {
        page: number;
        pageSize: number;
        total: number;
        onPageChange: (page: number) => void;
        onPageSizeChange: (size: number) => void;
    };
    /** Client-side search text owned by the parent (e.g. kept in the URL as ?search=). */
    search?: { value: string; onChange: (value: string) => void };
    /** Client-side pagination with the page + size owned by the parent (e.g. kept in the URL). */
    paging?: {
        page: number;
        pageSize: number;
        onPageChange: (page: number) => void;
        onPageSizeChange: (size: number) => void;
    };
}

/** Rows-per-page choices; the first is the default. */
export const PAGE_SIZES = [20, 50, 100];

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
    loadingRows,
    loadingAvatar,
    emptyState,
    caption,
    tableClassName,
    maxBodyHeight,
    fillHeight,
    rowHeight,
    pageSize: fixedPageSize,
    server,
    paging,
    search,
}: DataTableProps<T>) {
    const t = useT();
    // The box keeps its own text (a URL-backed value lands a tick late and would jump the caret).
    const [query, setOwnQuery] = useState(search?.value ?? '');
    useEffect(() => {
        if (search) setOwnQuery((current) => (current === search.value ? current : search.value));
    }, [search?.value]); // eslint-disable-line react-hooks/exhaustive-deps
    const setQuery = (value: string) => {
        setOwnQuery(value);
        search?.onChange(value);
    };
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
        if (!query || !searchable || server) return rows;
        return rows.filter((r) => matchesAllWords(searchable(r), query));
    }, [rows, query, searchable, server]);

    // Server-paginated tables render `rows` as-is (the parent fetched just this page);
    // client tables slice the filtered set locally. Pagination state/handlers route accordingly.
    const pageSize = server ? server.pageSize : fillHeight ? autoSize : (paging?.pageSize ?? clientPageSize);
    const total = server ? server.total : filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = server ? server.page : Math.min(paging?.page ?? clientPage, pageCount);
    // A server page past the end (an old link, a shrunk list) moves to the last page.
    useEffect(() => {
        if (server && !loading && server.total > 0 && server.page > pageCount) server.onPageChange(pageCount);
    }, [server?.page, server?.total, pageCount, loading]); // eslint-disable-line react-hooks/exhaustive-deps
    const start = (safePage - 1) * pageSize;
    const setPage = (p: number) => (server ? server.onPageChange(p) : paging ? paging.onPageChange(p) : setClientPage(p));
    const setPageSize = (s: number) => (server ? server.onPageSizeChange(s) : paging ? paging.onPageSizeChange(s) : setClientPageSize(s));
    // Server: rows are already the page. Client: slice (unless pagination is hidden).
    const pageRows = server ? rows : hidePagination ? filtered : filtered.slice(start, start + pageSize);

    // Steady pager: while a page loads, hold the table at the height it had, so the pager under
    // it stays under the reader's cursor and "next" can be clicked again and again. (Skeleton rows
    // alone are shorter than real two-line rows; the table shrank and the pager jumped up.)
    const heldHeight = useHeldHeight(bodyRef, !!loading && !fillHeight);

    // Sticky header while the table fits its width (see useTableFitsWidth for why not when wider).
    const fitsWidth = useTableFitsWidth(bodyRef);
    const stickyHeader = !fillHeight && (maxBodyHeight !== undefined || fitsWidth);

    const alignClass = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
    const hideClass = (c: Column<T>) => (c.hideBelow ? HIDE_BELOW[c.hideBelow] : undefined);
    // Offset of each pinned column from its edge: the px widths of the pinned columns before it (left) or after it (right)
    const stickyOffset = (c: Column<T>) => {
        if (!c.sticky) return undefined;
        const side = columns.filter((o) => o.sticky === c.sticky);
        const before = c.sticky === 'left' ? side.slice(0, side.indexOf(c)) : side.slice(side.indexOf(c) + 1);
        return before.reduce((sum, o) => sum + (parseFloat(o.width ?? '') || 0), 0);
    };
    const stickyStyle = (c: Column<T>): React.CSSProperties | undefined =>
        c.sticky ? { position: 'sticky', [c.sticky]: stickyOffset(c) } : undefined;
    // Pinned cells need their own solid background so scrolled cells do not show through
    const stickyClass = (c: Column<T>, head: boolean) => (c.sticky ? cn('bg-card z-[1]', head && 'dark:bg-muted') : undefined);

    // Fixed widths plus room for each flexible column among the columns a screen shows, so a narrow screen scrolls instead of squeezing it to 0
    const floorOf = (visible: Column<T>[]) => {
        const flexible = visible.filter((c) => !c.width);
        return !fillHeight && columns.some((c) => c.width) && flexible.length > 0
            ? `calc(${[...visible.filter((c) => c.width).map((c) => c.width), ...flexible.map((c) => c.minWidth ?? FLEX_COLUMN_MIN)].join(' + ')})`
            : undefined;
    };
    // One floor per breakpoint: columns hidden below lg / xl come back there and need their width counted too
    const flexFloor = floorOf(columns.filter((c) => !c.hideBelow));
    const flexFloorLg = floorOf(columns.filter((c) => c.hideBelow !== 'xl' && c.hideBelow !== '2xl'));
    const flexFloorXl = floorOf(columns.filter((c) => c.hideBelow !== '2xl'));
    const flexFloor2xl = floorOf(columns);

    // Keys pressed on a control inside the row (a menu, a switch) stay with that control.
    const onRowKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>, row: T) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onRowClick?.(row);
    };

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
                                    aria-label={t('search_placeholder')}
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
                    // relative: absolute children (sr-only headers) stay inside the scroll box instead of widening <main>
                    'border-border relative rounded-xl border',
                    // Too wide: scroll sideways; fits: clip (not a scroll box) so the header can stick to the page
                    fillHeight ? 'min-h-0 flex-1 overflow-hidden' : maxBodyHeight ? 'overflow-auto' : fitsWidth ? 'overflow-clip' : 'overflow-x-auto',
                )}
                style={{
                    ...(maxBodyHeight && !fillHeight ? { maxHeight: maxBodyHeight } : {}),
                    ...(heldHeight ? { minHeight: heldHeight } : {}),
                }}
            >
                {/* fillHeight: h-full stretches the rows to fill the body with no gap under the last one */}
                <table
                    className={cn(
                        'w-full text-sm',
                        fillHeight && 'h-full',
                        columns.some((c) => c.width) && 'table-fixed',
                        // A caller's own min-w-* (at any breakpoint) wins over the floor
                        flexFloor && 'min-w-(--flex-floor) lg:min-w-(--flex-floor-lg) xl:min-w-(--flex-floor-xl) 2xl:min-w-(--flex-floor-2xl)',
                        tableClassName,
                    )}
                    style={
                        flexFloor
                            ? ({
                                  '--flex-floor': flexFloor,
                                  '--flex-floor-lg': flexFloorLg ?? flexFloor,
                                  '--flex-floor-xl': flexFloorXl ?? flexFloor,
                                  '--flex-floor-2xl': flexFloor2xl ?? flexFloor,
                              } as React.CSSProperties)
                            : undefined
                    }
                >
                    {caption && <caption className="sr-only">{caption}</caption>}
                    {columns.some((c) => c.width) && (
                        <colgroup>
                            {columns.map((c) => (
                                <col
                                    key={c.key}
                                    className={c.hideBelow ? HIDE_BELOW_COL[c.hideBelow] : undefined}
                                    style={c.width ? { width: c.width } : undefined}
                                />
                            ))}
                        </colgroup>
                    )}
                    <thead
                        className={cn(
                            stickyHeader && 'bg-card sticky z-10 shadow-[0_1px_0_var(--color-border)]',
                            // Its own scroll box (maxBodyHeight) has no padding to offset; on the page, stick flush with the top.
                            stickyHeader && (maxBodyHeight ? 'top-0' : 'top-[var(--sticky-top,0px)]'),
                        )}
                    >
                        <tr className={cn('border-border border-b', TABLE_HEAD)}>
                            {columns.map((c) => (
                                <th
                                    key={c.key}
                                    title={typeof c.header === 'string' ? c.header : undefined}
                                    style={stickyStyle(c)}
                                    className={cn(
                                        stickyClass(c, true),
                                        // A header is one label; broken across lines it reads as
                                        // several and makes the header row taller than every data row.
                                        'text-muted-foreground overflow-hidden px-[var(--row-px)] py-[var(--row-py)] text-[11.5px] font-semibold tracking-wide text-ellipsis whitespace-nowrap uppercase',
                                        alignClass(c.align),
                                        hideClass(c),
                                    )}
                                >
                                    {c.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading &&
                            // As many skeleton rows as the page on screen (loadingRows, else 6, on a first load).
                            Array.from({ length: pageRows.length || loadingRows || 6 }).map((_, r) => (
                                <tr key={`skeleton-${r}`} className="border-border/60 border-b last:border-0">
                                    {columns.map((c, ci) => (
                                        <td key={c.key} className={cn('px-[var(--row-px)] py-[var(--row-py)]', alignClass(c.align), hideClass(c))}>
                                            {loadingAvatar && ci === 0 ? (
                                                <div className="flex items-center gap-2.5">
                                                    <div className="bg-muted h-8 w-8 shrink-0 animate-pulse rounded-full" />
                                                    <div className="bg-muted h-4 w-3/4 max-w-[160px] animate-pulse rounded" />
                                                </div>
                                            ) : (
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
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        {!loading && pageRows.length === 0 && (
                            <tr>
                                <td colSpan={columns.length} className="text-muted-foreground px-4 py-10 text-center">
                                    {emptyState ?? t('cmn_no_data')}
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            pageRows.map((row) => (
                                <tr
                                    key={rowKey(row)}
                                    onClick={() => onRowClick?.(row)}
                                    // Clickable rows are reachable by Tab and open on Enter / Space.
                                    tabIndex={onRowClick ? 0 : undefined}
                                    onKeyDown={onRowClick ? (e) => onRowKeyDown(e, row) : undefined}
                                    className={cn(
                                        // border-b-0 on the last row, NOT border-0: the latter zeroes every
                                        // side, which silently ate the left accent a rowClassName had set.
                                        'border-border/60 border-b last:border-b-0',
                                        onRowClick &&
                                            'hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-ring cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2',
                                        rowClassName?.(row),
                                    )}
                                >
                                    {columns.map((c) => (
                                        <td
                                            key={c.key}
                                            style={stickyStyle(c)}
                                            className={cn(
                                                'px-[var(--row-px)] py-[var(--row-py)]',
                                                alignClass(c.align),
                                                c.className,
                                                hideClass(c),
                                                stickyClass(c, false),
                                            )}
                                        >
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
                                <span>{t('cmn_rows_per_page')}</span>
                                <Select
                                    value={String(pageSize)}
                                    onValueChange={(v) => {
                                        setPageSize(Number(v));
                                        if (!server) setPage(1);
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
                            {total === 0 ? 0 : start + 1}–{Math.min(start + pageSize, total)} {t('cmn_of')} {total}
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(Math.max(1, safePage - 1))}
                                disabled={safePage <= 1}
                                aria-label={t('page_prev')}
                                className="border-border hover:bg-accent focus-visible:ring-ring flex h-8 w-8 items-center justify-center rounded-md border focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
                            >
                                <ChevronLeft aria-hidden className="h-4 w-4" />
                            </button>
                            <span className="text-foreground px-1 font-medium">
                                {safePage} / {pageCount}
                            </span>
                            <button
                                onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                                disabled={safePage >= pageCount}
                                aria-label={t('page_next')}
                                className="border-border hover:bg-accent focus-visible:ring-ring flex h-8 w-8 items-center justify-center rounded-md border focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
                            >
                                <ChevronRight aria-hidden className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
