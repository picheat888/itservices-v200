import type { AppNotification } from '@/modules/notification';
import {
    NOTIFICATION_GROUPS,
    useDismissNotification,
    useMarkAllRead,
    useMarkRead,
    useNotifications,
    useNotificationText,
} from '@/modules/notification';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { iconMeta, moduleOf, notificationMessage, notificationTarget, notificationTitle } from './notification-display';

/**
 * Per-module tabs: "All", then the catalogue's own groups. A tab only appears once that
 * module has something to show (see `shownTabs`), so there is nothing to gate: the Tickets
 * tab used to carry a `live: false` flag that answered "coming soon" while its five
 * notification types were shipping, being delivered, and showing up in the All tab beside it.
 */
const NOTIF_TABS: { id: string; label: string }[] = [{ id: 'all', label: 'notif_all' }, ...NOTIFICATION_GROUPS];

export function NotificationsDropdown({ onClose }: { onClose: () => void }) {
    // Prefers the wording an administrator set on the Bell tab; falls through to the
    // bundled string for every other key, so this still serves the surrounding UI text.
    const t = useNotificationText();
    const navigate = useNavigate();
    const ref = useRef<HTMLDivElement>(null);
    const tabsRef = useRef<HTMLDivElement>(null);
    const { data } = useNotifications();
    const markRead = useMarkRead();
    const markAllRead = useMarkAllRead();
    const dismiss = useDismissNotification();
    const [tab, setTab] = useState('all');
    // Ids mid-dismiss: play the slide-out/collapse animation, then actually remove.
    const [dismissing, setDismissing] = useState<Set<string>>(new Set());

    const handleDismiss = (id: string) => {
        setDismissing((prev) => new Set(prev).add(id));
        window.setTimeout(() => dismiss.mutate(id), 220);
    };

    const items = data?.data ?? [];
    const unread = data?.unread ?? 0;
    const total = data?.total ?? items.length;

    const visibleItems = tab === 'all' ? items : items.filter((n) => moduleOf(n.data.type, n.data.module) === tab);

    /**
     * Real totals per module, folded from the server's per-type tallies.
     *
     * The chips used to count the rows they had been handed, and the list is capped at 30 —
     * so "All 30" meant "the window is full", and dismissing one left it saying 30 again.
     * The server counts; moduleOf classifies, which keeps that mapping in one place.
     */
    const countsByModule = useMemo(() => {
        const tally: Record<string, number> = {};
        (data?.counts ?? []).forEach((c) => {
            const mod = moduleOf(c.type ?? '', c.module ?? undefined);
            tally[mod] = (tally[mod] ?? 0) + c.count;
        });

        return tally;
    }, [data?.counts]);

    const tabCount = (id: string) => (id === 'all' ? total : (countsByModule[id] ?? 0));
    // Show "All" plus only the module tabs this user actually has notifications in —
    // each role sees just its relevant categories instead of every possible type.
    const shownTabs = NOTIF_TABS.filter((tb) => tb.id === 'all' || tabCount(tb.id) > 0);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-notif-btn]')) {
                onClose();
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('mousedown', handler);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', handler);
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    // Let the mouse wheel scroll the single-row tab strip left/right (non-passive so
    // we can stop the page from scrolling vertically while hovering the tabs).
    useEffect(() => {
        const el = tabsRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
            if (delta === 0) return;
            e.preventDefault();
            // scrollBy honours the element's `scroll-smooth`, so wheel notches glide.
            el.scrollBy({ left: delta });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    const handleClick = (n: AppNotification) => {
        if (!n.read) markRead.mutate(n.id);
        // The password warning has no page to open — what it asks for is the dialog the
        // shell owns, so it raises that instead of navigating anywhere.
        if (n.data.type === 'password_expiring') {
            useUiStore.getState().setPasswordDialog(true);
        } else {
            navigate(notificationTarget(n));
        }
        onClose();
    };

    return (
        <div
            ref={ref}
            className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 absolute top-[4.5rem] right-4 z-50 w-[440px] max-w-[calc(100vw-2rem)] origin-top-right duration-150 ease-out motion-reduce:animate-none"
        >
            {/* Caret aimed back at the bell. The button is 36px wide and sits 16px from
                the window edge, so its centre lands 18px in from this panel's right edge.
                It lives outside the card so the card can keep clipping to its rounded corners. */}
            <div className="border-border bg-popover absolute -top-[5px] right-[13px] h-2.5 w-2.5 rotate-45 border-t border-l" />

            <div className="border-border bg-popover relative overflow-hidden rounded-xl border shadow-lg">
                <div className="border-border flex items-center justify-between border-b px-4 py-3">
                    <div>
                        <div className="text-sm font-semibold">{t('notif_title')}</div>
                        {unread > 0 && (
                            <div className="text-muted-foreground text-xs">
                                {unread} {t('notif_unread')}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => markAllRead.mutate()}
                            disabled={unread === 0 || markAllRead.isPending}
                            className="text-brand hover:bg-accent rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40"
                        >
                            {t('notif_mark_all')}
                        </button>
                        <button onClick={onClose} className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Per-module filter tabs — single row; scrolls horizontally (mouse wheel) with a
                thin, subtle scrollbar so it's clear there's more to see. */}
                <div
                    ref={tabsRef}
                    className="border-border [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 flex gap-1 overflow-x-auto scroll-smooth border-b px-2 pt-2 pb-1.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
                >
                    {shownTabs.map((tb) => {
                        const count = tabCount(tb.id);
                        const active = tab === tb.id;
                        return (
                            <button
                                key={tb.id}
                                onClick={(e) => {
                                    setTab(tb.id);
                                    // Bring a partially-hidden tab fully into view, smoothly.
                                    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
                                }}
                                className={cn(
                                    'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                                    active ? 'bg-brand text-white' : 'text-muted-foreground hover:bg-accent',
                                )}
                            >
                                {t(tb.label)}
                                {count > 0 && (
                                    <span
                                        className={cn(
                                            'rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold',
                                            active ? 'bg-white/20 text-white' : 'bg-brand/10 text-brand',
                                        )}
                                    >
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 max-h-[360px] overflow-y-auto scroll-smooth [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
                    {visibleItems.length === 0 ? (
                        <div className="text-muted-foreground py-12 text-center text-sm">{t('notif_empty')}</div>
                    ) : (
                        visibleItems.map((n) => {
                            const { Icon, color, bg } = iconMeta(n);
                            return (
                                <div
                                    key={n.id}
                                    onClick={() => handleClick(n)}
                                    className={cn(
                                        'group border-border/60 hover:bg-accent/50 flex cursor-pointer gap-3 overflow-hidden border-b px-4 py-3 transition-all duration-200 ease-out',
                                        !n.read && 'bg-brand/[0.04]',
                                        dismissing.has(n.id) ? 'max-h-0 translate-x-8 !border-b-0 !py-0 opacity-0' : 'max-h-32',
                                    )}
                                >
                                    <div
                                        className={cn(
                                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                                            n.read ? 'bg-muted' : bg,
                                        )}
                                    >
                                        <Icon className={cn('h-[18px] w-[18px]', n.read ? 'text-muted-foreground' : color)} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        {/* One line of title, two of body, then an ellipsis — the same
                                            shape a toast uses. Before this a long message (a leaver's
                                            outstanding access runs to four lines) pushed the rows below it
                                            out of the tray, so the newest alerts were the ones you had to
                                            scroll to find. */}
                                        <div className={cn('line-clamp-1 text-sm leading-snug', !n.read && 'font-semibold')}>
                                            {notificationTitle(n, t)}
                                        </div>
                                        <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-relaxed">
                                            {notificationMessage(n, t)}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                        <span className="text-muted-foreground text-[11px]">{n.created_at}</span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDismiss(n.id);
                                            }}
                                            aria-label={t('notif_dismiss')}
                                            title={t('notif_dismiss')}
                                            className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* The list is capped, so the chips can legitimately outnumber the rows below
                    them. Saying so is the difference between a figure that looks wrong and one
                    that explains itself — and dismissing from here refills the window, which
                    otherwise looks like the count refusing to move. */}
                {total > items.length && (
                    <div className="border-border text-muted-foreground border-t px-4 py-2 text-center text-[11px]">
                        {t('notif_showing').replace('{shown}', String(items.length)).replace('{total}', String(total))}
                    </div>
                )}
            </div>
        </div>
    );
}
