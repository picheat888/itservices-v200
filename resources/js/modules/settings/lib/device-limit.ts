// Pure rule for Settings → Security: whether saving a new device limit must be confirmed first (accounts are trimmed on save).

/** 0 means no limit; the confirm shows when the limit turns on or goes lower. */
export function needsTrimConfirm(before: number, after: number): boolean {
    if (after <= 0) return false;
    return before <= 0 || after < before;
}
