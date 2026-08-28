import type { AppNotification } from '@/modules/notification';
import { requestTitle } from '@/shared/lib/request-meta';
import type { ServiceRequest, ServiceRequestType } from '@/shared/types';
import {
    ArrowRightLeft,
    Boxes,
    CalendarClock,
    CheckCircle2,
    ClipboardList,
    Clock,
    Gauge,
    Inbox,
    KeyRound,
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

/**
 * Shared presentation helpers for notifications, used by both the bell dropdown
 * and the pop-up toaster so the two always render the same icon, colour, title,
 * message, and navigation target for a given notification.
 */

/** Translator signature (matches the function returned by useT). */
type Translate = (key: string) => string;

/** Maps a notification's data.type to the owning module tab id. */
export function moduleOf(type: string): string {
    if (type.startsWith('ticket')) return 'tickets';
    if (type.startsWith('stock')) return 'stock';
    if (type.startsWith('request')) return 'requests';
    if (type.startsWith('asset')) return 'assets';
    if (type.startsWith('contract')) return 'contracts';
    if (type.startsWith('access')) return 'access';
    return 'employees'; // new_employee + employee.*
}

/**
 * Icon + a distinct colour per notification kind so alerts are scannable at a
 * glance: contract expiry = amber (red once overdue), offboarding = red,
 * new-account = emerald, stock alerts and requests coloured by severity/status.
 */
export function iconMeta(n: AppNotification): { Icon: typeof CalendarClock; color: string; bg: string } {
    if (n.data.type === 'contract_expiring') {
        // Already past due → red; still inside the reminder window → amber.
        if ((n.data.days_remaining ?? 0) <= 0) {
            return { Icon: CalendarClock, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' };
        }
        return { Icon: CalendarClock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' };
    }
    if (n.data.type === 'ticket_sla') {
        // Breached = red, at-risk = amber — mirrors the SLA badge tones on the list.
        if (n.data.subtype?.endsWith('breached')) return { Icon: Gauge, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' };
        return { Icon: Gauge, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' };
    }
    if (n.data.type === 'ticket_forwarded') {
        return { Icon: ArrowRightLeft, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10' };
    }
    if (n.data.type === 'ticket_new') {
        return { Icon: Inbox, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' };
    }
    if (n.data.type === 'ticket_assigned') {
        return { Icon: UserPlus, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' };
    }
    if (n.data.type === 'ticket_owner') {
        // Owner-facing case updates: closed = green check, cancelled = red cross,
        // responsibility changes (taken / forwarded) = who has it now.
        if (n.data.event === 'resolved') return { Icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' };
        if (n.data.event === 'cancelled') return { Icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' };
        if (n.data.event === 'forwarded') return { Icon: ArrowRightLeft, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10' };
        return { Icon: UserCheck, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' };
    }
    if (n.data.type === 'stock_alert') {
        if (n.data.subtype === 'out') return { Icon: PackageMinus, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' };
        if (n.data.subtype === 'over') return { Icon: PackagePlus, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' };
        return { Icon: Boxes, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' };
    }
    if (n.data.type === 'stock_request') {
        if (n.data.subtype === 'rejected') return { Icon: Inbox, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' };
        if (n.data.subtype === 'approved' || n.data.subtype === 'fulfilled')
            return { Icon: Inbox, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' };
        return { Icon: Inbox, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' };
    }
    if (n.data.type === 'stock_count') {
        return { Icon: ClipboardList, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' };
    }
    if (n.data.type === 'request') {
        // Service requests: action needed = amber, progress = blue, terminal good = green, bad = red.
        // A request stuck for want of an account is an account job, not an approval one.
        if (n.data.subtype === 'blocked_no_account') return { Icon: KeyRound, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' };
        if (n.data.subtype === 'rejected' || n.data.subtype === 'cancelled')
            return { Icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' };
        if (n.data.subtype === 'approved_final' || n.data.subtype === 'fulfilled')
            return { Icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' };
        if (n.data.subtype === 'waiting') return { Icon: Inbox, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' };
        // A step nobody has touched for days — the clock, not the inbox tray.
        if (n.data.subtype === 'stalled') return { Icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' };
        // The queue bell is amber only while somebody there still has to press Fulfil. Once
        // a case carries the delivery it is news, not a task — the case has its own bell.
        if (n.data.subtype === 'ready_to_fulfill') {
            return n.data.ticket_no
                ? { Icon: PackageCheck, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' }
                : { Icon: Inbox, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' };
        }
        return { Icon: Inbox, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' };
    }
    if (n.data.type === 'asset_assigned') {
        return { Icon: PackageCheck, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' };
    }
    if (n.data.type === 'asset_return_requested') {
        return { Icon: Undo2, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' };
    }
    // A leaver's whole kit in one bell — a job to do, so amber like the return request it
    // replaces, but PackageMinus for "these are leaving your floor" rather than one send-back.
    if (n.data.type === 'asset_offboarding') {
        return { Icon: PackageMinus, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' };
    }
    // A recall is news, never a task: the reader has nothing to press either way, so it
    // wears slate rather than joining the amber "you owe someone something" bells.
    if (n.data.type === 'asset_recalled') {
        return { Icon: PackageX, color: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-500/10' };
    }
    // Access left behind reads with the same urgency as the offboarding bell it arrives
    // beside, but wears the shield the Access Directory uses for its governance rows.
    if (n.data.type === 'access_offboarding') {
        return { Icon: ShieldAlert, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' };
    }
    if (n.data.subtype === 'offboarding') {
        return { Icon: UserMinus, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' };
    }
    // The same departure, read by someone who cannot act on it: still the leaving icon, but
    // slate rather than red — nothing here is waiting on the reader.
    if (n.data.subtype === 'departure') {
        return { Icon: UserMinus, color: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-500/10' };
    }
    return { Icon: UserPlus, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' };
}

/**
 * Headline line for a notification (vendor/contract code, stock item SKU, or employee
 * name/code).
 *
 * Code and name are joined by a plain hyphen — the em dash that used to sit here carried
 * more weight than the line needs, on rows that are already long (an auto-opened case
 * reads TKT-… - [RQ-…] Title). One character for all three, so the bell does not show
 * three different separators.
 *
 * A service request is the one kind that does not quote the stored title: that is the
 * server's canonical English string, so the bell composes the same wording the list uses,
 * in the reader's language. Hence the translator.
 */
export function notificationTitle(n: AppNotification, t: Translate): string {
    if (n.data.type === 'contract_expiring') return `${n.data.contract_vendor} (${n.data.contract_code})`;
    if (n.data.type?.startsWith('ticket_')) return `${n.data.ticket_no} - ${n.data.subject}`;
    if (n.data.type === 'stock_alert') return `${n.data.sku} - ${n.data.name}`;
    if (n.data.type === 'stock_request') return `${n.data.reference ?? n.data.sku ?? '#' + n.data.stock_request_id} ×${n.data.qty}`;
    if (n.data.type === 'stock_count') return n.data.reference ?? `#${n.data.stock_count_id}`;
    if (n.data.type === 'request') {
        const written = n.data.request_type
            ? requestTitle(
                  {
                      type: n.data.request_type as ServiceRequestType,
                      origin: (n.data.origin ?? 'direct') as ServiceRequest['origin'],
                      requester: n.data.requester_name ? { name: n.data.requester_name } : undefined,
                  },
                  t,
              )
            : // Bells delivered before the payload carried the type: their stored title is
              // all there is, in whatever language it was written.
              (n.data.title ?? '');

        return `${n.data.reference} - ${written}`;
    }
    if (n.data.type === 'asset_assigned' || n.data.type === 'asset_return_requested' || n.data.type === 'asset_recalled')
        return `${n.data.asset_model} (${n.data.asset_tag})`;
    return `${n.data.employee_name} (${n.data.employee_code})`;
}

/**
 * Message key per service-request subtype (mirrors the subtypes
 * RequestNotificationService sends). Spelled out rather than composed from the
 * subtype so the keys stay greppable and an unrecognised subtype falls through
 * to nothing instead of printing its own key on screen.
 */
const REQUEST_MESSAGE_KEY: Record<string, string> = {
    submitted: 'notif_request_submitted',
    waiting: 'notif_request_waiting',
    // The morning reminder for a step nobody has acted on. Says how long, because
    // "still waiting" repeated daily reads as the same bell arriving twice.
    stalled: 'notif_request_stalled',
    // The IT queue, which delivers rather than decides. Two readings of the same
    // subtype: with a case open the work lives in the case and this bell only names
    // it; without one, somebody here still has to press Fulfil.
    ready_to_fulfill: 'notif_request_ready_manual',
    approved_step: 'notif_request_approved_step',
    approved_final: 'notif_request_approved_final',
    rejected: 'notif_request_rejected',
    fulfilled: 'notif_request_fulfilled',
    cancelled: 'notif_request_cancelled',
    // Goes to whoever can provision a login, not to a participant.
    blocked_no_account: 'notif_request_blocked_no_account',
};

/** Secondary descriptive line for a notification, already localised. */
export function notificationMessage(n: AppNotification, t: Translate): string {
    if (n.data.type === 'contract_expiring') {
        return (n.data.days_remaining ?? 0) <= 0
            ? t('notif_contract_expired').replace('{days}', String(Math.abs(n.data.days_remaining ?? 0)))
            : t('notif_contract_expiring').replace('{days}', String(n.data.days_remaining));
    }
    if (n.data.type === 'ticket_sla') return t(`notif_ticket_sla_${n.data.subtype}` as Parameters<Translate>[0]);
    if (n.data.type === 'ticket_forwarded') return t('notif_ticket_forwarded').replace('{from}', n.data.from ?? '—');
    if (n.data.type === 'ticket_new') return t('notif_ticket_new');
    if (n.data.type === 'ticket_assigned') return t('notif_ticket_assigned');
    if (n.data.type === 'ticket_owner')
        return t(`notif_ticket_owner_${n.data.event}` as Parameters<Translate>[0]).replace('{name}', n.data.by ?? '—');
    if (n.data.type === 'stock_alert') return t(`notif_stock_${n.data.subtype}` as Parameters<Translate>[0]);
    if (n.data.type === 'stock_request') return t(`notif_stock_req_${n.data.subtype}` as Parameters<Translate>[0]);
    if (n.data.type === 'stock_count') return t('notif_stock_count_draft');
    if (n.data.type === 'request') {
        const key =
            n.data.subtype === 'ready_to_fulfill' && n.data.ticket_no ? 'notif_request_ready_case' : REQUEST_MESSAGE_KEY[n.data.subtype ?? ''];
        if (!key) return '';

        // Say it is a new hire's request up front — an approver acting from the bell
        // never sees the violet marking on the list.
        const prefix = n.data.origin === 'onboarding' ? `${t('req_origin_onboarding')} · ` : '';

        return (
            prefix +
            t(key)
                .replace('{step}', n.data.step_label ?? '—')
                .replace('{actor}', n.data.actor_name ?? '—')
                .replace('{remark}', n.data.remark ?? '')
                .replace('{ticket}', n.data.ticket_no ?? '—')
                .replace('{days}', String(n.data.stalled_days ?? 0))
        );
    }
    if (n.data.type === 'asset_assigned') return t('notif_asset_assigned');
    if (n.data.type === 'asset_return_requested') return t('notif_asset_return_requested');
    // Two different pieces of news wearing one type: a hand-over called off before it was
    // accepted, or a device actually taken back out of someone's hands.
    if (n.data.type === 'asset_recalled') {
        return t(n.data.subtype === 'taken_back' ? 'notif_asset_recalled_taken_back' : 'notif_asset_recalled_cancelled');
    }
    // Names the count: "has assets to hand back" alone does not say whether this is one
    // machine to collect or a trolley's worth.
    if (n.data.type === 'asset_offboarding') {
        return t('notif_asset_offboarding').replace('{count}', String(n.data.count ?? 0));
    }
    // Says how much is waiting and which kind, because "still holds access" alone does not
    // tell the reader whether this is one revoke or an afternoon's work.
    if (n.data.type === 'access_offboarding') {
        return t('notif_access_offboarding')
            .replace('{grants}', String(n.data.grants ?? 0))
            .replace('{owned}', String(n.data.owned ?? 0))
            .replace('{total}', String(n.data.total ?? 0));
    }
    if (n.data.subtype === 'offboarding') return t('notif_resigned');
    if (n.data.subtype === 'departure') return t('notif_departure');

    return t('notif_cred_required');
}

/** SPA route a notification should open when clicked. */
export function notificationTarget(n: AppNotification): string {
    // Every ticket notification opens the case's detail drawer directly.
    if (n.data.type?.startsWith('ticket_')) return `/tickets?view=${n.data.ticket_id}`;
    // Asset hand-overs go to the employee-facing My Assets page; return requests go to the IT module.
    if (n.data.type === 'asset_assigned') return '/my-assets';
    if (n.data.type === 'asset_return_requested') return '/assets';
    // Nothing to act on, but the reader's own list is what changed — open it there.
    if (n.data.type === 'asset_recalled') return '/my-assets';
    if (n.data.type === 'asset_offboarding') return '/assets';
    if (n.data.type === 'access_offboarding') return '/access';
    const mod = moduleOf(n.data.type);
    // The stuck-request bell asks for an account, so it opens the person who needs one
    // rather than the request nobody can act on yet.
    if (n.data.subtype === 'blocked_no_account' && n.data.employee_id) return `/employees?highlight=${n.data.employee_id}`;
    if (mod === 'requests') return `/requests?view=${n.data.service_request_id}`;
    if (mod === 'contracts') return `/contracts?view=${n.data.contract_id}`;
    if (mod === 'stock') {
        if (n.data.type === 'stock_request') return '/stock?tab=requests';
        if (n.data.type === 'stock_count') return '/stock?tab=audit';
        return '/stock?tab=items';
    }
    return `/employees?highlight=${n.data.employee_id}`;
}
