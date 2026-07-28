import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';

/** Shimmer rows that mimic a data table. */
export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
    return (
        <div className="border-border overflow-hidden rounded-xl border">
            <div className="border-border bg-muted/40 border-b px-4 py-3">
                <Skeleton className="h-3 w-48" />
            </div>
            <div className="divide-border/60 divide-y">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                        {Array.from({ length: cols }).map((_, j) => (
                            <Skeleton key={j} className={cn('h-3 shrink-0 rounded', j === 0 ? 'w-32' : j === cols - 1 ? 'w-16' : 'w-24')} />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Shimmer cards in a responsive grid. */
export function CardGridSkeleton({ count = 6, cols = 3 }: { count?: number; cols?: number }) {
    return (
        <div
            className={cn(
                'grid grid-cols-1 gap-4',
                cols === 2 && 'sm:grid-cols-2',
                cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
                cols === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
            )}
        >
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="border-border space-y-3 rounded-xl border p-4">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <div className="border-border border-t pt-3">
                        <Skeleton className="h-3 w-1/3" />
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Shimmer rows for a side-list (like role template list). */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="divide-border/60 divide-y">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                    <Skeleton className="h-6 w-1.5 shrink-0 rounded" />
                    <Skeleton className="h-3.5 w-32" />
                </div>
            ))}
        </div>
    );
}
