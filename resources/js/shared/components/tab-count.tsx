// A tab's count pill that pops when its count rises (badge-pop), stays still on first load and when it drops.
import { useCountRises } from '@/shared/hooks/use-count-rises';
import { cn } from '@/shared/lib/utils';
import type { ReactNode } from 'react';

/** Always rendered so the rise is tracked while the pill is hidden (a count going 0 → 3 still pops). */
export function TabCount({
    count,
    visible,
    className,
    title,
    children,
}: {
    count: number | null | undefined;
    visible: boolean;
    className?: string;
    title?: string;
    children: ReactNode;
}) {
    const rises = useCountRises(count ?? null);
    if (!visible) return null;
    return (
        <span key={rises} title={title} className={cn(className, rises > 0 && 'badge-pop')}>
            {children}
        </span>
    );
}
