// Report cards area: while a filter change refetches over the last numbers, a thin brand bar slides along its top edge.
import { cn } from '@/shared/lib/utils';

export function CardsUpdating({ updating, className, children }: { updating: boolean; className?: string; children: React.ReactNode }) {
    return (
        <div aria-busy={updating || undefined} className={cn('relative', className)}>
            {/* Top progress bar */}
            {updating && (
                <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-2.5 h-0.5 overflow-hidden rounded-full">
                    <span className="bg-brand animate-out slide-out-to-right-[400%] repeat-infinite relative -left-1/3 block h-full w-1/3 rounded-full duration-1000 ease-in-out motion-reduce:left-0 motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60" />
                </span>
            )}
            {children}
        </div>
    );
}
