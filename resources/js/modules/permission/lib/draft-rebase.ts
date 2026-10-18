// Moves an unsaved Role Template draft onto a newer stored set: the reader's own adds and removals replay on top of it.
import type { CountSpec } from './permission-count';

/** A switch that only stands while `parent` is on. */
export type PermissionEdge = { parent: string; child: string };

/** Parent → child pairs a card enforces: the master over everything under it, each view over its children. */
export function specEdges(spec: CountSpec): PermissionEdge[] {
    const edges: PermissionEdge[] = [];
    for (const group of [...(spec.groups ?? []), ...(spec.standalone ?? [])]) {
        for (const child of group.children) edges.push({ parent: group.view, child });
    }
    if (spec.master) {
        const under = [...(spec.groups ?? []).flatMap((g) => [g.view, ...g.children]), ...(spec.gated ?? [])];
        for (const child of under) edges.push({ parent: spec.master, child });
    }
    return edges;
}

/** (stored ∪ added) − removed, where added/removed are the draft's changes from the set it was seeded with. */
export function rebaseDraft(draft: Set<string>, seed: Set<string>, stored: Set<string>, edges: PermissionEdge[]): Set<string> {
    const added = [...draft].filter((key) => !seed.has(key));
    const removed = new Set([...seed].filter((key) => !draft.has(key)));

    const next = new Set(stored);
    for (const key of added) next.add(key);
    for (const key of removed) next.delete(key);

    // A switch the reader turned on brings its parents, as its toggle does
    for (const key of added) {
        for (const edge of edges) {
            if (edge.child === key && !removed.has(edge.parent)) next.add(edge.parent);
        }
    }

    // A child whose parent is off goes, as the server's normalisers do
    let pruned = true;
    while (pruned) {
        pruned = false;
        for (const edge of edges) {
            if (next.has(edge.child) && !next.has(edge.parent)) {
                next.delete(edge.child);
                pruned = true;
            }
        }
    }
    return next;
}
