import type { AppNotification } from '@/modules/notification';
import { Boxes, CalendarClock, ClipboardList, Inbox, PackageMinus, PackagePlus, UserMinus, UserPlus } from 'lucide-react';

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
    if (n.data.subtype === 'offboarding') {
        return { Icon: UserMinus, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' };
    }
    return { Icon: UserPlus, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' };
}

/** Headline line for a notification (vendor/contract code, stock item SKU, or employee name/code). */
export function notificationTitle(n: AppNotification): string {
    if (n.data.type === 'contract_expiring') return `${n.data.contract_vendor} (${n.data.contract_code})`;
    if (n.data.type === 'stock_alert') return `${n.data.sku} — ${n.data.name}`;
    if (n.data.type === 'stock_request') return `${n.data.reference ?? n.data.sku ?? '#' + n.data.stock_request_id} ×${n.data.qty}`;
    if (n.data.type === 'stock_count') return n.data.reference ?? `#${n.data.stock_count_id}`;
    return `${n.data.employee_name} (${n.data.employee_code})`;
}

/** Secondary descriptive line for a notification, already localised. */
export function notificationMessage(n: AppNotification, t: Translate): string {
    if (n.data.type === 'contract_expiring') {
        return (n.data.days_remaining ?? 0) <= 0
            ? t('notif_contract_expired').replace('{days}', String(Math.abs(n.data.days_remaining ?? 0)))
            : t('notif_contract_expiring').replace('{days}', String(n.data.days_remaining));
    }
    if (n.data.type === 'stock_alert') return t(`notif_stock_${n.data.subtype}` as Parameters<Translate>[0]);
    if (n.data.type === 'stock_request') return t(`notif_stock_req_${n.data.subtype}` as Parameters<Translate>[0]);
    if (n.data.type === 'stock_count') return t('notif_stock_count_draft');
    return n.data.subtype === 'offboarding' ? t('notif_resigned') : t('notif_cred_required');
}

/** SPA route a notification should open when clicked. */
export function notificationTarget(n: AppNotification): string {
    const mod = moduleOf(n.data.type);
    if (mod === 'contracts') return `/contracts?view=${n.data.contract_id}`;
    if (mod === 'stock') {
        if (n.data.type === 'stock_request') return '/stock?tab=requests';
        if (n.data.type === 'stock_count') return '/stock?tab=audit';
        return '/stock?tab=items';
    }
    return `/employees?highlight=${n.data.employee_id}`;
}
