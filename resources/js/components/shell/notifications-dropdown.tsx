import { useMarkAllRead, useMarkRead, useNotifications } from '@/hooks/use-notifications';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/services/notificationApi';
import { UserPlus, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export function NotificationsDropdown({ onClose }: { onClose: () => void }) {
    const t = useT();
    const navigate = useNavigate();
    const ref = useRef<HTMLDivElement>(null);
    const { data } = useNotifications();
    const markRead = useMarkRead();
    const markAllRead = useMarkAllRead();

    const items = data?.data ?? [];
    const unread = data?.unread ?? 0;

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                ref.current &&
                !ref.current.contains(e.target as Node) &&
                !(e.target as HTMLElement).closest('[data-notif-btn]')
            ) {
                onClose();
            }
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [onClose]);

    const handleClick = (n: AppNotification) => {
        if (!n.read) markRead.mutate(n.id);
        navigate(`/employees?highlight=${n.data.employee_id}`);
        onClose();
    };

    return (
        <div
            ref={ref}
            className="absolute right-4 top-14 z-50 w-[360px] overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
        >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                    <div className="text-sm font-semibold">{t('notif_title')}</div>
                    {unread > 0 && (
                        <div className="text-xs text-muted-foreground">
                            {unread} {t('notif_unread')}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => markAllRead.mutate()}
                        disabled={unread === 0 || markAllRead.isPending}
                        className="rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-accent disabled:opacity-40"
                    >
                        {t('notif_mark_all')}
                    </button>
                    <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto">
                {items.length === 0 && (
                    <div className="py-12 text-center text-sm text-muted-foreground">{t('notif_empty')}</div>
                )}
                {items.map((n) => (
                    <div
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={cn(
                            'group flex cursor-pointer gap-3 border-b border-border/60 px-4 py-3 transition-colors hover:bg-accent/50',
                            !n.read && 'bg-brand/[0.04]',
                        )}
                    >
                        <UserPlus className="mt-0.5 h-[18px] w-[18px] shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                            <div className={cn('text-sm leading-snug', !n.read && 'font-semibold')}>
                                {n.data.employee_name} ({n.data.employee_code})
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">{t('notif_cred_required')}</div>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{n.created_at}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
