// Words for an open approval step nobody can act on: the trail note under the step and the strip under the request's title.
import type { ApprovalBlock, RequestApproval, ServiceRequest } from '@/shared/types';

type BlockedRow = Pick<RequestApproval, 'approver_employee_id' | 'blocked'>;

// Only a group step can be vacant; a named approver who leaves is 'left'
const TRAIL_NOTE: Record<'person' | 'group', Record<ApprovalBlock, string>> = {
    person: { left: 'req_await_left', vacant: 'req_await_group_vacant', no_account: 'req_await_account' },
    group: { left: 'req_await_group_left', vacant: 'req_await_group_vacant', no_account: 'req_await_group_no_account' },
};

const STRIP_LINE: Record<'person' | 'group', Record<ApprovalBlock, string>> = {
    person: { left: 'req_stuck_left', vacant: 'req_stuck_group_vacant', no_account: 'req_stuck_no_account' },
    group: { left: 'req_stuck_group_left', vacant: 'req_stuck_group_vacant', no_account: 'req_stuck_group_no_account' },
};

/** An untaken group step names nobody; every other open step names its one approver. */
const holder = (row: BlockedRow) => (row.approver_employee_id === null ? 'group' : 'person');

/** Lang key of the note under a blocked step in the trail, or null. */
export function blockedNoteKey(row: BlockedRow): string | null {
    return row.blocked ? TRAIL_NOTE[holder(row)][row.blocked] : null;
}

/** Lang key of the strip line for a blocked step, or null. */
export function stuckLineKey(row: BlockedRow): string | null {
    return row.blocked ? STRIP_LINE[holder(row)][row.blocked] : null;
}

/** The step a pending request is stuck on: its current approval step when nobody can act on it. */
export function stuckStep(request: Pick<ServiceRequest, 'status' | 'approvals'>): RequestApproval | null {
    if (request.status !== 'pending') return null;

    return (request.approvals ?? []).find((row) => row.kind === 'approval' && row.status === 'current' && row.blocked !== null) ?? null;
}
