// Whether a live count went up: false on its first load (null → n) and when it drops.
export function countRose(seen: number | null, count: number): boolean {
    return seen !== null && count > seen;
}

/** A late count fades in quietly when it first lands, and pops each time it rises (key the element by its rises). */
export function badgeMotion(rises: number): string {
    return rises > 0 ? 'badge-pop' : 'motion-pop-in';
}
