/**
 * Shared presentation for the assets an employee holds.
 *
 * Both the Employee detail drawer's Assets tab and the Resign modal's outstanding-equipment
 * list draw the same rows, so the status → dot colour + label mapping lives here rather than
 * being copied into each of them.
 */

/** Status → dot colour + i18n label key for the read-only held-assets tables. */
export const HELD_STATUS_META: Record<string, { dot: string; key: string }> = {
    deployed: { dot: 'bg-emerald-500', key: 'emp_v_st_deployed' },
    pending_acceptance: { dot: 'bg-amber-500', key: 'emp_v_st_pending_acceptance' },
    pending_return: { dot: 'bg-amber-500', key: 'emp_v_st_pending_return' },
    ready: { dot: 'bg-emerald-500', key: 'emp_v_st_ready' },
    writeoff: { dot: 'bg-red-500', key: 'emp_v_st_writeoff' },
};
