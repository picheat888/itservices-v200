// Overview stat card: label, brand icon tile, the figure and a small line under it.
// Clickable when given onClick (opens the list it counts); pulses while loading.
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import type { LucideIcon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';

export function StatCard({
    icon: Icon,
    label,
    value,
    sub,
    onClick,
    loading,
}: {
    icon: LucideIcon;
    label: string;
    value: string;
    sub?: ReactNode;
    onClick?: () => void;
    loading?: boolean;
}) {
    const onKeyDown = (e: KeyboardEvent) => {
        if (!onClick || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onClick();
    };

    return (
        <Card
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onKeyDown}
            aria-busy={loading || undefined}
            className={cn('p-5 transition-colors', onClick && 'hover:border-brand/40 cursor-pointer')}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="text-muted-foreground min-w-0 text-sm">{label}</div>
                <span className="bg-brand/10 text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            {loading ? (
                <>
                    <Skeleton className="mt-3 h-7 w-16" />
                    {sub !== undefined && <Skeleton className="mt-2.5 h-3 w-24" />}
                </>
            ) : (
                <>
                    <div className="mt-2 text-3xl font-bold">{value}</div>
                    {sub !== undefined && <div className="text-muted-foreground mt-1 truncate text-xs">{sub}</div>}
                </>
            )}
        </Card>
    );
}
