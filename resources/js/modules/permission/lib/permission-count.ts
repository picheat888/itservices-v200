// How many switches a Role Template card counts as on, and out of how many — one rule for the card headers and the section totals.

/** A card's switches by where they sit: under the master gate or standing on their own. */
export type CountSpec = {
    /** The module gate; while off, nothing under it counts. */
    master?: string;
    /** Under the master; a child counts only while its view is on. */
    groups?: { view: string; children: string[] }[];
    /** Under the master with no view of their own (levels, notify, report domains). */
    gated?: string[];
    /** Outside the master; a child counts only while its view is on (Tickets "Open Ticket"). */
    standalone?: { view: string; children: string[] }[];
    /** Outside the master, alone. */
    free?: string[];
};

/** Every key the card shows, master first. */
export function specKeys(spec: CountSpec): string[] {
    return [
        ...(spec.master ? [spec.master] : []),
        ...(spec.groups ?? []).flatMap((g) => [g.view, ...g.children]),
        ...(spec.gated ?? []),
        ...(spec.standalone ?? []).flatMap((g) => [g.view, ...g.children]),
        ...(spec.free ?? []),
    ];
}

/** Keys hidden while the master is off (everything under it but the master itself). */
export function gatedKeys(spec: CountSpec): string[] {
    if (!spec.master) return [];
    return [...(spec.groups ?? []).flatMap((g) => [g.view, ...g.children]), ...(spec.gated ?? [])];
}

const countGroups = (groups: { view: string; children: string[] }[], has: (key: string) => boolean) =>
    groups.reduce((sum, g) => (has(g.view) ? sum + 1 + g.children.filter(has).length : sum), 0);

/** On = held keys whose ancestors are on too; total = every key the card shows. */
export function countGranted(spec: CountSpec, has: (key: string) => boolean): { on: number; total: number } {
    const masterOn = spec.master === undefined || has(spec.master);
    const underMaster = masterOn ? (spec.master ? 1 : 0) + countGroups(spec.groups ?? [], has) + (spec.gated ?? []).filter(has).length : 0;
    const outside = countGroups(spec.standalone ?? [], has) + (spec.free ?? []).filter(has).length;

    return { on: underMaster + outside, total: specKeys(spec).length };
}

/** Search hits the card hides because its master is off (0 while the master is on). */
export function hiddenHitCount(spec: CountSpec, has: (key: string) => boolean, isHit: (key: string) => boolean): number {
    if (!spec.master || has(spec.master)) return 0;
    return gatedKeys(spec).filter(isHit).length;
}
