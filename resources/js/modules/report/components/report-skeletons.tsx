/**
 * Loading shapes for the report module's pages, each mirroring the piece it stands in for so
 * a page pulses in place and its content lands where the bars were — the pattern of the hub
 * (ReportCatalogueSkeleton, RailHeadingSkeleton) and the other modules' dashboards.
 * Used by pages/tickets-overview.tsx and components/tabular-report-view.tsx.
 */
import { TableSkeleton } from '@/shared/components/skeletons';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { CARD_HEADING_TINT } from './card-heading';

/** One KpiTile: label, number, footer line. */
export function KpiTileSkeleton() {
    return (
        <Card className="flex min-w-0 flex-col gap-2.5 p-4" aria-hidden="true">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-7 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
        </Card>
    );
}

/** A row of KPI tiles in the grid the real ones use. */
export function KpiRowSkeleton({ count, className }: { count: number; className: string }) {
    return (
        <div className={cn('grid grid-cols-2 gap-3', className)}>
            {Array.from({ length: count }, (_, i) => (
                <KpiTileSkeleton key={i} />
            ))}
        </div>
    );
}

/** A filter row (filter-row.tsx): `fields` "name [field]" pairs on one line. */
export function FilterBarSkeleton({ fields }: { fields: number }) {
    return (
        <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3" aria-hidden="true">
            {Array.from({ length: fields }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-14" />
                    <Skeleton className="h-10 w-48" />
                </div>
            ))}
        </Card>
    );
}

/** A card heading row (the module's tint) with a title bar and, optionally, a note bar. */
export function CardHeadingSkeleton({ note = true, className }: { note?: boolean; className?: string }) {
    return (
        <div className={cn(CARD_HEADING_TINT, 'border-border flex items-center justify-between gap-3 border-b px-5 py-3', className)}>
            <Skeleton className="h-4 w-36" />
            {note && <Skeleton className="h-3 w-20" />}
        </div>
    );
}

/** Label | track | value rows, as HorizontalBars draws them. */
export function BarRowsSkeleton({ rows }: { rows: number }) {
    return (
        <div className="space-y-3 px-5 py-4">
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="grid grid-cols-[92px_minmax(0,1fr)_52px] items-center gap-2.5">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-2.5 rounded-full" />
                    <Skeleton className="ml-auto h-3.5 w-9" />
                </div>
            ))}
        </div>
    );
}

/** Bars of staggered height, so a chart's placeholder reads as a chart rather than a block. */
const CHART_BARS = [
    'h-[40%]',
    'h-[65%]',
    'h-[30%]',
    'h-[80%]',
    'h-[55%]',
    'h-[45%]',
    'h-[70%]',
    'h-[35%]',
    'h-[60%]',
    'h-[50%]',
    'h-[75%]',
    'h-[90%]',
];

export function ChartSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('flex h-56 items-end gap-2.5 px-5 pt-4 pb-5', className)}>
            {CHART_BARS.map((h, i) => (
                <Skeleton key={i} className={cn('flex-1 rounded-t-md rounded-b-none', h)} />
            ))}
        </div>
    );
}

/** Name | number rows of a small breakdown table. */
export function TableRowsSkeleton({ rows }: { rows: number }) {
    return (
        <div className="divide-border/60 divide-y">
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-3.5 w-10" />
                </div>
            ))}
        </div>
    );
}

/** A full data table (the app's shared shimmer table). */
export function DataTableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
    return <TableSkeleton rows={rows} cols={cols} />;
}

/** BacklogAging's four tiles, each with its age label under it. */
export function AgingSkeleton() {
    return (
        <div className="grid grid-cols-2 gap-2 px-5 pt-3.5 pb-4 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex min-w-0 flex-col items-center gap-1.5">
                    <Skeleton className="h-11 w-full rounded-lg" />
                    <Skeleton className="h-3 w-14" />
                </div>
            ))}
        </div>
    );
}
