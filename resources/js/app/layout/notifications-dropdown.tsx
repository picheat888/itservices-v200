import { useDismissNotification, useMarkAllRead, useMarkRead, useNotifications } from '@/modules/notifications';
import { useT } from '@/lib/i18n';
import { cn } from '@/shared/lib/utils';
import type { AppNotification } from '@/modules/notifications';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { iconMeta, moduleOf, notificationMessage, notificationTarget, notificationTitle } from './notification-display';

/** Per-module tabs. `live` modules render their notifications; others show a coming-soon note. */
const NOTIF_TABS: { id: string; label: string; live: boolean }[] = [
    { id: 'all', label: 'notif_all', live: true },
    { id: 'employees', label: 'employees', live: true },
    { id: 'tickets', label: 'tickets', live: false },
    { id: 'requests', label: 'requests', live: false },
    { id: 'assets', label: 'assets', live: false },
    { id: 'contracts', label: 'contracts', live: true },
    { id: 'stock', label: 'stock', live: true },
];

export function NotificationsDropdown({ onClose }: { onClose: () => void }) {
    const t = useT();
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

    const activeTab = NOTIF_TABS.find((x) => x.id === tab) ?? NOTIF_TABS[0];
    const visibleItems = tab === 'all' ? items : items.filter((n) => moduleOf(n.data.type) === tab);

    const tabCount = (id: string) => (id === 'all' ? items.length : items.filter((n) => moduleOf(n.data.type) === id).length);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-notif-btn]')) {
                onClose();
            }
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
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
        navigate(notificationTarget(n));
        onClose();
    };

    return (
        <div
            ref={ref}
            className="border-border bg-popover absolute top-14 right-4 z-50 w-[440px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-lg"
        >
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
                {NOTIF_TABS.map((tb) => {
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
                {!activeTab.live ? (
                    <div className="px-4 py-12 text-center">
                        <div className="text-muted-foreground text-sm font-medium">{t('coming_soon')}</div>
                        <div className="text-muted-foreground mx-auto mt-1 max-w-[240px] text-xs">{t('notif_module_soon')}</div>
                    </div>
                ) : visibleItems.length === 0 ? (
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
                                    className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', n.read ? 'bg-muted' : bg)}
                                >
                                    <Icon className={cn('h-[18px] w-[18px]', n.read ? 'text-muted-foreground' : color)} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className={cn('text-sm leading-snug', !n.read && 'font-semibold')}>{notificationTitle(n)}</div>
                                    <div className="text-muted-foreground mt-0.5 text-xs">{notificationMessage(n, t)}</div>
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
        </div>
    );
}
