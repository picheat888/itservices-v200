import type { OrgChartNode } from '@/types';
import * as dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';

/** Fixed node box used for both rendering and dagre layout. */
export const NODE_W = 210;
export const NODE_H = 104;

/** Data carried by each React Flow node (the record + UI state + callbacks). */
export type OrgNodeData = OrgChartNode & {
    collapsed: boolean;
    hasReports: boolean;
    highlighted: boolean;
    onToggle: (id: number) => void;
    onFocus: (id: number) => void;
    [key: string]: unknown;
};

export type OrgFlowNode = Node<OrgNodeData, 'orgNode'>;

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

/**
 * Walk the forest from the roots, skipping the subtrees of collapsed nodes.
 * Returns the set of visible ids and the parent→child edges between them.
 */
export function visibleGraph(
    nodes: OrgChartNode[],
    collapsed: Set<number>,
): { visibleIds: Set<number>; edges: { source: number; target: number }[] } {
    const index = buildChildrenIndex(nodes);
    const visibleIds = new Set<number>();
    const edges: { source: number; target: number }[] = [];

    const walk = (n: OrgChartNode) => {
        visibleIds.add(n.id);
        if (collapsed.has(n.id)) {
            return;
        }
        for (const child of index.get(n.id) ?? []) {
            edges.push({ source: n.id, target: child.id });
            walk(child);
        }
    };
    (index.get(null) ?? []).forEach(walk);

    return { visibleIds, edges };
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

/** Position React Flow nodes with a dagre top-down (TB) tree layout. */
export function layoutGraph(rfNodes: OrgFlowNode[], rfEdges: Edge[]): OrgFlowNode[] {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 });
    g.setDefaultEdgeLabel(() => ({}));

    rfNodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
    rfEdges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);

    return rfNodes.map((n) => {
        const p = g.node(n.id);
        return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } };
    });
}
