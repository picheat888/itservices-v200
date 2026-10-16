// Table pieces shared by the My Profile tabs: card, header row, section heading, show-all row, loading rows.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
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

export function LoadingRows() {
    return (
        <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-muted h-12 animate-pulse rounded-xl" />
            ))}
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
