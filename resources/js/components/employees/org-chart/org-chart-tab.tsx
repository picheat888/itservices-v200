import { useOrgChart } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import {
    layoutGraph,
    nodesWithReports,
    visibleGraph,
    type OrgFlowNode,
    type OrgNodeData,
} from '@/lib/org-tree';
import type { OrgChartNode } from '@/types';
import {
    Background,
    Controls,
    MiniMap,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useState } from 'react';
import { OrgNode } from './org-node';
import { OrgChartToolbar } from './org-chart-toolbar';

const nodeTypes = { orgNode: OrgNode };

function OrgChartInner({ data }: { data: OrgChartNode[] }) {
    const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
    const [highlighted, setHighlighted] = useState<number | null>(null);
    const rf = useReactFlow();

    const withReports = useMemo(() => nodesWithReports(data), [data]);

    const toggle = useCallback((id: number) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const focus = useCallback(
        (id: number) => {
            setHighlighted(id);
            rf.fitView({ nodes: [{ id: String(id) }], duration: 500, maxZoom: 1.3, padding: 0.4 });
        },
        [rf],
    );

    const allCollapsed = withReports.size > 0 && collapsed.size >= withReports.size;
    const toggleAll = useCallback(() => {
        setCollapsed(allCollapsed ? new Set() : new Set(withReports));
    }, [allCollapsed, withReports]);

    const { rfNodes, rfEdges } = useMemo(() => {
        const { visibleIds, edges } = visibleGraph(data, collapsed);
        const nodes: OrgFlowNode[] = data
            .filter((n) => visibleIds.has(n.id))
            .map((n) => ({
                id: String(n.id),
                type: 'orgNode',
                position: { x: 0, y: 0 },
                data: {
                    ...n,
                    collapsed: collapsed.has(n.id),
                    hasReports: withReports.has(n.id),
                    highlighted: highlighted === n.id,
                    onToggle: toggle,
                    onFocus: focus,
                } satisfies OrgNodeData,
            }));
        const flowEdges: Edge[] = edges.map((e) => ({
            id: `${e.source}-${e.target}`,
            source: String(e.source),
            target: String(e.target),
            type: 'smoothstep',
        }));
        return { rfNodes: layoutGraph(nodes, flowEdges), rfEdges: flowEdges };
    }, [data, collapsed, highlighted, withReports, toggle, focus]);

    return (
        <div className="flex h-[72vh] flex-col overflow-hidden rounded-lg border border-border">
            <OrgChartToolbar nodes={data} allCollapsed={allCollapsed} onJump={focus} onToggleAll={toggleAll} />
            <div className="min-h-0 flex-1">
                <ReactFlow
                    nodes={rfNodes}
                    edges={rfEdges}
                    nodeTypes={nodeTypes}
                    fitView
                    minZoom={0.2}
                    maxZoom={1.8}
                    nodesDraggable={false}
                    proOptions={{ hideAttribution: true }}
                >
                    <Background gap={18} />
                    <Controls showInteractive={false} />
                    <MiniMap pannable zoomable />
                </ReactFlow>
            </div>
        </div>
    );
}

/** Org chart tab: fetches the node list and renders the React Flow canvas. */
export function OrgChartTab() {
    const t = useT();
    const { data = [], isLoading } = useOrgChart();

    if (isLoading) {
        return <div className="py-16 text-center text-sm text-muted-foreground">{t('loading')}</div>;
    }
    if (data.length === 0) {
        return <div className="py-16 text-center text-sm text-muted-foreground">{t('pos_empty')}</div>;
    }

    return (
        <ReactFlowProvider>
            <OrgChartInner data={data} />
        </ReactFlowProvider>
    );
}
