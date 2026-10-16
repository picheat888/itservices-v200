import { cn } from '@/shared/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { useId, useRef, type KeyboardEvent } from 'react';

export interface DialogTab<T extends string> {
    id: T;
    label: string;
    /** Optional count pill after the label — hidden when null/0. */
    count?: number | null;
    /** Green dot in the count pill: something on this tab waits for the reader. */
    dot?: boolean;
    /**
     * Optional leading icon. A bar whose tabs hold different kinds of thing reads faster with
     * one; a bar whose tabs are all the same kind (three sets of fields, say) reads slower,
     * because an icon that cannot distinguish anything is decoration. Opt in per bar.
     */
    icon?: LucideIcon;
}

/** The DOM id DialogTabs gives a tab, for a panel's `aria-labelledby`. */
export const dialogTabId = (panelId: string, id: string) => `${panelId}-tab-${id}`;

/**
 * Underline tab bar shared by the focus dialogs (Asset / Contract / Stock / Ticket / Employee view).
 * A real tablist (arrow keys, Home, End) that scrolls sideways when a tablet runs out of width.
 */
export function DialogTabs<T extends string>({
    tabs,
    active,
    onChange,
    className,
    label,
    panelId,
}: {
    tabs: DialogTab<T>[];
    active: T;
    onChange: (id: T) => void;
    /** Extra classes for the bar itself (e.g. `px-6` for full-width dialog bars, `mb-4` inside a column). */
    className?: string;
    /** Screen-reader name of the tab list. */
    label?: string;
    /** Id of the element holding the active tab's content; tabs point at it (aria-controls). */
    panelId?: string;
}) {
    const fallbackId = useId();
    const base = panelId ?? fallbackId;
    const listRef = useRef<HTMLDivElement>(null);

    // Arrow / Home / End move between tabs (WAI-ARIA tabs pattern)
    const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
        const ids = tabs.map((tb) => tb.id);
        const i = ids.indexOf(active);
        const byKey: Record<string, T | undefined> = {
            ArrowRight: ids[(i + 1) % ids.length],
            ArrowLeft: ids[(i - 1 + ids.length) % ids.length],
            Home: ids[0],
            End: ids[ids.length - 1],
        };
        const next = byKey[e.key];
        if (next === undefined) return;
        e.preventDefault();
        onChange(next);
        listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(dialogTabId(base, next))}`)?.focus();
    };

    return (
        <div
            ref={listRef}
            role="tablist"
            aria-label={label}
            className={cn('border-border/60 flex shrink-0 gap-1 overflow-x-auto border-b [scrollbar-width:thin]', className)}
        >
            {tabs.map((tb) => {
                const selected = active === tb.id;
                return (
                    <button
                        key={tb.id}
                        id={dialogTabId(base, tb.id)}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-controls={panelId}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onChange(tb.id)}
                        onKeyDown={onKeyDown}
                        className={cn(
                            'focus-visible:ring-ring relative inline-flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-3 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset lg:px-4',
                            selected ? 'text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                    >
                        {/* Icons show from lg up */}
                        {tb.icon && <tb.icon className="hidden h-4 w-4 shrink-0 lg:block" aria-hidden="true" />}
                        {tb.label}
                        {((tb.count != null && tb.count > 0) || tb.dot) && (
                            <span
                                className={cn(
                                    'bg-accent inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[11px]',
                                    selected ? 'text-brand-ink' : 'text-foreground/65 dark:text-muted-foreground',
                                )}
                            >
                                {tb.count != null && tb.count > 0 && tb.count}
                                {tb.dot && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                            </span>
                        )}
                        {/* Underline inside the scrolling bar */}
                        {selected && <span className="bg-brand absolute inset-x-2 bottom-0 h-0.5 rounded-full" />}
                    </button>
                );
            })}
        </div>
    );
}
