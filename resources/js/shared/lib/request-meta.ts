import type { ApprovalSkipReason, ServiceRequest, ServiceRequestStatus, ServiceRequestType } from '@/shared/types';
import {
    Archive,
    Cctv,
    Code2,
    FolderOpen,
    HardDrive,
    Laptop,
    Mail,
    MoreHorizontal,
    Phone,
    Share2,
    Smartphone,
    Users,
    Wifi,
    type LucideIcon,
} from 'lucide-react';

/**
 * Presentation vocabulary for the service-request enums — lives beside the types
 * it describes (`ServiceRequestType` / `ServiceRequestStatus` in shared/types)
 * because three modules read it: request, workflow and settings. Keeping it here
 * rather than in one module also stops those modules importing each other in a
 * circle.
 *
 * Icons identify the service everywhere; the colour is reserved for the two
 * places you PICK a service (the dashboard catalog and the New Request wizard)
 * plus the detail header. Lists and tables use the icon in muted grey —
 * repeating eleven hues down a column was noise, and the type name is written on
 * the row anyway.
 *
 * `labelKey` holds the i18n key spelled out (same idea as the Contract form's
 * TYPE_META) rather than composing `req_${type}` at the call site: the keys stay
 * greppable, and a new service type cannot compile until it is given one. A
 * composed key would silently render its own name on screen, because
 * `translate()` falls back to the key when it misses.
 *
 * Key order IS the display order — REQUEST_TYPES below is derived from it, and the Requests
 * filter renders that. It mirrors App\Enums\Request\RequestType case for case; the two are
 * checked against each other by RequestTypeOrderTest, so neither can drift alone.
 */
export const REQUEST_TYPE_META: Record<ServiceRequestType, { icon: LucideIcon; color: string; labelKey: string }> = {
    computer: { icon: Laptop, color: '#2563eb', labelKey: 'req_computer' },
    hardware: { icon: HardDrive, color: '#4f46e5', labelKey: 'req_hardware' },
    mobile: { icon: Smartphone, color: '#0284c7', labelKey: 'req_mobile' },
    email: { icon: Mail, color: '#7c3aed', labelKey: 'req_email' },
    social: { icon: Share2, color: '#db2777', labelKey: 'req_social' },
    fileshare: { icon: FolderOpen, color: '#0d9488', labelKey: 'req_fileshare' },
    software: { icon: Code2, color: '#059669', labelKey: 'req_software' },
    recovery: { icon: Archive, color: '#d97706', labelKey: 'req_recovery' },
    mailgroup: { icon: Users, color: '#7c3aed', labelKey: 'req_mailgroup' },
    telephone: { icon: Phone, color: '#475569', labelKey: 'req_telephone' },
    network: { icon: Wifi, color: '#0891b2', labelKey: 'req_network' },
    cctv: { icon: Cctv, color: '#9333ea', labelKey: 'req_cctv' },
    other: { icon: MoreHorizontal, color: '#64748b', labelKey: 'req_other' },
};

/**
 * Label key per skip reason, spelled out rather than composed from the code — a new
 * reason cannot compile until it is given wording, and `grep req_skip_no_manager`
 * finds where it is used. Same reasoning as REQUEST_TYPE_META's labelKey.
 */
export const REQUEST_SKIP_REASON_LABEL: Record<ApprovalSkipReason, string> = {
    no_manager: 'req_skip_no_manager',
    no_matching_position: 'req_skip_no_matching_position',
    no_department_approver: 'req_skip_no_department_approver',
    no_resource_owner: 'req_skip_no_resource_owner',
    requester_is_owner: 'req_skip_requester_is_owner',
};

/**
 * Wording per reason a submission is refused outright (mirrors
 * App\Enums\Request\ChainBlockReason). The server sends the code as the first
 * `requester` error and an English sentence as the second, so a client that does
 * not translate still says something useful; the SPA prefers the code.
 */
export const REQUEST_BLOCK_REASON_LABEL: Record<string, string> = {
    chain_no_manager: 'req_block_no_manager',
    chain_approver_resigned: 'req_block_approver_resigned',
    workflow_incomplete: 'req_block_workflow_incomplete',
};

/** Badge tone + label key per request status, for the shared StatusBadge. */
export const REQUEST_STATUS_META: Record<ServiceRequestStatus, { tone: 'amber' | 'blue' | 'green' | 'red' | 'gray'; labelKey: string }> = {
    pending: { tone: 'amber', labelKey: 'req_status_pending' },
    approved: { tone: 'blue', labelKey: 'req_status_approved' },
    completed: { tone: 'green', labelKey: 'req_status_completed' },
    rejected: { tone: 'red', labelKey: 'req_status_rejected' },
    cancelled: { tone: 'gray', labelKey: 'req_status_cancelled' },
};

/**
 * True when the request was filed for somebody else — today that means a new
 * employee's onboarding, which every surface an approver looks at marks in violet
 * (the one badge tone no status uses).
 *
 * Reads `origin` rather than "user_id is null" so the reason stays explicit.
 */
export function isOnBehalfRequest(request: Pick<ServiceRequest, 'origin'>): boolean {
    return request.origin === 'onboarding';
}

/** Tone + label for the on-behalf marker, so the badge reads the same everywhere. */
export const REQUEST_ONBOARDING_BADGE = { tone: 'violet' as const, labelKey: 'req_origin_onboarding' };

/**
 * Row tint for an on-behalf request. Tint only: the violet badge already names it,
 * and a third marker (a left edge rule) said the same thing a third time.
 */
export const REQUEST_ONBOARDING_ROW = 'bg-violet-500/[0.05]';

/**
 * How Reject looks everywhere the decision is still being CHOSEN — the queue card, the
 * table row, the detail dialog. Outlined and red, never filled.
 *
 * Filled destructive is kept for the confirm dialog, the one place the decision is
 * actually made (and for deletions, through useConfirm's danger variant). Two filled
 * buttons side by side leave no primary path, and most requests end in an approval.
 */
export const REQUEST_REJECT_BUTTON = 'border-destructive/50 text-destructive hover:bg-destructive/5 hover:text-destructive';

/**
 * And its counterpart: the filled green that means "approve". Spelled out in four places
 * before this, which is how the dashboard card ended up with an outlined Approve while the
 * table and the dialogs had a filled one — the same decision looking like two different
 * weights depending on where you met it.
 */
export const REQUEST_APPROVE_BUTTON = 'bg-emerald-600 text-white hover:bg-emerald-700';

/**
 * The row tint for a new employee's request, or nothing.
 *
 * The tint is for the reader who has to do something: a new hire's request that is
 * waiting on *them*. Once they have decided and it moves to the next approver the
 * tint clears from their list — it was never a permanent property of the request,
 * and a list where every onboarding row stays violet forever stops pointing at
 * anything. The violet badge still says who the request is for, on every row.
 *
 * `can_approve` is the server's word for "this is your step" (see
 * ServiceRequestResource), so the tint follows the real chain position rather
 * than a guess made from the status.
 */
export function onboardingRowClass(request: Pick<ServiceRequest, 'origin' | 'can_approve'>): string | undefined {
    return isOnBehalfRequest(request) && request.can_approve ? REQUEST_ONBOARDING_ROW : undefined;
}

/**
 * What a request is called, written in the READER's language.
 *
 * `title` on the payload is one canonical English string the server composes — it exists
 * for the case subject, the approval emails and the search index, not for the screen.
 * Rendering it put the requester's language in front of everybody else: the same service
 * arrived as "Request: Mail group" or "คำขอ: กลุ่มเมล" depending on who filed it, and an
 * approver reading Thai got English rows from English colleagues.
 *
 * Derived from `type`, which is the only thing the title ever said. An on-behalf request
 * also names the person it is for, because an approver reads the list before the detail.
 */
export function requestTitle(
    request: Pick<ServiceRequest, 'type' | 'origin'> & { requester?: { name: string } },
    t: (key: string) => string,
): string {
    const service = t(REQUEST_TYPE_META[request.type].labelKey);
    const forWhom = request.requester?.name;

    return isOnBehalfRequest(request) && forWhom
        ? t('req_auto_title_for').replace('{service}', service).replace('{name}', forWhom)
        : t('req_auto_title').replace('{service}', service);
}

/** Every service type in catalog order — one place decides the order they appear. */
export const REQUEST_TYPES = Object.keys(REQUEST_TYPE_META) as ServiceRequestType[];

/** Every request status in workflow order (pending first, then how it ended). */
export const REQUEST_STATUSES = Object.keys(REQUEST_STATUS_META) as ServiceRequestStatus[];
