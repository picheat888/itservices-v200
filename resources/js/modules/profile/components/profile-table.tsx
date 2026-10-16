// Table pieces shared by the My Profile tabs: card, header row, section heading, show-all row, loading rows.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Rows shown before "show all"
export const PAGE = 5;

export function TableCard({ className, children }: { className?: string; children: React.ReactNode }) {
    return <div className={cn('bg-card border-border overflow-hidden rounded-xl border shadow-xs', className)}>{children}</div>;
}

export function HeadRow({ grid, children }: { grid: string; children: React.ReactNode }) {
    return (
        <div className={cn(grid, 'bg-muted border-border text-muted-foreground border-b py-2 text-[11px] font-bold tracking-wide uppercase')}>
            {children}
        </div>
    );
}

export function SectionHeading({ title, count, action }: { title: string; count: number; action?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-sm font-bold">{title}</span>
            <span className="text-muted-foreground text-xs">{count}</span>
            {action && <span className="ml-auto">{action}</span>}
        </div>
    );
}

// Loading state shaped like the tables above: a header strip, a column header, then rows with the same cells
export function LoadingRows({ rows = 3 }: { rows?: number }) {
    const t = useT();
    return (
        <div className="flex flex-col gap-3.5" aria-busy="true" role="status">
            <span className="sr-only">{t('loading')}</span>
            <TableCard>
                <div className="bg-muted/60 border-border flex items-center gap-2 border-b px-4 py-2.5">
                    <Skeleton className="h-4 w-4 rounded-md" />
                    <Skeleton className="h-3.5 w-28" />
                </div>
                <div className="bg-muted border-border flex items-center gap-3 border-b px-4 py-2.5">
                    <Skeleton className="h-2.5 w-14" />
                    <Skeleton className="ml-auto h-2.5 w-10" />
                    <Skeleton className="h-2.5 w-12" />
                    <Skeleton className="h-2.5 w-16" />
                </div>
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className={cn('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-border/60 border-t')}>
                        <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <Skeleton className="h-3 w-2/5 max-w-[180px]" />
                            <Skeleton className="h-2.5 w-1/4 max-w-[120px]" />
                        </div>
                        <Skeleton className="hidden h-3 w-16 lg:block" />
                        <Skeleton className="hidden h-3 w-20 lg:block" />
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-8 w-20 rounded-md" />
                    </div>
                ))}
            </TableCard>
        </div>
    );
}

export function ShowAllRow({ total, expanded, onToggle }: { total: number; expanded: boolean; onToggle: () => void }) {
    const t = useT();
    if (total <= PAGE) return null;
    const Icon = expanded ? ChevronUp : ChevronDown;
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground flex w-full items-center justify-center gap-1.5 border-t py-2 text-xs font-semibold transition-colors"
        >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {expanded ? t('profile_assets_show_less') : t('profile_assets_show_all').replace('{n}', String(total - PAGE))}
        </button>
    );
}
