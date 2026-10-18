// Tab order inside the open narrow-screen menu: wraps around, starts at the first stop when focus is outside.
export function nextFocusIndex(count: number, at: number, backwards: boolean): number {
    if (count === 0) return -1;
    if (at < 0) return 0;
    return (at + (backwards ? -1 : 1) + count) % count;
}
