import { useDismissNotification, useMarkAllRead, useMarkRead, useNotifications } from '@/hooks/use-notifications';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/services/notificationApi';
import { CalendarClock, UserMinus, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/** Per-module tabs. `live` modules render their notifications; others show a coming-soon note. */
const NOTIF_TABS: { id: string; label: string; live: boolean }[] = [
    { id: 'all', label: 'notif_all', live: true },
    { id: 'employees', label: 'employees', live: true },
    { id: 'tickets', label: 'tickets', live: false },
    { id: 'requests', label: 'requests', live: false },
    { id: 'assets', label: 'assets', live: false },
    { id: 'contracts', label: 'contracts', live: true },
];

/** Maps a notification's data.type to the owning module tab id. */
function moduleOf(type: string): string {
    if (type.startsWith('ticket')) return 'tickets';
    if (type.startsWith('request')) return 'requests';
    if (type.startsWith('asset')) return 'assets';
    if (type.startsWith('contract')) return 'contracts';
    return 'employees'; // new_employee + employee.*
}

/**
 * Icon + a distinct colour per notification kind so the bell is scannable at a
 * glance: contract expiry = amber, offboarding = red, new-account = emerald.
 */
function iconMeta(n: AppNotification): { Icon: typeof CalendarClock; color: string; bg: string } {
    if (n.data.type === 'contract_expiring') {
        return { Icon: CalendarClock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' };
    }
    if (n.data.subtype === 'offboarding') {
        return { Icon: UserMinus, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' };
    }
    return { Icon: UserPlus, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' };
}

export function NotificationsDropdown({ onClose }: { onClose: () => void }) {
    const t = useT();
    const navigate = useNavigate();
    const ref = useRef<HTMLDivElement>(null);
    const { data } = useNotifications();
    const markRead = useMarkRead();
    const markAllRead = useMarkAllRead();
    const dismiss = useDismissNotification();
    const [tab, setTab] = useState('all');

    const items = data?.data ?? [];
    const unread = data?.unread ?? 0;

    const activeTab = NOTIF_TABS.find((x) => x.id === tab) ?? NOTIF_TABS[0];
    const visibleItems = tab === 'all' ? items : items.filter((n) => moduleOf(n.data.type) === tab);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-notif-btn]')) {
                onClose();
            }
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [onClose]);

    const handleClick = (n: AppNotification) => {
        if (!n.read) markRead.mutate(n.id);
        if (moduleOf(n.data.type) === 'contracts') {
            navigate(`/contracts?view=${n.data.contract_id}`);
        } else {
            navigate(`/employees?highlight=${n.data.employee_id}`);
        }
        onClose();
    };

    return (
        <div
            ref={ref}
            className="border-border bg-popover absolute top-14 right-4 z-50 w-[430px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-lg"
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

            {/* Per-module filter tabs */}
            <div className="border-border flex gap-1 overflow-x-auto border-b px-2 py-2">
                {NOTIF_TABS.map((tb) => (
                    <button
                        key={tb.id}
                        onClick={() => setTab(tb.id)}
                        className={cn(
                            'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                            tab === tb.id ? 'bg-brand text-white' : 'text-muted-foreground hover:bg-accent',
                        )}
                    >
                        {t(tb.label)}
                    </button>
                ))}
            </div>

            <div className="max-h-[360px] overflow-y-auto">
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
                                    'group border-border/60 hover:bg-accent/50 flex cursor-pointer gap-3 border-b px-4 py-3 transition-colors',
                                    !n.read && 'bg-brand/[0.04]',
                                )}
                            >
                                <div
                                    className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', n.read ? 'bg-muted' : bg)}
                                >
                                    <Icon className={cn('h-[18px] w-[18px]', n.read ? 'text-muted-foreground' : color)} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className={cn('text-sm leading-snug', !n.read && 'font-semibold')}>
                                        {n.data.type === 'contract_expiring'
                                            ? `${n.data.contract_vendor} (${n.data.contract_code})`
                                            : `${n.data.employee_name} (${n.data.employee_code})`}
                                    </div>
                                    <div className="text-muted-foreground mt-0.5 text-xs">
                                        {n.data.type === 'contract_expiring'
                                            ? t('notif_contract_expiring').replace('{days}', String(n.data.days_remaining))
                                            : n.data.subtype === 'offboarding'
                                              ? t('notif_resigned')
                                              : t('notif_cred_required')}
                                    </div>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                    <span className="text-muted-foreground text-[11px]">{n.created_at}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            dismiss.mutate(n.id);
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
