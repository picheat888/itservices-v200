// Notification icons and tones, plus the bell text in the current UI language, for the bell dropdown and the toasts.
import type { AppNotification, Translate } from '@/modules/notification';
import { notificationMessage as notificationMessageIn, notificationTarget, notificationTitle as notificationTitleIn } from '@/modules/notification';
import { dialogPushedState } from '@/shared/hooks/use-dialog-param';
import { guardNavigation } from '@/shared/hooks/use-navigation-guard';
import { resolveNotificationTarget } from '@/shared/lib/dialog-search';
import { useUiStore } from '@/stores/ui';
import {
    ArrowRightLeft,
    Boxes,
    CalendarClock,
    CheckCircle2,
    ClipboardList,
    Clock,
    FileDown,
    FileX,
    FlaskConical,
    Gauge,
    Inbox,
    KeyRound,
    MailX,
    MessageSquare,
    PackageCheck,
    PackageMinus,
    PackagePlus,
    PackageX,
    ShieldAlert,
    Undo2,
    UserCheck,
    UserMinus,
    UserPlus,
    XCircle,
} from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';

export { moduleOf, notificationTarget } from '@/modules/notification';

/** Each notification tone: the icon ink and its tinted circle (vivid on purpose; one place for the bell and the toasts). */
export type NotificationTone = 'amber' | 'blue' | 'emerald' | 'red' | 'slate' | 'violet';

const TONE: Record<NotificationTone, { tone: NotificationTone; color: string; bg: string }> = {
    amber: { tone: 'amber', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
    blue: { tone: 'blue', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
    emerald: { tone: 'emerald', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
    red: { tone: 'red', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' },
    slate: { tone: 'slate', color: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-500/10' },
    violet: { tone: 'violet', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10' },
};

export function iconMeta(n: AppNotification): { Icon: typeof CalendarClock; tone: NotificationTone; color: string; bg: string } {
    // A sample sent from Settings: violet, the one tone no real alert uses
    if (n.data.type === 'test') {
        return { Icon: FlaskConical, ...TONE.violet };
    }
    if (n.data.type === 'contract_expiring') {
        // Already past due → red; still inside the reminder window → amber.
        if ((n.data.days_remaining ?? 0) <= 0) {
            return { Icon: CalendarClock, ...TONE.red };
        }
        return { Icon: CalendarClock, ...TONE.amber };
    }
    if (n.data.type === 'ticket_sla') {
        // Over SLA = red, near due = amber — mirrors the SLA badge tones on the list.
        if (n.data.subtype?.endsWith('over_sla')) return { Icon: Gauge, ...TONE.red };
        return { Icon: Gauge, ...TONE.amber };
    }
    if (n.data.type === 'ticket_forwarded' || n.data.type === 'ticket_forwarded_away') {
        return { Icon: ArrowRightLeft, ...TONE.violet };
    }
    if (n.data.type === 'ticket_new') {
        return { Icon: Inbox, ...TONE.blue };
    }
    if (n.data.type === 'ticket_assigned') {
        return { Icon: UserPlus, ...TONE.emerald };
    }
    if (n.data.type === 'ticket_owner') {
        // Owner-facing case updates: closed, cancelled, or who has it now
        if (n.data.event === 'resolved') return { Icon: CheckCircle2, ...TONE.emerald };
        if (n.data.event === 'cancelled') return { Icon: XCircle, ...TONE.red };
        if (n.data.event === 'forwarded') return { Icon: ArrowRightLeft, ...TONE.violet };
        // A progress note: amber, the app's "still running" tone
        if (n.data.event === 'updated') return { Icon: MessageSquare, ...TONE.amber };
        return { Icon: UserCheck, ...TONE.blue };
    }
    if (n.data.type === 'stock_alert') {
        if (n.data.subtype === 'out') return { Icon: PackageMinus, ...TONE.red };
        if (n.data.subtype === 'over') return { Icon: PackagePlus, ...TONE.blue };
        return { Icon: Boxes, ...TONE.amber };
    }
    if (n.data.type === 'stock_request') {
        if (n.data.subtype === 'rejected') return { Icon: Inbox, ...TONE.red };
        if (n.data.subtype === 'approved' || n.data.subtype === 'fulfilled') return { Icon: Inbox, ...TONE.emerald };
        return { Icon: Inbox, ...TONE.amber };
    }
    if (n.data.type === 'stock_count') {
        return { Icon: ClipboardList, ...TONE.blue };
    }
    if (n.data.type === 'request') {
        // Service requests: action needed = amber, progress = blue, good end = green, bad end = red
        if (n.data.subtype === 'blocked_no_account') return { Icon: KeyRound, ...TONE.amber };
        if (n.data.subtype === 'rejected' || n.data.subtype === 'cancelled') return { Icon: XCircle, ...TONE.red };
        if (n.data.subtype === 'approved_final' || n.data.subtype === 'completed') return { Icon: CheckCircle2, ...TONE.emerald };
        if (n.data.subtype === 'waiting') return { Icon: Inbox, ...TONE.amber };
        // A step nobody has touched for days — the clock, not the inbox tray.
        if (n.data.subtype === 'stalled') return { Icon: Clock, ...TONE.amber };
        // Amber only while somebody still has to press Complete; with a case it is news
        if (n.data.subtype === 'ready_to_complete') {
            return n.data.ticket_no ? { Icon: PackageCheck, ...TONE.blue } : { Icon: Inbox, ...TONE.amber };
        }
        return { Icon: Inbox, ...TONE.blue };
    }
    // A file the reader asked for: ready = emerald download, failed = red
    if (n.data.type === 'report_export') {
        return n.data.subtype === 'failed' ? { Icon: FileX, ...TONE.red } : { Icon: FileDown, ...TONE.emerald };
    }
    // A scheduled report that did not go out — red, the mail never left.
    if (n.data.type === 'report_schedule') {
        return { Icon: MailX, ...TONE.red };
    }
    if (n.data.type === 'password_expiring') {
        return { Icon: KeyRound, ...TONE.amber };
    }
    if (n.data.type === 'asset_assigned') {
        return { Icon: PackageCheck, ...TONE.emerald };
    }
    if (n.data.type === 'asset_return_requested') {
        return { Icon: Undo2, ...TONE.amber };
    }
    // A leaver's whole kit in one bell: a job to do
    if (n.data.type === 'asset_offboarding') {
        return { Icon: PackageMinus, ...TONE.amber };
    }
    // A recall is news, never a task: slate
    if (n.data.type === 'asset_recalled') {
        return { Icon: PackageX, ...TONE.slate };
    }
    // Access left behind: as urgent as the offboarding bell, with the Access Directory shield
    if (n.data.type === 'access_offboarding') {
        return { Icon: ShieldAlert, ...TONE.red };
    }
    if (n.data.subtype === 'offboarding') {
        return { Icon: UserMinus, ...TONE.red };
    }
    // The same departure for someone who cannot act on it: slate
    if (n.data.subtype === 'departure') {
        return { Icon: UserMinus, ...TONE.slate };
    }
    return { Icon: UserPlus, ...TONE.emerald };
}

/** Headline line for a notification, in the current UI language. */
export function notificationTitle(n: AppNotification, t: Translate): string {
    return notificationTitleIn(n, t, useUiStore.getState().lang);
}

/** Secondary descriptive line for a notification, in the current UI language. */
export function notificationMessage(n: AppNotification, t: Translate): string {
    return notificationMessageIn(n, t, useUiStore.getState().lang);
}

/** Opens a notification's target: a path navigates, a `?…` target opens its dialog over the current page. */
export function openNotificationTarget(navigate: NavigateFunction, n: AppNotification, currentSearch: string): void {
    const resolved = resolveNotificationTarget(notificationTarget(n), currentSearch);
    if (typeof resolved === 'string') guardNavigation(resolved, () => navigate(resolved));
    else navigate(resolved, { state: dialogPushedState() });
}
