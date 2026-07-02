import type { OrgChartNode } from '@/shared/types';
import * as dagre from '@dagrejs/dagre';
import type { Node } from '@xyflow/react';

/** Fixed node box used for both rendering and dagre layout. */
export const NODE_W = 244;
export const NODE_H = 104;

/** Chart orientation: top-to-bottom or left-to-right. */
export type OrgDir = 'TB' | 'LR';

/** Data carried by each React Flow node (the record + UI state + callbacks). */
export type OrgNodeData = OrgChartNode & {
    collapsed: boolean;
    hasReports: boolean;
    isRoot: boolean;
    selected: boolean;
    dimmed: boolean;
    dir: OrgDir;
    color: string;
    onToggle: (id: number) => void;
    onFocus: (id: number) => void;
    [key: string]: unknown;
};

export type OrgFlowNode = Node<OrgNodeData, 'orgNode'>;

// Per-department hue (OKLCH) — a harmonious accent set keyed by the
// department code, mirroring the approved design. Unknown codes fall back to a
// stable hash so any department still gets a consistent colour.
const DEPT_HUE: Record<string, number> = {
    OPS: 255, PRD: 150, QA: 305, FIN: 185, LOG: 70,
    HR: 25, IT: 230, SAL: 340, ENG: 115, RND: 200,
};

/** Stable hue (0–360) derived from a string, for departments not in DEPT_HUE. */
function hashHue(key: string): number {
    let h = 0;
    for (let i = 0; i < key.length; i++) {
        h = (h * 31 + key.charCodeAt(i)) % 360;
    }
    return h;
}

/**
 * Accent colour for a department code. Fixed lightness/chroma, hue varies — so
 * every department reads as a distinct but harmonious accent. `null`/unknown
 * keys still resolve to a deterministic colour.
 */
export function deptColor(code: string | null, l = 0.6, c = 0.14): string {
    if (!code) {
        return `oklch(${l} 0.03 250)`;
    }
    const hue = DEPT_HUE[code] ?? hashHue(code);
    return `oklch(${l} ${c} ${hue})`;
}

/**
 * Index children by their manager id. A node whose manager_id is null, or
 * points to someone outside the active set, is filed under the `null` key —
 * those are the forest roots.
 */
export function buildChildrenIndex(nodes: OrgChartNode[]): Map<number | null, OrgChartNode[]> {
    const ids = new Set(nodes.map((n) => n.id));
    const index = new Map<number | null, OrgChartNode[]>();
    for (const n of nodes) {
        const key = n.manager_id != null && ids.has(n.manager_id) ? n.manager_id : null;
        let arr = index.get(key);
        if (!arr) {
            arr = [];
            index.set(key, arr);
        }
        arr.push(n);
    }
    return index;
}

/** The forest roots — employees with no (active) manager. */
export function rootIds(nodes: OrgChartNode[]): Set<number> {
    return new Set((buildChildrenIndex(nodes).get(null) ?? []).map((n) => n.id));
}

/**
 * Walk the forest from the roots, skipping the subtrees of collapsed nodes.
 * Returns the visible ids, the parent→child edges, and the deepest level
 * reached (1-based count of tiers among the visible nodes).
 */
export function visibleGraph(
    nodes: OrgChartNode[],
    collapsed: Set<number>,
): { visibleIds: Set<number>; edges: { source: number; target: number }[]; levels: number } {
    const index = buildChildrenIndex(nodes);
    const visibleIds = new Set<number>();
    const edges: { source: number; target: number }[] = [];
    const seen = new Set<number>();
    let maxDepth = 0;

    // `seen` guards against malformed manager_id data forming a cycle, which
    // would otherwise recurse forever and hang the browser.
    const walk = (n: OrgChartNode, depth: number) => {
        if (seen.has(n.id)) {
            return;
        }
        seen.add(n.id);
        visibleIds.add(n.id);
        maxDepth = Math.max(maxDepth, depth);
        if (collapsed.has(n.id)) {
            return;
        }
        for (const child of index.get(n.id) ?? []) {
            edges.push({ source: n.id, target: child.id });
            walk(child, depth + 1);
        }
    };
    (index.get(null) ?? []).forEach((root) => walk(root, 0));

    return { visibleIds, edges, levels: visibleIds.size ? maxDepth + 1 : 0 };
}

/** Every node id that has at least one (active) direct report. */
export function nodesWithReports(nodes: OrgChartNode[]): Set<number> {
    const index = buildChildrenIndex(nodes);
    const result = new Set<number>();
    for (const [managerId, children] of index) {
        if (managerId != null && children.length > 0) {
            result.add(managerId);
        }
    }
    return result;
}

/**
 * Compute stable dagre positions for a set of nodes, keyed by numeric id.
 * Lay out the FULL tree once (pass every id + every parent→child edge) so node
 * positions stay fixed — collapsing a branch then just hides nodes and leaves a
 * gap instead of re-packing the siblings left/right. `dir`: 'TB' or 'LR'.
 */
export function layoutPositions(
    ids: number[],
    edges: { source: number; target: number }[],
    dir: OrgDir = 'TB',
): Map<number, { x: number; y: number }> {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: dir, nodesep: dir === 'TB' ? 36 : 24, ranksep: dir === 'TB' ? 84 : 110 });
    g.setDefaultEdgeLabel(() => ({}));

    ids.forEach((id) => g.setNode(String(id), { width: NODE_W, height: NODE_H }));
    edges.forEach((e) => g.setEdge(String(e.source), String(e.target)));
    dagre.layout(g);

    const positions = new Map<number, { x: number; y: number }>();
    ids.forEach((id) => {
        const p = g.node(String(id));
        positions.set(id, { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 });
    });
    return positions;
}
