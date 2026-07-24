import { cn } from '@/shared/lib/utils';

export interface DialogTab<T extends string> {
    id: T;
    label: string;
    /** Optional count pill after the label — hidden when null/0. */
    count?: number | null;
}

/**
 * Underline-style tab bar shared by the app's focus dialogs (Asset / Contract /
 * Stock / Ticket view). Inactive tabs get a soft rounded-top accent fill on
 * hover; the active tab is brand-colored with a short underline.
 */
export function DialogTabs<T extends string>({
    tabs,
    active,
    onChange,
    className,
}: {
    tabs: DialogTab<T>[];
    active: T;
    onChange: (id: T) => void;
    /** Extra classes for the bar itself (e.g. `px-6` for full-width dialog bars, `mb-4` inside a column). */
    className?: string;
}) {
    return (
        <div className={cn('border-border/60 flex gap-1 border-b', className)}>
            {tabs.map((tb) => (
                <button
                    key={tb.id}
                    type="button"
                    onClick={() => onChange(tb.id)}
                    className={cn(
                        'relative rounded-t-lg px-4 py-3 text-sm font-semibold transition-colors',
                        active === tb.id ? 'text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                >
                    {tb.label}
                    {tb.count != null && tb.count > 0 && (
                        <span className="bg-accent ml-1.5 rounded-full px-1.5 py-0.5 font-mono text-[11px]">{tb.count}</span>
                    )}
                    {active === tb.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
                </button>
            ))}
        </div>
    );
}
