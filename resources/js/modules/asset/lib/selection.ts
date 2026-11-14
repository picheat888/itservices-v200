// Multi-select rules of the asset list: which bulk action a status offers, and the status group a selection is locked to.
import type { AssetStatus } from '@/shared/types';

export type BulkAction = 'transfer' | 'recall' | 'force_recall' | 'receive' | 'relocate' | 'writeoff' | 'link_contract';

export interface BulkPermissions {
    transfer: boolean;
    receive: boolean;
    forceRecall: boolean;
    edit: boolean;
    retire: boolean;
    /** True while the list shows rented assets without a contract to a viewer who may edit; every row there can be linked. */
    linkContract: boolean;
}

/** The bulk action a status offers this viewer; null when its rows cannot be ticked at all. */
export function bulkActionFor(status: AssetStatus | null, can: BulkPermissions): BulkAction | null {
    const action = statusAction(status, can);
    if (action) return action;
    return can.linkContract && status !== null && status !== 'writeoff' ? 'link_contract' : null;
}

/** A row's checkbox works when its status offers an action and matches the group a selection is locked to. */
export function canTickRow(status: AssetStatus, locked: AssetStatus | null, can: BulkPermissions): boolean {
    return bulkActionFor(status, can) !== null && (locked === null || status === locked);
}

/** False once the locked group's status offers no action (the link filter was removed), so the selection is dropped. */
export function selectionStillValid(locked: AssetStatus | null, can: BulkPermissions): boolean {
    return locked === null || bulkActionFor(locked, can) !== null;
}

/** True when something is ticked and every ticked asset is a rented one with no contract. */
export function allFreeRentals(ids: readonly number[], free: Readonly<Record<number, boolean>>): boolean {
    return ids.length > 0 && ids.every((id) => free[id] === true);
}

function statusAction(status: AssetStatus | null, can: BulkPermissions): BulkAction | null {
    switch (status) {
        case 'ready':
            return can.transfer ? 'transfer' : can.retire ? 'writeoff' : null;
        case 'pending_acceptance':
            return can.transfer || can.forceRecall ? 'recall' : null;
        // An asset in use can always have its location corrected (assets.edit) when it cannot be recalled.
        case 'common':
            return can.transfer || can.forceRecall ? 'recall' : can.edit ? 'relocate' : null;
        case 'deployed':
            return can.forceRecall ? 'force_recall' : can.edit ? 'relocate' : null;
        case 'pending_return':
            return can.receive ? 'receive' : null;
        default:
            return null;
    }
}

/** Ticks or unticks a page's rows of one status group; the lock stays while any ticked row remains. */
export function toggleGroup(
    selectedIds: readonly number[],
    groupIds: readonly number[],
    on: boolean,
    lockedStatus: AssetStatus | null,
    groupStatus: AssetStatus,
): { ids: number[]; status: AssetStatus | null } {
    if (on) return { ids: [...new Set([...selectedIds, ...groupIds])], status: lockedStatus ?? groupStatus };
    const ids = selectedIds.filter((id) => !groupIds.includes(id));
    return { ids, status: ids.length > 0 ? lockedStatus : null };
}
