import type { Dict } from '@/lang/types';

/**
 * Workflow module (approval chain definitions, admin) — English strings.
 */
export const workflow: Dict = {
    wf_title: 'Workflows',
    wf_sub: 'Adjust the approval route of each request type - who signs off, and in what order.',
    wf_coming_soon: 'Coming soon',

    // pages/index.tsx — KPI cards
    wf_kpi_active: 'Active workflows',
    wf_kpi_active_sub: 'request types covered',
    wf_kpi_steps: 'Approval steps',
    wf_kpi_steps_sub: 'up to',
    wf_kpi_steps_sub_tail: 'approvals per request',
    wf_kpi_decision: 'Avg. decision time',
    wf_kpi_decision_window: 'last {days} days',
    wf_kpi_decision_requests: 'requests',
    wf_kpi_decision_none: 'nothing decided in the last {days} days',
    wf_row_decision: 'decided in',
    wf_cell_decision: 'Avg. decision time (last {days} days)',
    wf_days_suffix: 'd',
    wf_kpi_auto: 'Auto-ticket on',
    wf_kpi_auto_sub: 'opens an IT ticket on approval',

    // pages/index.tsx — search + workflow cards
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

    // workflow-strip.tsx — stage strip
    wf_approval: 'Approver',
    wf_fulfillment: 'Fulfiller',
    wf_fulfillment_role: 'Fulfiller, after the last approval',
    wf_submitted: 'Submitted',
    wf_closed: 'Closed',

    // workflow-view-dialog.tsx — view dialog
    wf_chain_title: 'Approval chain',
    wf_step_detail: 'Step detail',

    // workflow-editor-dialog.tsx — editor
    wf_editor_eyebrow: 'Edit workflow',
    wf_name: 'Workflow name',
    wf_auto_ticket_hint: 'Opens an IT ticket after the final approval',
    wf_add_step: 'Add step',
    wf_step_label: 'Display label',
    wf_step_positions: 'Approved by',
    wf_step_positions_required: 'No position chosen - this step can never resolve.',
    wf_ranks_edit: 'Change',
    wf_ranks_done: 'Done',
    wf_actor_chain: 'Reporting line',
    wf_actor_department: 'A department',
    wf_steps_count: '{n} approvals',
    wf_step_skip_note_chain: 'Skipped when nobody above the requester holds one',
    wf_step_skip_note_department: 'Skipped when that department has nobody at these',
    wf_step_department: 'Department',
    wf_step_department_pick: 'Choose a department',
    wf_step_department_required: 'Choose the department that approves this step.',
    wf_step_who: 'Signed by',
    wf_step_by_positions: 'Anyone at these positions',
    wf_step_by_person: 'One named person',
    wf_step_person_pick: 'Choose a person',
    wf_actor_owner: 'Resource owner',
    wf_actor_it: 'IT Staff',
    wf_test_with: 'Test with:',
    wf_resolve_title: 'Resolves along the reporting line',
    wf_resolve_hint:
        'Each step climbs the requester’s reporting line for someone holding the positions it names. A step nobody in the line holds is skipped; owner steps resolve from the picked resource at submit.',
    wf_requester: 'Requester',
    wf_skipped: 'skipped',
    wf_covers: 'Covers',
    wf_owner_preview: 'Resolved from the picked resource at submit',
    wf_queue_preview: 'IT fulfillment queue · auto-opened ticket',
    wf_save_error_steps: 'Check the step list',
};
