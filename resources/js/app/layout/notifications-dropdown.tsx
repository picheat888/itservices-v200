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
import { EmptyPane } from '@/shared/components/empty-pane';
import { LoadFailed } from '@/shared/components/load-failed';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { relativeTime } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { BellOff, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { iconMeta, moduleOf, notificationMessage, notificationTitle, openNotificationTarget } from './notification-display';

// "All", then the catalogue's groups; a module tab shows once it has something in it.
const NOTIF_TABS: { id: string; label: string }[] = [{ id: 'all', label: 'notif_all' }, ...NOTIFICATION_GROUPS];

/** Scrolling and sliding honour the reader's reduced-motion setting. */
const smooth = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/** Up/Down/Home/End from a row (or its X) move to another row; Down on the last row asks for older ones. True when the key was one of them. */
function moveBetweenRows(e: React.KeyboardEvent<HTMLElement>, row: HTMLElement | null, onReachEnd: () => void): boolean {
    if (!row || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return false;
    e.preventDefault();
    const rows = [...(row.closest('#notif-tray')?.querySelectorAll<HTMLElement>('[data-notif-row]') ?? [])];
    const at = rows.indexOf(row);
    const next = e.key === 'Home' ? rows[0] : e.key === 'End' ? rows[rows.length - 1] : rows[at + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) next.focus();
    else if (e.key === 'ArrowDown') onReachEnd();
    return true;
}

/** The kind the server counts and filters by: payload type, plus the imitated module on a test sample. */
const kindKey = (type: string | null, module: string | null) => `${type ?? ''}|${module ?? ''}`;

export function NotificationsDropdown({ onClose, onChangePassword }: { onClose: () => void; onChangePassword: () => void }) {
    // Prefers the wording an administrator set on the Bell tab, else the bundled string.
    const t = useNotificationText();
    const navigate = useNavigate();
    const location = useLocation();
    const ref = useRef<HTMLDivElement>(null);
    const tabsRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const { data } = useNotifications();
    const markRead = useMarkRead();
    const markAllRead = useMarkAllRead();
    const dismiss = useDismissNotification();
    const [tab, setTab] = useState('all');
    // Ids mid-dismiss: play the slide-out/collapse animation, then actually remove.
    const [dismissing, setDismissing] = useState<Set<string>>(new Set());
    // WAI-ARIA roving tabindex: the list is one Tab stop; this row holds it (the first row until one is focused).
    const [rovingId, setRovingId] = useState<string | null>(null);

    // Close and hand focus back to the bell (keyboard users keep their place).
    const close = useCallback(
        (returnFocus: boolean) => {
            onClose();
            if (returnFocus) document.querySelector<HTMLElement>('[data-notif-btn]')?.focus();
        },
        [onClose],
    );

    const handleDismiss = (id: string, rowEl: HTMLElement | null) => {
        if (dismissing.has(id)) return;
        // Focus moves to the next row (or the one before) before this one collapses.
        const rows = [...(ref.current?.querySelectorAll<HTMLElement>('[data-notif-row]') ?? [])];
        const at = rowEl ? rows.indexOf(rowEl) : -1;
        const neighbour = rows[at + 1] ?? rows[at - 1];
        neighbour?.focus();
        setDismissing((prev) => new Set(prev).add(id));
        window.setTimeout(
            () =>
                dismiss.mutate(id, {
                    // The cache rolls the row back; show it again and say why.
                    onError: () => {
                        setDismissing((prev) => {
                            const next = new Set(prev);
                            next.delete(id);
                            return next;
                        });
                        useToastStore.getState().push(t('notif_dismiss_failed'), 'error');
                    },
                }),
            220,
        );
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
    // One module only: "All" and its chip would show the same list, so the chip row is left out.
    const showChips = shownTabs.length > 2;

    const selectTab = (id: string, el: HTMLElement | null) => {
        setTab(id);
        el?.scrollIntoView({ behavior: smooth(), inline: 'nearest', block: 'nearest' });
    };

    // Left/Right/Home/End move between the chips (a tablist), selecting as they go.
    const onChipKey = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        const last = shownTabs.length - 1;
        const to = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        const el = tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to] ?? null;
        el?.focus();
        selectTab(shownTabs[to].id, el);
    };
    const unreadCount = (id: string) => (id === 'all' ? unread : (unreadByModule[id] ?? 0));

    // The open tab's list, fetched from the server for that tab and loaded a page at a time.
    const feed = useNotificationFeed(tab, tab === 'all' ? null : (kindsByModule[tab] ?? []));
    const items = useMemo(() => {
        const seen = new Set<string>();
        // A refetch after a dismiss can shift a row onto the next page; show it once.
        return (feed.data?.pages ?? []).flatMap((page) => page.data).filter((n) => !seen.has(n.id) && seen.add(n.id));
    }, [feed.data]);

    // Older rows load as the list end scrolls into view (or Down is pressed on the last row).
    const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = feed;
    const loadOlder = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
    useEffect(() => {
        const end = endRef.current;
        if (!end || !hasNextPage || isFetchNextPageError) return;
        const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadOlder(), {
            root: listRef.current,
            rootMargin: '0px 0px 160px 0px',
        });
        observer.observe(end);
        return () => observer.disconnect();
    }, [hasNextPage, isFetchNextPageError, loadOlder, items.length]);
    const matching = feed.data?.pages[feed.data.pages.length - 1]?.matching ?? items.length;

    // A tab that emptied out (its last row dismissed) falls back to All.
    useEffect(() => {
        if (tab !== 'all' && data && !(totalByModule[tab] > 0)) setTab('all');
    }, [tab, data, totalByModule]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-notif-btn]')) {
                close(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close(true);
        };
        window.addEventListener('mousedown', handler);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', handler);
            window.removeEventListener('keydown', onKey);
        };
    }, [close]);

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
    }, [showChips]);

    const handleClick = (n: AppNotification) => {
        if (!n.read) markRead.mutate(n.id);
        // The password warning opens the shell's Change password dialog (?dialog=password), not a page.
        if (n.data.type === 'password_expiring') {
            onChangePassword();
            close(false);
        } else {
            openNotificationTarget(navigate, n, location.search);
            close(true);
        }
    };

    return (
        <div
            ref={ref}
            id="notif-tray"
            role="dialog"
            aria-labelledby="notif-tray-title"
            onBlur={(e) => {
                const next = e.relatedTarget as HTMLElement | null;
                if (next && !ref.current?.contains(next) && !next.closest('[data-notif-btn]')) close(false);
            }}
            className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 absolute top-[4.5rem] right-4 z-50 w-[440px] max-w-[calc(100vw-2rem)] origin-top-right duration-150 ease-out motion-reduce:animate-none"
        >
            {/* Caret aimed back at the bell */}
            <div className="border-border bg-popover absolute -top-[5px] right-[13px] h-2.5 w-2.5 rotate-45 border-t border-l" />

            <div className="border-border bg-popover text-popover-foreground relative overflow-hidden rounded-lg border shadow-lg">
                <div className="border-border flex items-center justify-between border-b px-4 py-3">
                    <div>
                        <h2 id="notif-tray-title" className="text-sm font-semibold">
                            {t('notif_title')}
                        </h2>
                        {/* Announced when the unread count changes (mark all read, a dismiss) */}
                        <div role="status" className={cn('text-muted-foreground text-xs', unread === 0 && 'sr-only')}>
                            {unread > 0 && `${unread} ${t('notif_unread')}`}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => markAllRead.mutate()}
                            disabled={unread === 0 || markAllRead.isPending}
                            className="text-brand-ink h-8 px-2.5 text-xs [@media(pointer:coarse)]:h-10"
                        >
                            {t('notif_mark_all')}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => close(true)}
                            aria-label={t('close')}
                            className="h-8 w-8 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
                        >
                            <X aria-hidden />
                        </Button>
                    </div>
                </div>

                {/* Module filter chips: one row, scrolls sideways; the figure is what is still unread */}
                {showChips && (
                    <div
                        ref={tabsRef}
                        role="tablist"
                        aria-label={t('notif_title')}
                        className="border-border [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 flex gap-1 overflow-x-auto border-b px-2 pt-2 pb-1.5 [scrollbar-width:thin] motion-safe:scroll-smooth [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
                    >
                        {shownTabs.map((tb, index) => {
                            const count = unreadCount(tb.id);
                            const active = tab === tb.id;
                            return (
                                <button
                                    key={tb.id}
                                    type="button"
                                    role="tab"
                                    id={`notif-tab-${tb.id}`}
                                    aria-selected={active}
                                    aria-controls="notif-tray-list"
                                    tabIndex={active ? 0 : -1}
                                    onClick={(e) => selectTab(tb.id, e.currentTarget)}
                                    onKeyDown={(e) => onChipKey(e, index)}
                                    className={cn(
                                        'focus-visible:ring-ring flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-hidden [@media(pointer:coarse)]:py-2',
                                        active ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:bg-accent',
                                    )}
                                >
                                    {t(tb.label)}
                                    {count > 0 && (
                                        <span
                                            className={cn('font-semibold tabular-nums', !active && 'bg-brand/10 text-brand-ink rounded-full px-1.5')}
                                        >
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div
                    ref={listRef}
                    id="notif-tray-list"
                    role={showChips ? 'tabpanel' : undefined}
                    aria-labelledby={showChips ? `notif-tab-${tab}` : undefined}
                    aria-busy={feed.isLoading || undefined}
                    className="[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 max-h-[min(60vh,560px)] overflow-y-auto overscroll-contain [scrollbar-width:thin] motion-safe:scroll-smooth [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
                >
                    {feed.isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="border-border/60 flex gap-3 border-b px-4 py-3">
                                <Skeleton className="h-8 w-8 shrink-0 rounded-full motion-reduce:animate-none" />
                                <div className="flex-1 space-y-2 pt-1">
                                    <Skeleton className="h-3.5 w-3/4 motion-reduce:animate-none" />
                                    <Skeleton className="h-3 w-1/2 motion-reduce:animate-none" />
                                </div>
                            </div>
                        ))
                    ) : feed.isError && items.length === 0 ? (
                        <div className="px-4 py-10 text-center">
                            <LoadFailed onRetry={() => feed.refetch()} />
                        </div>
                    ) : items.length === 0 ? (
                        <EmptyPane icon={BellOff} text={t('notif_empty')} />
                    ) : (
                        <TooltipProvider delayDuration={400}>
                            {/* How the keyboard moves in the list, read once when a row gets focus */}
                            <span id="notif-keys-hint" className="sr-only">
                                {t('notif_keys_hint')}
                            </span>
                            {items.map((n) => (
                                <NotificationRow
                                    key={n.id}
                                    notification={n}
                                    tabbable={n.id === (items.some((i) => i.id === rovingId) ? rovingId : items[0]?.id)}
                                    onFocusRow={() => setRovingId(n.id)}
                                    onReachEnd={loadOlder}
                                    leaving={dismissing.has(n.id)}
                                    onOpen={() => handleClick(n)}
                                    onDismiss={(rowEl) => handleDismiss(n.id, rowEl)}
                                />
                            ))}
                        </TooltipProvider>
                    )}

                    {/* List end: how much is shown, loading, the end, or a retry; the marker below triggers the next page */}
                    {items.length > 0 &&
                        (isFetchNextPageError ? (
                            <div className="px-4 py-3 text-center">
                                <LoadFailed onRetry={() => fetchNextPage()} />
                            </div>
                        ) : (
                            <div role="status" className="text-muted-foreground flex items-center justify-center gap-1.5 px-4 py-3 text-xs">
                                {isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
                                {isFetchingNextPage
                                    ? t('loading')
                                    : hasNextPage
                                      ? t('notif_showing').replace('{shown}', String(items.length)).replace('{total}', String(matching))
                                      : (feed.data?.pages.length ?? 0) > 1
                                        ? t('notif_end')
                                        : null}
                            </div>
                        ))}
                    <div ref={endRef} aria-hidden className="h-px" />
                </div>
            </div>
        </div>
    );
}

/** One tray row: the whole row opens it, the X beside it dismisses; a cut title shows in full on hover or focus. */
function NotificationRow({
    notification: n,
    tabbable,
    onFocusRow,
    onReachEnd,
    leaving,
    onOpen,
    onDismiss,
}: {
    notification: AppNotification;
    tabbable: boolean;
    onFocusRow: () => void;
    onReachEnd: () => void;
    leaving: boolean;
    onOpen: () => void;
    onDismiss: (rowEl: HTMLElement | null) => void;
}) {
    const t = useNotificationText();
    const titleRef = useRef<HTMLDivElement>(null);
    const openRef = useRef<HTMLButtonElement>(null);
    const dismissRef = useRef<HTMLButtonElement>(null);
    const [tipOpen, setTipOpen] = useState(false);
    const { Icon, color, bg } = iconMeta(n);
    const title = notificationTitle(n, t);
    const lang = useUiStore((st) => st.lang);
    const fmt = useDateFormat();

    // Only a title that is actually cut opens the tooltip.
    const openTip = (next: boolean) => {
        const el = titleRef.current;
        setTipOpen(next && !!el && el.scrollHeight > el.clientHeight + 1);
    };

    return (
        <div
            className={cn(
                'group border-border/60 hover:bg-accent/50 relative flex gap-3 overflow-hidden border-b px-4 py-3 transition-[opacity,transform,max-height,padding] duration-200 ease-out motion-reduce:transition-none',
                !n.read && 'bg-brand/[0.04]',
                leaving ? 'max-h-0 translate-x-8 !border-b-0 !py-0 opacity-0' : 'max-h-32',
            )}
        >
            <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', n.read ? 'bg-muted' : bg)}>
                <Icon className={cn('h-[18px] w-[18px]', n.read ? 'text-muted-foreground' : color)} aria-hidden />
            </div>
            <Tooltip open={tipOpen} onOpenChange={openTip}>
                <TooltipTrigger asChild>
                    {/* The button's ::after covers the whole row, so a click anywhere opens it */}
                    <button
                        ref={openRef}
                        type="button"
                        data-notif-row
                        tabIndex={tabbable ? 0 : -1}
                        aria-describedby="notif-keys-hint"
                        aria-keyshortcuts="ArrowUp ArrowDown Home End ArrowRight Delete"
                        onFocus={onFocusRow}
                        onClick={onOpen}
                        onKeyDown={(e) => {
                            if (moveBetweenRows(e, e.currentTarget, onReachEnd)) return;
                            if (e.key === 'ArrowRight') {
                                e.preventDefault();
                                dismissRef.current?.focus();
                            } else if (e.key === 'Delete') {
                                e.preventDefault();
                                onDismiss(openRef.current);
                            }
                        }}
                        className="focus-visible:after:ring-brand min-w-0 flex-1 cursor-pointer text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-hidden focus-visible:after:ring-2 focus-visible:after:ring-inset"
                    >
                        {/* One line of title, two of body: the same shape a toast uses */}
                        <div ref={titleRef} className={cn('line-clamp-1 text-sm leading-snug', !n.read && 'font-semibold')}>
                            {!n.read && <span className="sr-only">{t('notif_unread')}: </span>}
                            {title}
                        </div>
                        <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-relaxed">{notificationMessage(n, t)}</div>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" sideOffset={-6} className="max-w-[340px] text-xs leading-relaxed">
                    {title}
                </TooltipContent>
            </Tooltip>
            <div className="flex shrink-0 flex-col items-end gap-1">
                <time
                    dateTime={n.created_at_iso}
                    title={n.created_at_iso ? fmt.dateTime(n.created_at_iso) : undefined}
                    className="text-muted-foreground text-xs"
                >
                    {n.created_at_iso ? relativeTime(n.created_at_iso, lang, '') : n.created_at}
                </time>
                <button
                    ref={dismissRef}
                    type="button"
                    tabIndex={-1}
                    onClick={() => onDismiss(openRef.current)}
                    onKeyDown={(e) => {
                        if (moveBetweenRows(e, openRef.current, onReachEnd)) return;
                        if (e.key === 'ArrowLeft') {
                            e.preventDefault();
                            openRef.current?.focus();
                        }
                    }}
                    aria-label={t('notif_dismiss')}
                    title={t('notif_dismiss')}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground relative z-10 flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9 [@media(pointer:coarse)]:opacity-100"
                >
                    <X className="h-3.5 w-3.5" aria-hidden />
                </button>
            </div>
        </div>
    );
}
