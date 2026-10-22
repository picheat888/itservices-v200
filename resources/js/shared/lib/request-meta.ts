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
import { isOnBehalfRequest, REQUEST_TYPE_LABEL_KEY } from './request-title';

export { isOnBehalfRequest, requestTitle } from './request-title';

/**
 * Presentation vocabulary for the service-request enums, shared by the request, workflow and settings modules.
 * Key order is the display order and mirrors App\Enums\Request\RequestType (RequestTypeOrderTest).
 */
export const REQUEST_TYPE_META: Record<ServiceRequestType, { icon: LucideIcon; color: string; labelKey: string }> = {
    computer: { icon: Laptop, color: '#2563eb', labelKey: REQUEST_TYPE_LABEL_KEY.computer },
    hardware: { icon: HardDrive, color: '#4f46e5', labelKey: REQUEST_TYPE_LABEL_KEY.hardware },
    mobile: { icon: Smartphone, color: '#0284c7', labelKey: REQUEST_TYPE_LABEL_KEY.mobile },
    email: { icon: Mail, color: '#7c3aed', labelKey: REQUEST_TYPE_LABEL_KEY.email },
    social: { icon: Share2, color: '#db2777', labelKey: REQUEST_TYPE_LABEL_KEY.social },
    fileshare: { icon: FolderOpen, color: '#0d9488', labelKey: REQUEST_TYPE_LABEL_KEY.fileshare },
    software: { icon: Code2, color: '#059669', labelKey: REQUEST_TYPE_LABEL_KEY.software },
    recovery: { icon: Archive, color: '#d97706', labelKey: REQUEST_TYPE_LABEL_KEY.recovery },
    mailgroup: { icon: Users, color: '#7c3aed', labelKey: REQUEST_TYPE_LABEL_KEY.mailgroup },
    telephone: { icon: Phone, color: '#475569', labelKey: REQUEST_TYPE_LABEL_KEY.telephone },
    network: { icon: Wifi, color: '#0891b2', labelKey: REQUEST_TYPE_LABEL_KEY.network },
    cctv: { icon: Cctv, color: '#9333ea', labelKey: REQUEST_TYPE_LABEL_KEY.cctv },
    other: { icon: MoreHorizontal, color: '#64748b', labelKey: REQUEST_TYPE_LABEL_KEY.other },
};

/** Label key per skip reason, spelled out so a new reason cannot compile without wording. */
export const REQUEST_SKIP_REASON_LABEL: Record<ApprovalSkipReason, string> = {
    no_manager: 'req_skip_no_manager',
    no_matching_position: 'req_skip_no_matching_position',
    no_department_approver: 'req_skip_no_department_approver',
    no_resource_owner: 'req_skip_no_resource_owner',
    requester_is_owner: 'req_skip_requester_is_owner',
};

/** Wording per reason a submission is refused outright (mirrors App\Enums\Request\ChainBlockReason). */
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

/** Tone + label for the on-behalf marker, so the badge reads the same everywhere. */
export const REQUEST_ONBOARDING_BADGE = { tone: 'violet' as const, labelKey: 'req_origin_onboarding' };

/** Row tint for an on-behalf request, through --row-tint so pinned table cells share it. */
export const REQUEST_ONBOARDING_ROW = 'bg-(--row-tint) [--row-tint:color-mix(in_oklab,var(--color-violet-500)_5%,transparent)]';

/** Reject while the decision is still being chosen: outlined red, never filled. */
export const REQUEST_REJECT_BUTTON = 'border-destructive/50 text-destructive hover:bg-destructive/5 hover:text-destructive';

/** Approve everywhere: filled green. */
export const REQUEST_APPROVE_BUTTON = 'bg-emerald-700 text-white hover:bg-emerald-800';

/** The violet row tint for a new hire's request that is waiting on the reader (`can_approve`), or nothing. */
export function onboardingRowClass(request: Pick<ServiceRequest, 'origin' | 'can_approve'>): string | undefined {
    return isOnBehalfRequest(request) && request.can_approve ? REQUEST_ONBOARDING_ROW : undefined;
}

/** Every service type in catalog order — one place decides the order they appear. */
export const REQUEST_TYPES = Object.keys(REQUEST_TYPE_META) as ServiceRequestType[];

/** Every request status in workflow order (pending first, then how it ended). */
export const REQUEST_STATUSES = Object.keys(REQUEST_STATUS_META) as ServiceRequestStatus[];
