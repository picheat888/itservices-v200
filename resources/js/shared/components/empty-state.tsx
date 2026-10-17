// The one empty state of the app: an icon for why it is empty, a title and a hint, centred in its card.
import { cn } from '@/shared/lib/utils';
import { CircleCheck, Inbox, Lock, MousePointerClick, SearchX, type LucideIcon } from 'lucide-react';
import { Children, type ReactNode } from 'react';

export type EmptyKind = 'empty' | 'search' | 'denied' | 'pick' | 'clear';

const ICONS: Record<EmptyKind, LucideIcon> = { empty: Inbox, search: SearchX, denied: Lock, pick: MousePointerClick, clear: CircleCheck };

export interface EmptyStateProps {
    kind?: EmptyKind;
    title: string;
    hint?: string | null;
    /** Buttons under the hint (clear filters, widen the range). */
    children?: ReactNode;
    className?: string;
    /** The title's element; a page that is only this state (no access) makes it its heading. */
    titleAs?: 'h1' | 'h2' | 'p';
}

export function EmptyState({ kind = 'empty', title, hint, children, className, titleAs: Title = 'p' }: EmptyStateProps) {
    const Icon = ICONS[kind];
    return (
        <div className={cn('flex min-h-[160px] flex-1 flex-col items-center justify-center gap-1 px-5 py-8 text-center', className)}>
            <Icon className="text-muted-foreground/60 mb-2 h-8 w-8" aria-hidden />
            <Title className="text-foreground text-sm font-medium text-balance">{title}</Title>
            {hint && <p className="text-muted-foreground max-w-sm text-xs text-balance">{hint}</p>}
            {Children.toArray(children).length > 0 && <div className="mt-3 flex flex-wrap justify-center gap-2">{children}</div>}
        </div>
    );
}
