import { cn } from '@/shared/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface DialogTab<T extends string> {
    id: T;
    label: string;
    /** Optional count pill after the label — hidden when null/0. */
    count?: number | null;
    /**
     * Optional leading icon. A bar whose tabs hold different kinds of thing reads faster with
     * one; a bar whose tabs are all the same kind (three sets of fields, say) reads slower,
     * because an icon that cannot distinguish anything is decoration. Opt in per bar.
     */
    icon?: LucideIcon;
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
                        'relative inline-flex items-center gap-1.5 rounded-t-lg px-4 py-3 text-sm font-semibold transition-colors',
                        active === tb.id ? 'text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                >
                    {tb.icon && <tb.icon className="h-4 w-4 shrink-0" />}
                    {tb.label}
                    {tb.count != null && tb.count > 0 && (
                        <span className="bg-accent rounded-full px-1.5 py-0.5 font-mono text-[11px]">{tb.count}</span>
                    )}
                    {active === tb.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
                </button>
            ))}
        </div>
    );
}
