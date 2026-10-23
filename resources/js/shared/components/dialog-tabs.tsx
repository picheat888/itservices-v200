import { TabCount } from '@/shared/components/tab-count';
import { TabBarStatus, TabRefreshMark } from '@/shared/components/tab-refresh-mark';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import type { RefreshMark } from '@/shared/lib/refresh-mark';
import { revealTab, sideEdges, tabPage, type SideEdges } from '@/shared/lib/tab-scroll';
import { cn } from '@/shared/lib/utils';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

export interface DialogTab<T extends string> {
    id: T;
    label: string;
    /** Optional count pill after the label — hidden when null/0. */
    count?: number | null;
    /** Green dot in the count pill: something on this tab waits for the reader. */
    dot?: boolean;
    /** Optional leading icon; opt in only for a bar whose tabs hold different kinds of thing. */
    icon?: LucideIcon;
    /** Refresh mark of the tab's data (useTabFreshness); a slot beside the label opens only while it refreshes. */
    refresh?: RefreshMark;
}

/** The DOM id DialogTabs gives a tab, for a panel's `aria-labelledby`. */
export const dialogTabId = (panelId: string, id: string) => `${panelId}-tab-${id}`;

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

// Scrolls the bar itself only, never the dialog
function revealActiveTab(list: HTMLElement, smooth: boolean) {
    const tab = list.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!tab) return;
    const box = list.getBoundingClientRect();
    const rect = tab.getBoundingClientRect();
    const now = sideEdges(list.scrollLeft, list.clientWidth, list.scrollWidth);
    const delta = revealTab({ left: rect.left, right: rect.right }, { left: box.left, right: box.right }, now);
    if (delta !== 0) list.scrollBy({ left: delta, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
}

/** Which ends of a sideways tab bar hide tabs; keeps the active tab in view when it changes or the bar narrows. */
function useTabBarEdges(listRef: RefObject<HTMLDivElement | null>, activeKey: string) {
    const [edges, setEdges] = useState<SideEdges>({ before: false, after: false });
    const moved = useRef(false);

    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        let width = list.clientWidth;
        const measure = () => {
            const next = sideEdges(list.scrollLeft, list.clientWidth, list.scrollWidth);
            setEdges((prev) => (prev.before === next.before && prev.after === next.after ? prev : next));
        };
        // A rotated iPad or a narrower dialog can push the active tab out of view
        const resized = () => {
            if (list.clientWidth !== width) {
                width = list.clientWidth;
                revealActiveTab(list, false);
            }
            measure();
        };
        measure();
        list.addEventListener('scroll', measure, { passive: true });
        // Counts arriving later widen the tabs
        const observer = new ResizeObserver(resized);
        observer.observe(list);
        for (const tab of Array.from(list.children)) observer.observe(tab);
        return () => {
            list.removeEventListener('scroll', measure);
            observer.disconnect();
        };
    }, [listRef]);

    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        revealActiveTab(list, moved.current);
        moved.current = true;
    }, [listRef, activeKey]);

    const page = (direction: 1 | -1) => {
        const list = listRef.current;
        if (list) list.scrollBy({ left: direction * tabPage(list.clientWidth), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    };

    return { edges, page };
}

/** Underline tab bar of the focus dialogs; a real tablist (arrows, Home, End) that scrolls sideways with end fades and ‹ › page buttons when it does not fit. */
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
    const fmtN = useNumberFormat();
    const hasMarks = tabs.some((tb) => tb.refresh !== undefined);
    const fallbackId = useId();
    const base = panelId ?? fallbackId;
    const listRef = useRef<HTMLDivElement>(null);
    const { edges, page } = useTabBarEdges(listRef, `${active}|${tabs.length}`);

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
        <>
            {hasMarks && <TabBarStatus marks={tabs.map((tb) => tb.refresh)} />}
            <div className="relative shrink-0">
                <div
                    ref={listRef}
                    role="tablist"
                    aria-label={label}
                    className={cn(
                        'border-border/60 flex shrink-0 gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                        className,
                    )}
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
                                    'press focus-visible:ring-ring relative inline-flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-3 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset lg:px-4',
                                    selected ? 'text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                )}
                            >
                                {/* Icons show from lg up */}
                                {tb.icon && <tb.icon className="hidden h-4 w-4 shrink-0 lg:block" aria-hidden="true" />}
                                {tb.label}
                                <TabCount
                                    count={tb.count}
                                    visible={(tb.count != null && tb.count > 0) || !!tb.dot}
                                    className={cn(
                                        'bg-accent inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px]',
                                        selected ? 'text-brand-ink' : 'text-foreground/65 dark:text-muted-foreground',
                                    )}
                                >
                                    {tb.count != null && tb.count > 0 && fmtN(tb.count)}
                                    {tb.dot && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                                </TabCount>
                                {/* Underline inside the scrolling bar */}
                                {selected && <span className="bg-brand absolute inset-x-2 bottom-0 h-0.5 rounded-full" />}
                                {tb.refresh !== undefined && <TabRefreshMark mark={tb.refresh} />}
                            </button>
                        );
                    })}
                </div>
                <TabBarEdge side="before" shown={edges.before} onPage={() => page(-1)} />
                <TabBarEdge side="after" shown={edges.after} onPage={() => page(1)} />
            </div>
        </>
    );
}

/** End fade with a ‹ or › page button, shown while that end hides tabs; the keyboard already scrolls the bar, so the button takes no focus. */
function TabBarEdge({ side, shown, onPage }: { side: 'before' | 'after'; shown: boolean; onPage: () => void }) {
    const Icon = side === 'before' ? ChevronLeft : ChevronRight;
    return (
        <>
            <span
                aria-hidden="true"
                className={cn(
                    'from-background to-background/0 pointer-events-none absolute top-0 bottom-px w-14 from-45% transition-opacity duration-150 motion-reduce:transition-none',
                    side === 'before' ? 'left-0 bg-linear-to-r' : 'right-0 bg-linear-to-l',
                    shown ? 'opacity-100' : 'opacity-0',
                )}
            />
            <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={onPage}
                className={cn(
                    'text-muted-foreground hover:bg-accent hover:text-foreground absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md transition-opacity duration-150 motion-reduce:transition-none',
                    side === 'before' ? 'left-1' : 'right-1',
                    shown ? 'opacity-100' : 'pointer-events-none opacity-0',
                )}
            >
                <Icon className="h-4 w-4" />
            </button>
        </>
    );
}
