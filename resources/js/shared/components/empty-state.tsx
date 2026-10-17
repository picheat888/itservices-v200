// The one empty state of the app: an icon for why it is empty, a title and a hint, centred in its card.
import type { ReactNode } from 'react';
import { CircleCheck, Inbox, Lock, MousePointerClick, SearchX, type LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type EmptyKind = 'empty' | 'search' | 'denied' | 'pick' | 'clear';

const ICONS: Record<EmptyKind, LucideIcon> = { empty: Inbox, search: SearchX, denied: Lock, pick: MousePointerClick, clear: CircleCheck };

export interface EmptyStateProps {
    kind?: EmptyKind;
    title: string;
    hint?: string | null;
    /** Buttons under the hint (clear filters, widen the range). */
    children?: ReactNode;
    className?: string;
}

export function EmptyState({ kind = 'empty', title, hint, children, className }: EmptyStateProps) {
    const Icon = ICONS[kind];
    return (
        <div className={cn('flex min-h-[160px] flex-1 flex-col items-center justify-center gap-1 px-5 py-8 text-center', className)}>
            <Icon className="text-muted-foreground/60 mb-2 h-8 w-8" aria-hidden />
            <p className="text-foreground text-sm font-medium text-balance">{title}</p>
            {hint && <p className="text-muted-foreground max-w-sm text-xs text-balance">{hint}</p>}
            {children && <div className="mt-3 flex flex-wrap justify-center gap-2">{children}</div>}
        </div>
    );
}
