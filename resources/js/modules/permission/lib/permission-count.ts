// A Role Template card spec: how many switches count as on (card headers and section totals), and what one switch takes along when flipped.

/** A view over its children; `fillOnGrant` turns every child on with the view, and the last child off turns the view off. */
export type SpecGroup = { view: string; children: string[]; fillOnGrant?: boolean };

/** A card's switches by where they sit: under the master gate or standing on their own. */
export type CountSpec = {
    /** The module gate; while off, nothing under it counts. */
    master?: string;
    /** Under the master; a child counts only while its view is on. */
    groups?: SpecGroup[];
    /** Under the master with no view of their own (levels, notify, report domains). */
    gated?: string[];
    /** Outside the master; a child counts only while its view is on (Tickets "Open Ticket"). */
    standalone?: SpecGroup[];
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

const countGroups = (groups: SpecGroup[], has: (key: string) => boolean) =>
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

/** The draft after one switch flips: off takes everything under it along, on brings the switches it stands under. */
export function cascadeToggle(prev: Set<string>, key: string, spec: CountSpec): Set<string> {
    const groups = spec.groups ?? [];
    const standalone = spec.standalone ?? [];
    const next = new Set(prev);

    if (next.has(key)) {
        next.delete(key);
        if (key === spec.master) gatedKeys(spec).forEach((k) => next.delete(k));
        [...groups, ...standalone].find((g) => g.view === key)?.children.forEach((c) => next.delete(c));
        // Last child off switches a fill-on-grant view off too
        const owner = groups.find((g) => g.fillOnGrant && g.children.includes(key));
        if (owner && !owner.children.some((c) => next.has(c))) next.delete(owner.view);
        return next;
    }

    next.add(key);
    const parent = groups.find((g) => g.children.includes(key));
    if (parent) next.add(parent.view);
    const group = groups.find((g) => g.view === key);
    if (group?.fillOnGrant) group.children.forEach((c) => next.add(c));
    if (spec.master && (parent || group || (spec.gated ?? []).includes(key))) next.add(spec.master);
    const standaloneParent = standalone.find((g) => g.children.includes(key));
    if (standaloneParent) next.add(standaloneParent.view);
    return next;
}
