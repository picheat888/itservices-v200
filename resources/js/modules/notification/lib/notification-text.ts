// A bell's headline, message, click target and module tab, shared by the tray, the toasts and the service worker.
// Pure (no React, no stores): the language comes in as a parameter.
import type { Lang } from '@/lang/types';
import { PROFILE_ASSETS_SEARCH } from '@/shared/lib/dialog-search';
import { localPair } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { requestTitle } from '@/shared/lib/request-title';
import type { ServiceRequest, ServiceRequestType } from '@/shared/types';
import type { AppNotification } from '../api/notificationApi';

/** Translator signature (matches the function returned by useT). */
export type Translate = (key: string) => string;

/** Maps a notification's data.type to the owning module tab id. */
export function moduleOf(type: string, module?: string): string {
    // A test row belongs in the tab of the notification it samples
    if (type === 'test') return module ?? 'employees';
    if (type.startsWith('ticket')) return 'tickets';
    if (type.startsWith('stock')) return 'stock';
    if (type.startsWith('request')) return 'requests';
    if (type.startsWith('asset')) return 'assets';
    if (type.startsWith('contract')) return 'contracts';
    if (type.startsWith('access')) return 'access';
    // Notices about the account itself
    if (type === 'password_expiring' || type === 'sla_holidays' || type === 'report_export' || type === 'report_schedule') return 'system';
    return 'employees'; // new_employee + employee.*
}

/** Headline line for a notification: tickets and requests lead with their number, the rest read "name (code)". */
export function notificationTitle(n: AppNotification, t: Translate, lang: Lang): string {
    // Named by the notification it samples, in the reader's own language
    if (n.data.type === 'test') {
        return `${t('notif_test_prefix')} ${t(`notification_name_${(n.data.source_key ?? '').replace(/^notif_/, '')}`)}`;
    }
    if (n.data.type === 'contract_expiring') return `${localPair(n.data.contract_vendor, n.data.contract_vendor_th, lang)} (${n.data.contract_code})`;
    // Number first: long titles truncate, and the number is what people refer to
    if (n.data.type?.startsWith('ticket_')) return `${n.data.ticket_no} ${n.data.subject}`;
    if (n.data.type === 'stock_alert') return `${n.data.name} (${n.data.sku})`;
    if (n.data.type === 'stock_request' && n.data.subtype === 'awaiting_fulfil') return t('notif_stock_req_awaiting_fulfil');
    if (n.data.type === 'stock_request') return `${n.data.reference ?? n.data.sku ?? '#' + n.data.stock_request_id} ×${n.data.qty}`;
    if (n.data.type === 'stock_count') return n.data.reference ?? `#${n.data.stock_count_id}`;
    if (n.data.type === 'request') {
        const written = n.data.request_type
            ? requestTitle(
                  {
                      type: n.data.request_type as ServiceRequestType,
                      origin: (n.data.origin ?? 'direct') as ServiceRequest['origin'],
                      requester: n.data.requester_name ? { name: n.data.requester_name, name_th: n.data.requester_name_th ?? null } : undefined,
                  },
                  t,
                  lang,
              )
            : // Older bells without a type: the stored title is all there is.
              (n.data.title ?? '');

        return `${n.data.reference} ${written}`;
    }
    // A bulk hand-over or recall names how many, not one machine
    if ((n.data.type === 'asset_assigned' || n.data.type === 'asset_recalled') && n.data.count)
        return t('notif_assets_count_title').replaceAll('{n}', () => formatNumber(n.data.count ?? 0, lang));
    if (n.data.type === 'asset_assigned' || n.data.type === 'asset_return_requested' || n.data.type === 'asset_recalled')
        return `${n.data.asset_model} (${n.data.asset_tag})`;
    // Nothing to name but the reader's own account
    if (n.data.type === 'password_expiring') return t('notif_password_title');
    if (n.data.type === 'sla_holidays') return t('notif_sla_holidays_title').replaceAll('{year}', () => String(n.data.year ?? ''));
    // Named by the report, as the Report Center lists it (rep_<stem>_title)
    if (n.data.type === 'report_export' || n.data.type === 'report_schedule') return t(`rep_${(n.data.report_key ?? '').replace('.', '_')}_title`);
    return `${n.data.employee_name} (${n.data.employee_code})`;
}

/** Message key per service-request subtype (spelled out so an unknown subtype shows nothing, never its key). */
const REQUEST_MESSAGE_KEY: Record<string, string> = {
    submitted: 'notif_request_submitted',
    waiting: 'notif_request_waiting',
    stalled: 'notif_request_stalled',
    ready_to_complete: 'notif_request_ready_manual',
    approved_step: 'notif_request_approved_step',
    approved_final: 'notif_request_approved_final',
    rejected: 'notif_request_rejected',
    completed: 'notif_request_completed',
    not_delivered: 'notif_request_not_delivered',
    cancelled: 'notif_request_cancelled',
    cancelled_for_owner: 'notif_request_cancelled_for_owner',
    blocked_no_account: 'notif_request_blocked_no_account',
    blocked_no_approver: 'notif_request_blocked_no_approver',
};

/** Secondary descriptive line for a notification, already localised. */
export function notificationMessage(n: AppNotification, t: Translate, lang: Lang): string {
    const fmtN = (value: number): string => formatNumber(value, lang);

    // A sample keeps its placeholders' braces: there is no record behind it to fill them from
    if (n.data.type === 'test') return t(n.data.source_key ?? '');
    if (n.data.type === 'contract_expiring') {
        return (n.data.days_remaining ?? 0) <= 0
            ? t('notif_contract_expired').replaceAll('{days}', () => fmtN(Math.abs(n.data.days_remaining ?? 0)))
            : t('notif_contract_expiring').replaceAll('{days}', () => fmtN(n.data.days_remaining ?? 0));
    }
    if (n.data.type === 'password_expiring') return t('notif_password_expiring').replaceAll('{days}', () => fmtN(n.data.days_remaining ?? 0));
    if (n.data.type === 'sla_holidays')
        return t(n.data.subtype === 'started' ? 'notif_sla_holidays_started' : 'notif_sla_holidays_missing').replaceAll('{year}', () =>
            String(n.data.year ?? ''),
        );
    if (n.data.type === 'report_schedule') return t('notif_report_schedule_failed');
    if (n.data.type === 'report_export')
        return t(n.data.subtype === 'failed' ? 'notif_report_export_failed' : 'notif_report_export_ready').replaceAll('{format}', () =>
            (n.data.format ?? '').toUpperCase(),
        );
    if (n.data.type === 'ticket_sla') return t(`notif_ticket_sla_${n.data.subtype}` as Parameters<Translate>[0]);
    if (n.data.type === 'ticket_forwarded') return t('notif_ticket_forwarded').replaceAll('{from}', () => n.data.from ?? '—');
    if (n.data.type === 'ticket_forwarded_away') return t('notif_ticket_forwarded_away').replaceAll('{to}', () => n.data.to ?? '—');
    if (n.data.type === 'ticket_new') return t('notif_ticket_new');
    if (n.data.type === 'ticket_assigned') return t('notif_ticket_assigned');
    if (n.data.type === 'ticket_owner')
        return t(`notif_ticket_owner_${n.data.event}` as Parameters<Translate>[0]).replaceAll('{name}', () => n.data.by ?? '—');
    if (n.data.type === 'stock_alert') return t(`notif_stock_${n.data.subtype}` as Parameters<Translate>[0]);
    // Ready to issue: the sentence leads, the request follows
    if (n.data.type === 'stock_request' && n.data.subtype === 'awaiting_fulfil') {
        return t('notif_stock_req_line')
            .replaceAll('{reference}', () => n.data.reference ?? `#${n.data.stock_request_id}`)
            .replaceAll('{item}', () => n.data.name ?? n.data.sku ?? '—')
            .replaceAll('{qty}', () => fmtN(n.data.qty ?? 0))
            .replaceAll('{requester}', () => localPair(n.data.requester_name, n.data.requester_name_th, lang) ?? '—');
    }
    if (n.data.type === 'stock_request') return t(`notif_stock_req_${n.data.subtype}` as Parameters<Translate>[0]);
    if (n.data.type === 'stock_count') return t('notif_stock_count_draft');
    if (n.data.type === 'request') {
        const key =
            n.data.subtype === 'ready_to_complete' && n.data.ticket_no ? 'notif_request_ready_case' : REQUEST_MESSAGE_KEY[n.data.subtype ?? ''];
        if (!key) return '';

        // A new hire's request says so up front
        const prefix = n.data.origin === 'onboarding' ? `${t('req_origin_onboarding')}: ` : '';

        return (
            prefix +
            t(key)
                .replaceAll('{step}', () => n.data.step_label ?? '—')
                .replaceAll('{actor}', () => n.data.actor_name ?? '—')
                .replaceAll('{remark}', () => n.data.remark ?? '')
                .replaceAll('{ticket}', () => n.data.ticket_no ?? '—')
                .replaceAll('{days}', () => fmtN(n.data.stalled_days ?? 0))
        );
    }
    if (n.data.type === 'asset_assigned' && n.data.count) return t('notif_asset_assigned_many').replaceAll('{n}', () => fmtN(n.data.count ?? 0));
    if (n.data.type === 'asset_assigned') return t('notif_asset_assigned');
    if (n.data.type === 'asset_return_requested') return t('notif_asset_return_requested');
    if (n.data.type === 'asset_recalled' && n.data.count) return t('notif_asset_recalled_many').replaceAll('{n}', () => fmtN(n.data.count ?? 0));
    // A hand-over called off, or a device actually taken back
    if (n.data.type === 'asset_recalled') {
        return t(n.data.subtype === 'taken_back' ? 'notif_asset_recalled_taken_back' : 'notif_asset_recalled_cancelled');
    }
    if (n.data.type === 'asset_offboarding') {
        return t('notif_asset_offboarding').replaceAll('{count}', () => fmtN(n.data.count ?? 0));
    }
    if (n.data.type === 'access_offboarding') {
        return t('notif_access_offboarding')
            .replaceAll('{grants}', () => fmtN(n.data.grants ?? 0))
            .replaceAll('{owned}', () => fmtN(n.data.owned ?? 0))
            .replaceAll('{total}', () => fmtN(n.data.total ?? 0));
    }
    if (n.data.subtype === 'offboarding') return t('notif_resigned');
    if (n.data.subtype === 'departure') return t('notif_departure');

    return t('notif_cred_required');
}

/** SPA route, or a `?…` query opened over the current page, a notification should open when clicked. */
export function notificationTarget(n: AppNotification): string {
    // Straight back to the tab a test was sent from
    if (n.data.type === 'test') return '/email-notifications?tab=notification';
    if (n.data.type?.startsWith('ticket_')) return `/tickets?view=${n.data.ticket_id}`;
    // The reader's own asset list opens in the profile drawer; IT jobs open the Assets module
    if (n.data.type === 'asset_assigned') return PROFILE_ASSETS_SEARCH;
    if (n.data.type === 'asset_return_requested') return '/assets';
    if (n.data.type === 'asset_recalled') return PROFILE_ASSETS_SEARCH;
    if (n.data.type === 'asset_offboarding') return '/assets';
    if (n.data.type === 'access_offboarding') return '/access';
    // The file waits in "ไฟล์ส่งออกของฉัน" on the Report Center
    if (n.data.type === 'report_export' || n.data.type === 'report_schedule') return '/reports';
    // The holiday list of the missing year, in Settings
    if (n.data.type === 'sla_holidays') return `/settings?tab=tickets&holidays=${n.data.year}`;
    const mod = moduleOf(n.data.type, n.data.module);
    // The stuck-request bell opens the person who needs an account
    if (n.data.subtype === 'blocked_no_account' && n.data.employee_id) return `/employees?highlight=${n.data.employee_id}`;
    if (mod === 'requests') return `/requests?view=${n.data.service_request_id}`;
    if (mod === 'contracts') return `/contracts?view=${n.data.contract_id}`;
    if (mod === 'stock') {
        if (n.data.type === 'stock_request') return '/stock?tab=requests';
        if (n.data.type === 'stock_count') return n.data.stock_count_id ? `/stock?tab=audit&count=${n.data.stock_count_id}` : '/stock?tab=audit';
        return '/stock?tab=items';
    }
    return `/employees?highlight=${n.data.employee_id}`;
}
