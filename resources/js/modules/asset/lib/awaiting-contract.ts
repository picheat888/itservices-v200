// Rules for a rented asset that has no contract yet: the status filter value, the badge test, and when the form insists on a contract.
import type { AssetStatus } from '@/shared/types';

/** Status-filter value for rented assets still waiting to be linked to a contract. */
export const AWAITING_CONTRACT = 'awaiting_contract';

const ASSET_STATUS_VALUES: readonly string[] = ['ready', 'pending_acceptance', 'deployed', 'common', 'pending_return', 'writeoff'];

/** The status-filter value for a ?status= param: a real status, the awaiting-contract shortcut, or '' for anything else. */
export function statusFilterValue(param: string | null): AssetStatus | typeof AWAITING_CONTRACT | '' {
    if (param === AWAITING_CONTRACT) return AWAITING_CONTRACT;
    return param !== null && ASSET_STATUS_VALUES.includes(param) ? (param as AssetStatus) : '';
}

/** A rented asset with no contract that is not written off. */
export function isAwaitingContract(a: { source: string; contract_id: number | null; status: string }): boolean {
    return a.source === 'rented' && a.contract_id == null && a.status !== 'writeoff';
}

/** The form asks for a contract only when editing a rental that already has one (it can switch, not drop). */
export function contractRequired(editing: { contract_id: number | null } | null, rented: boolean): boolean {
    return rented && editing != null && editing.contract_id != null;
}
