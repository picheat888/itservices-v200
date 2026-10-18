// Whether a live count went up: false on its first load (null → n) and when it drops.
export function countRose(seen: number | null, count: number): boolean {
    return seen !== null && count > seen;
}
