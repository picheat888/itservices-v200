import { cn } from '@/shared/lib/utils';

/** Small uppercase section heading with a short brand-accent underline, used across
 *  the app's focus dialogs (contract / asset detail, access manage).
 *  `className` is for the wrapper only — pass spacing when the heading shares a row
 *  with an action button. */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('mb-2', className)}>
            <div className="dark:text-foreground flex items-center gap-2 text-sm font-bold tracking-wide text-[#2f2f2f] uppercase">{children}</div>
            <div className="bg-brand/70 mt-1.5 h-0.5 w-8 rounded-full" />
        </div>
    );
}
