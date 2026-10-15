import type { AppNotification } from '@/modules/notification';
import {
    NOTIFICATION_GROUPS,
    useDismissNotification,
    useMarkAllRead,
    useMarkRead,
    useNotificationFeed,
    useNotifications,
    useNotificationText,
} from '@/modules/notification';
import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';
import { Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { iconMeta, moduleOf, notificationMessage, notificationTarget, notificationTitle } from './notification-display';

// "All", then the catalogue's groups; a module tab shows once it has something in it.
const NOTIF_TABS: { id: string; label: string }[] = [{ id: 'all', label: 'notif_all' }, ...NOTIFICATION_GROUPS];

/** The kind the server counts and filters by: payload type, plus the imitated module on a test sample. */
const kindKey = (type: string | null, module: string | null) => `${type ?? ''}|${module ?? ''}`;

export function NotificationsDropdown({ onClose, onChangePassword }: { onClose: () => void; onChangePassword: () => void }) {
    // Prefers the wording an administrator set on the Bell tab, else the bundled string.
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

    const unread = data?.unread ?? 0;

    // Totals and unread per module, folded from the server's per-kind tallies by moduleOf().
    const { totalByModule, unreadByModule, kindsByModule } = useMemo(() => {
        const totals: Record<string, number> = {};
        const unreads: Record<string, number> = {};
        const kinds: Record<string, string[]> = {};
        (data?.counts ?? []).forEach((c) => {
            const mod = moduleOf(c.type ?? '', c.module ?? undefined);
            totals[mod] = (totals[mod] ?? 0) + c.count;
            unreads[mod] = (unreads[mod] ?? 0) + c.unread;
            (kinds[mod] ??= []).push(kindKey(c.type, c.module));
        });
        Object.values(kinds).forEach((list) => list.sort());

        return { totalByModule: totals, unreadByModule: unreads, kindsByModule: kinds };
    }, [data?.counts]);

    const shownTabs = NOTIF_TABS.filter((tb) => tb.id === 'all' || (totalByModule[tb.id] ?? 0) > 0);
    const unreadCount = (id: string) => (id === 'all' ? unread : (unreadByModule[id] ?? 0));

    // The open tab's list, fetched from the server for that tab and loaded a page at a time.
    const feed = useNotificationFeed(tab === 'all' ? null : (kindsByModule[tab] ?? []));
    const items = useMemo(() => {
        const seen = new Set<string>();
        // A refetch after a dismiss can shift a row onto the next page; show it once.
        return (feed.data?.pages ?? []).flatMap((page) => page.data).filter((n) => !seen.has(n.id) && seen.add(n.id));
    }, [feed.data]);

    // A tab that emptied out (its last row dismissed) falls back to All.
    useEffect(() => {
        if (tab !== 'all' && data && !(totalByModule[tab] > 0)) setTab('all');
    }, [tab, data, totalByModule]);

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

    // The mouse wheel scrolls the one-row tab strip sideways (non-passive, so the page stays put).
    useEffect(() => {
        const el = tabsRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
            if (delta === 0) return;
            e.preventDefault();
            el.scrollBy({ left: delta });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    const handleClick = (n: AppNotification) => {
        if (!n.read) markRead.mutate(n.id);
        // The password warning opens the shell's Change password dialog (?dialog=password), not a page.
        if (n.data.type === 'password_expiring') {
            onChangePassword();
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
            {/* Caret aimed back at the bell */}
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
                            className="text-brand-ink hover:bg-accent rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40"
                        >
                            {t('notif_mark_all')}
                        </button>
                        <button
                            onClick={onClose}
                            aria-label={t('close')}
                            className="hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md"
                        >
                            <X className="h-4 w-4" aria-hidden />
                        </button>
                    </div>
                </div>

                {/* Module filter chips: one row, scrolls sideways; the figure is what is still unread */}
                <div
                    ref={tabsRef}
                    className="border-border [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 flex gap-1 overflow-x-auto scroll-smooth border-b px-2 pt-2 pb-1.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
                >
                    {shownTabs.map((tb) => {
                        const count = unreadCount(tb.id);
                        const active = tab === tb.id;
                        return (
                            <button
                                key={tb.id}
                                aria-pressed={active}
                                onClick={(e) => {
                                    setTab(tb.id);
                                    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
                                }}
                                className={cn(
                                    'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                                    active ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:bg-accent',
                                )}
                            >
                                {t(tb.label)}
                                {count > 0 && (
                                    <span className={cn('font-semibold tabular-nums', !active && 'bg-brand/10 text-brand-ink rounded-full px-1.5')}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div
                    aria-busy={feed.isLoading || undefined}
                    className="[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 max-h-[360px] overflow-y-auto scroll-smooth [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
                >
                    {feed.isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="border-border/60 flex gap-3 border-b px-4 py-3">
                                <div className="bg-muted h-8 w-8 shrink-0 animate-pulse rounded-full" />
                                <div className="flex-1 space-y-2 pt-1">
                                    <div className="bg-muted h-3.5 w-3/4 animate-pulse rounded" />
                                    <div className="bg-muted h-3 w-1/2 animate-pulse rounded" />
                                </div>
                            </div>
                        ))
                    ) : items.length === 0 ? (
                        <div className="text-muted-foreground py-12 text-center text-sm">{t('notif_empty')}</div>
                    ) : (
                        <TooltipProvider delayDuration={400}>
                            {items.map((n) => (
                                <NotificationRow
                                    key={n.id}
                                    notification={n}
                                    leaving={dismissing.has(n.id)}
                                    onOpen={() => handleClick(n)}
                                    onDismiss={() => handleDismiss(n.id)}
                                />
                            ))}
                        </TooltipProvider>
                    )}

                    {/* The next page of this tab */}
                    {feed.hasNextPage && (
                        <div className="px-4 py-2.5 text-center">
                            <button
                                type="button"
                                onClick={() => feed.fetchNextPage()}
                                disabled={feed.isFetchingNextPage}
                                className="text-brand-ink hover:bg-accent focus-visible:ring-brand/40 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-hidden disabled:opacity-60"
                            >
                                {feed.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
                                {feed.isFetchingNextPage ? t('loading') : t('notif_load_more')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/** One tray row; when its title is cut short, hovering or focusing the row shows the full title under it. */
function NotificationRow({
    notification: n,
    leaving,
    onOpen,
    onDismiss,
}: {
    notification: AppNotification;
    leaving: boolean;
    onOpen: () => void;
    onDismiss: () => void;
}) {
    const t = useNotificationText();
    const titleRef = useRef<HTMLDivElement>(null);
    const [tipOpen, setTipOpen] = useState(false);
    const { Icon, color, bg } = iconMeta(n);
    const title = notificationTitle(n, t);

    // Only a title that is actually cut opens the tooltip.
    const openTip = (next: boolean) => {
        const el = titleRef.current;
        setTipOpen(next && !!el && el.scrollHeight > el.clientHeight + 1);
    };

    return (
        <Tooltip open={tipOpen} onOpenChange={openTip}>
            <TooltipTrigger asChild>
                <div
                    tabIndex={0}
                    onClick={onOpen}
                    onKeyDown={(e) => {
                        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                        e.preventDefault();
                        onOpen();
                    }}
                    className={cn(
                        'group border-border/60 hover:bg-accent/50 focus-visible:ring-brand/40 flex cursor-pointer gap-3 overflow-hidden border-b px-4 py-3 transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset',
                        !n.read && 'bg-brand/[0.04]',
                        leaving ? 'max-h-0 translate-x-8 !border-b-0 !py-0 opacity-0' : 'max-h-32',
                    )}
                >
                    <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', n.read ? 'bg-muted' : bg)}>
                        <Icon className={cn('h-[18px] w-[18px]', n.read ? 'text-muted-foreground' : color)} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                        {/* One line of title, two of body: the same shape a toast uses */}
                        <div ref={titleRef} className={cn('line-clamp-1 text-sm leading-snug', !n.read && 'font-semibold')}>
                            {title}
                        </div>
                        <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-relaxed">{notificationMessage(n, t)}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-muted-foreground text-xs">{n.created_at}</span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDismiss();
                            }}
                            aria-label={t('notif_dismiss')}
                            title={t('notif_dismiss')}
                            className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                        >
                            <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                    </div>
                </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" alignOffset={60} sideOffset={-6} className="max-w-[340px] text-xs leading-relaxed">
                {title}
            </TooltipContent>
        </Tooltip>
    );
}
