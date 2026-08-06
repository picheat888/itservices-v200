import type { Dict } from '@/lang/types';

/**
 * Workflow module (approval chain definitions, admin) — English strings.
 */
export const workflow: Dict = {
    wf_title: 'Workflows',
    wf_sub: 'Adjust the approval route of each request type — who signs off, and in what order.',
    wf_coming_soon: 'Coming soon',

    wf_kpi_active: 'Active workflows',
    wf_kpi_active_sub: 'request types covered',
    wf_kpi_steps: 'Approval steps',
    wf_kpi_steps_sub: 'up to',
    wf_kpi_steps_sub_tail: 'approvals per request',
    // Measured from the requests themselves — a workflow declares no target.
    wf_kpi_decision: 'Avg. decision time',
    wf_kpi_decision_window: 'last {days} days',
    wf_kpi_decision_requests: 'requests',
    wf_kpi_decision_none: 'nothing decided in the last {days} days',
    wf_row_decision: 'decided in',
    wf_days_suffix: 'd',
    wf_kpi_auto: 'Auto-ticket on',
    wf_kpi_auto_sub: 'opens an IT ticket on approval',

    wf_search_ph: 'Search workflows…',
    wf_search_hint: 'Steps resolve against each requester’s reporting line at submit time.',
    wf_no_match: 'No workflows match',
    wf_view: 'View',
    wf_edit: 'Edit',
    wf_active: 'Active',
    wf_inactive: 'Inactive',
    wf_auto_ticket: 'Auto ticket',
    wf_no_auto_ticket: 'No auto ticket',
    wf_applies_to: 'Applies to',
    wf_steps: 'Steps',
    wf_status: 'Status',
    wf_approval: 'Approval',
    wf_fulfillment: 'Fulfillment',
    wf_submitted: 'Submitted',
    wf_closed: 'Closed',
    wf_chain_title: 'Approval chain',
    wf_step_detail: 'Step detail',
    wf_auto_ticket_footnote: 'An IT ticket is opened automatically after the final approval.',

    // Editor
    wf_editor_eyebrow: 'Edit workflow',
    wf_auto_ticket_hint: 'Opens an IT ticket after the final approval',
    wf_add_step: 'Add step',
    wf_step_actor: 'Acts on the step',
    wf_step_label: 'Display label',
    wf_step_kind: 'Step type',
    wf_step_positions: 'Positions that may approve',
    wf_step_positions_required: 'Pick at least one position — a step naming none can never resolve.',
    wf_actor_chain: 'Reporting line',
    wf_actor_owner: 'Resource owner',
    wf_actor_it: 'IT Staff',
    wf_preview_title: 'Preview',
    wf_test_with: 'Test with:',
    wf_resolve_title: 'Resolves along the reporting line',
    wf_resolve_hint:
        'Chain steps resolve to the requester’s actual managers. A short line lets one manager cover several steps; owner steps resolve from the picked resource at submit.',
    wf_requester: 'Requester',
    wf_skipped: 'skipped',
    wf_covers: 'Covers',
    wf_owner_preview: 'Resolved from the picked resource at submit',
    wf_queue_preview: 'IT fulfillment queue · auto-opened ticket',
    wf_save_error_steps: 'Check the step list',
};
