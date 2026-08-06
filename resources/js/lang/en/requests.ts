import type { Dict } from '@/lang/types';

/**
 * Request module (IT service requests) — English strings.
 * The per-enum keys (req_<type>, req_status_<status>) are reached through the
 * registries in shared/lib/request-meta, which name each key literally. Do not
 * compose them at the call site: `translate()` falls back to the key it was
 * given, so a missing one would print itself on screen.
 */
export const requests: Dict = {
    // Service types
    req_computer: 'Computer',
    req_hardware: 'Hardware / peripheral',
    req_mobile: 'Mobile device',
    req_email: 'Email account',
    req_social: 'Social media access',
    req_fileshare: 'File share access',
    req_mailgroup: 'Mail group',
    req_software: 'Software install',
    req_recovery: 'Data recovery',
    req_telephone: 'Telephone',
    req_other: 'Other request',

    // Page chrome
    requests_title: 'Requests',
    requests_sub: 'Submit IT service requests and track every approval step.',
    requests_new: 'New request',
    requests_tab_dashboard: 'Dashboard',
    requests_tab_all: 'All requests',
    requests_tab_approvals: 'Awaiting my approval',

    // KPI cards
    req_kpi_awaiting: 'Awaiting your approval',
    req_kpi_awaiting_of: 'of all pending:',
    req_kpi_approved: 'Approved',
    req_kpi_rejected: 'Rejected',
    req_kpi_cycle: 'Avg. decision time',
    req_kpi_cycle_sub: 'submitted to final decision',
    req_kpi_days_suffix: 'd',

    // Dashboard tab
    req_queue_title: 'Needs your decision',
    req_queue_empty: 'Nothing is waiting on you',
    req_queue_empty_sub: 'Every request that needed your approval has been decided.',
    req_recent_empty: 'No requests yet — start one with New request.',
    req_view_all: 'View all',
    req_catalog_approval_one: 'approval',
    req_catalog_approval_many: 'approvals',
    req_recent_title: 'Recent activity',
    req_inactive: 'Not accepting submissions',

    // Table
    req_col_title: 'Title',
    req_col_requester: 'Requester',
    req_col_workflow: 'Workflow',
    req_col_status: 'Status',
    req_search_ph: 'Search requests…',
    req_filter_status: 'Status',
    req_filter_type: 'Service',
    req_age_today: 'today',
    req_age_days: 'd',

    // Statuses
    req_status_pending: 'Pending',
    req_status_approved: 'Approved',
    req_status_rejected: 'Rejected',
    req_status_fulfilled: 'Fulfilled',
    req_status_cancelled: 'Cancelled',

    // Actions
    req_approve: 'Approve',
    req_reject: 'Reject',
    req_fulfill: 'Mark fulfilled',
    req_cancel_request: 'Cancel request',

    // Create wizard
    req_new_eyebrow: 'New request',
    req_select_placeholder: 'Select…',
    req_bad_email: 'Enter a valid email address',
    req_new_title: 'Open an IT service request',
    req_step_service: 'Pick service',
    req_step_details: 'Fill details',
    req_step_review: 'Review & submit',
    req_pick_title: 'Which service are you requesting?',
    req_pick_sub: 'Each service request needs different information.',
    req_route_title: 'Approval',
    req_details_title: 'Request detail',
    req_details_sub: 'A clear title and reason help approvers decide faster.',
    req_section_general: 'The request',
    /** Stored title, built for the requester — {service} is the service name. */
    req_auto_title: 'Request: {service}',
    req_field_reason: 'Reason / details',
    req_field_reason_ph: 'Explain why this is needed — approvers decide faster with context.',
    req_requester_label: 'Requester',
    req_service_section: 'Service details',
    req_other_software: 'Not on the list — enter it myself',
    req_review_title: 'Review & submit',
    req_review_sub: 'Check everything once — the request routes to the first approver as soon as you submit.',
    req_auto_ticket_note: 'An IT ticket opens automatically after the final approval.',
    req_submit: 'Submit request',
    req_submitted: 'Request submitted',
    req_awaiting_first: 'awaiting the first approver',
    req_no_employee_hint: 'Your account is not linked to an employee record. Contact IT to link it before submitting.',

    // Detail dialog
    req_detail_eyebrow: 'Service request',
    req_reason_label: 'Reason',
    req_requester: 'Requester',
    req_department: 'Department',
    req_created: 'Submitted',
    // On-behalf (onboarding) marking — shown wherever an approver meets the request.
    req_origin_onboarding: 'New employee',
    req_submitted_by: 'Filed by',
    req_await_account: 'Waiting - this approver has no login account yet',
    req_skip_no_manager: 'Skipped - the requester has no manager configured',
    req_skip_no_resource_owner: 'Skipped - this resource has no owner who can approve',
    req_skip_requester_is_owner: 'Skipped - the requester owns this resource',
    req_onboarding_title: 'Request for a new employee',
    req_onboarding_desc: 'Filed with the new employee record, before they had an account of their own.',
    req_trail_title: 'Approval trail',
    req_trail_submitted: 'Submitted',
    req_trail_fulfillment: 'Admin / IT Staff fulfillment',
    req_trail_approved: 'approved',
    req_trail_rejected: 'rejected',
    req_trail_waiting: 'waiting · notified by Bell + Email',
    req_trail_queued: 'not reached yet',
    req_trail_skipped: 'skipped',
    req_trail_after_approvals: 'after all approvals',
    req_trail_fulfilled_done: 'done · requester notified',
    req_trail_ticket_opened: 'ticket opened automatically',
    req_linked_ticket: 'Linked ticket',
    req_no_ticket: 'No ticket — this workflow closes without one.',
    req_ticket_auto_hint: 'Auto-opened on final approval — assigned to the IT team.',

    // Decision dialog
    req_decide_approve: 'Approve request',
    req_decide_reject: 'Reject request',
    req_decide_note: 'Remark / note',
    req_decide_note_required: 'A remark is required when rejecting',
    req_decide_note_ph_approve: 'Optional note for the next approver',
    req_decide_note_ph_reject: 'Why it is rejected — sent back to the requester',
    req_decide_notify_reject: 'Notifies the requester via Bell + Email, then closes the request.',
    req_decide_notify_final: 'Final approval — notifies the requester and IT via Bell + Email.',
    req_decide_notify_next: 'Notifies the next approver via Bell + Email:',
    req_fulfill_title: 'Mark as fulfilled',
    req_fulfill_hint: 'Confirms the work is done and notifies the requester.',
    req_cancel_title: 'Cancel this request?',
    req_cancel_hint: 'The waiting approver is notified and the request closes.',
};
