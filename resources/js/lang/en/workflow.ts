import type { Dict } from '@/lang/types';

/**
 * Workflow module (approval chain definitions, admin) — English strings.
 */
export const workflow: Dict = {
    wf_title: 'Workflows',
    wf_sub: 'Set who approves each request type, and in what order.',

    // pages/index.tsx — KPI cards
    wf_kpi_active: 'Active workflows',
    wf_kpi_active_sub: 'of {n} request types',
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
    wf_kpi_auto: 'Auto ticket on',
    wf_kpi_auto_sub: 'opens an IT ticket on approval',

    // pages/index.tsx — search + workflow cards
    wf_search_ph: 'Search name, request type or step…',
    wf_search_hint: "Approvers come from the requester's real reporting line when they submit.",
    wf_no_match: 'No workflows match',
    wf_view: 'View',
    wf_edit: 'Edit',
    wf_active: 'Active',
    wf_inactive: 'Inactive',
    wf_auto_ticket: 'Auto ticket',
    wf_applies_to: 'Applies to',
    wf_steps: 'Steps',

    // workflow-strip.tsx — stage strip
    wf_approval: 'Approver',
    wf_completion: 'Completion',
    wf_completion_role: 'Completion after the last approval',
    wf_submitted: 'Submitted',
    wf_closed: 'Done',

    // workflow-view-dialog.tsx — view dialog
    wf_chain_title: 'Approval chain',
    wf_step_detail: 'Step detail',

    // workflow-editor-dialog.tsx — editor
    wf_editor_eyebrow: 'Edit workflow',
    wf_name: 'Workflow name',
    wf_name_required: 'Give the workflow a name',
    wf_auto_ticket_hint: 'Opens an IT ticket after the final approval',
    wf_add_step: 'Add step',
    wf_step_label: 'Step name',
    wf_step_type: 'Step type',
    wf_step_move_up: 'Move step {n} up',
    wf_step_move_down: 'Move step {n} down',
    wf_step_remove: 'Remove step {n}',
    wf_step_positions: 'Approved by',
    wf_step_positions_required: "Pick at least one position, or this step can't find an approver.",
    wf_ranks_edit: 'Change',
    wf_ranks_done: 'Done',
    wf_actor_chain: 'Reporting line',
    wf_actor_department: 'Specific department',
    wf_steps_count: '{n} approvals',
    wf_step_skip_note_chain: 'Skipped if nobody above the requester holds one of these',
    wf_step_skip_note_department: 'Skipped if that department has nobody in these positions',
    wf_step_department: 'Department',
    wf_step_department_pick: 'Choose a department',
    wf_step_department_required: 'Choose the department that approves this step.',
    wf_step_who: 'Who approves',
    wf_step_by_positions: 'Anyone in these positions',
    wf_step_by_person: 'Specific people',
    wf_step_person_add: 'Add a person',
    wf_step_person_remove: 'Remove',
    wf_step_people_note: 'Any one of them can approve. Not everyone has to.',
    wf_step_person_required: 'Add at least one person who can approve this step.',
    wf_step_department_empty: 'Nobody works in that department yet. Use positions for now, or pick people once someone joins.',
    wf_any_of_preview: 'Whoever approves first',
    wf_actor_owner: 'Resource owner',
    wf_actor_it: 'IT Staff',
    wf_preset_supervisor_head: 'Supervisor / Head',
    wf_preset_manager_asst: 'Manager / Asst. Manager',
    wf_preset_department_manager: 'Department Manager',
    wf_preset_vice_president: 'Vice President',
    wf_test_with: 'Test with:',
    wf_preview_loading: 'Finding the approvers…',
    wf_preview_error: 'Could not test the route. Pick the employee again.',
    wf_resolve_title: 'Try it on a real reporting line',
    wf_resolve_hint:
        "Each step goes up the requester's reporting line until it finds someone in the positions you picked. If nobody fits, the step is skipped. Owner steps find their person when the requester picks a resource.",
    wf_skipped: 'skipped',
    wf_covers: 'Standing in for',
    wf_owner_preview: 'Known once the requester picks a resource',
    wf_queue_preview: 'Goes to the IT queue, which opens a ticket automatically',
    wf_save_error_steps: 'Could not save. Check the steps.',

    // empty states — การ์ดและตารางที่ไม่มีข้อมูล
    wf_empty_list: 'No workflows yet',
    wf_empty_list_hint: 'Standard workflows are created at install.',
    wf_empty_list_search: 'No workflow matches',
    wf_empty_list_search_hint: 'Try other words.',
};
