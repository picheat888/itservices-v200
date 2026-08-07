import type { ApprovalSkipReason, ServiceRequest, ServiceRequestStatus, ServiceRequestType } from '@/shared/types';
import { Archive, Code2, FolderOpen, HardDrive, Laptop, Mail, MoreHorizontal, Phone, Share2, Smartphone, Users, type LucideIcon } from 'lucide-react';

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
 */
export const REQUEST_TYPE_META: Record<ServiceRequestType, { icon: LucideIcon; color: string; labelKey: string }> = {
    computer: { icon: Laptop, color: '#2563eb', labelKey: 'req_computer' },
    hardware: { icon: HardDrive, color: '#4f46e5', labelKey: 'req_hardware' },
    mobile: { icon: Smartphone, color: '#0284c7', labelKey: 'req_mobile' },
    email: { icon: Mail, color: '#7c3aed', labelKey: 'req_email' },
    social: { icon: Share2, color: '#db2777', labelKey: 'req_social' },
    fileshare: { icon: FolderOpen, color: '#0d9488', labelKey: 'req_fileshare' },
    mailgroup: { icon: Users, color: '#7c3aed', labelKey: 'req_mailgroup' },
    software: { icon: Code2, color: '#059669', labelKey: 'req_software' },
    recovery: { icon: Archive, color: '#d97706', labelKey: 'req_recovery' },
    telephone: { icon: Phone, color: '#475569', labelKey: 'req_telephone' },
    other: { icon: MoreHorizontal, color: '#64748b', labelKey: 'req_other' },
};

/**
 * Label key per skip reason, spelled out rather than composed from the code — a new
 * reason cannot compile until it is given wording, and `grep req_skip_no_manager`
 * finds where it is used. Same reasoning as REQUEST_TYPE_META's labelKey.
 */
export const REQUEST_SKIP_REASON_LABEL: Record<ApprovalSkipReason, string> = {
    no_manager: 'req_skip_no_manager',
    no_resource_owner: 'req_skip_no_resource_owner',
    requester_is_owner: 'req_skip_requester_is_owner',
};

/** Badge tone + label key per request status, for the shared StatusBadge. */
export const REQUEST_STATUS_META: Record<ServiceRequestStatus, { tone: 'amber' | 'blue' | 'green' | 'red' | 'gray'; labelKey: string }> = {
    pending: { tone: 'amber', labelKey: 'req_status_pending' },
    approved: { tone: 'blue', labelKey: 'req_status_approved' },
    fulfilled: { tone: 'green', labelKey: 'req_status_fulfilled' },
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

/** Every service type in catalog order — one place decides the order they appear. */
export const REQUEST_TYPES = Object.keys(REQUEST_TYPE_META) as ServiceRequestType[];

/** Every request status in workflow order (pending first, then how it ended). */
export const REQUEST_STATUSES = Object.keys(REQUEST_STATUS_META) as ServiceRequestStatus[];
