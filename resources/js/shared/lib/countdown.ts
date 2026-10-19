// Countdown maths shared by the idle warning and the error dialogs: clock text, seconds left, ring fill.

export function clock(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Whole seconds until endsAt, rounded up, never below zero. */
export function secondsLeft(endsAt: number, now: number): number {
    return Math.max(0, Math.ceil((endsAt - now) / 1_000));
}

/** 0 when all the time is left, 1 when none is; 1 when there is no total. */
export function elapsedShare(left: number, total: number): number {
    return total > 0 ? Math.max(0, Math.min(1, (total - left) / total)) : 1;
}
