import { useOrgChart } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import {
    deptColor,
    layoutGraph,
    nodesWithReports,
    rootIds,
    visibleGraph,
    type OrgDir,
    type OrgFlowNode,
    type OrgNodeData,
} from '@/lib/org-tree';
import type { OrgChartNode } from '@/types';
import { Background, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, useReactFlow, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrgChartToolbar } from './org-chart-toolbar';
import { OrgNode } from './org-node';

const nodeTypes = { orgNode: OrgNode };

function OrgChartInner({ data }: { data: OrgChartNode[] }) {
    const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
    const [dir, setDir] = useState<OrgDir>('TB');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [query, setQuery] = useState('');
    const rf = useReactFlow();
    const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const withReports = useMemo(() => nodesWithReports(data), [data]);
    const roots = useMemo(() => rootIds(data), [data]);

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

    const select = useCallback((id: number) => {
        setSelectedId((prev) => (prev === id ? null : id));
    }, []);

    // Search dims non-matching cards (matches name / Thai name / title / dept / code).
    const q = query.trim().toLowerCase();
    const matchSet = useMemo(() => {
        if (!q) {
            return null;
        }
        const s = new Set<number>();
        for (const n of data) {
            const hay = `${n.name} ${n.name_th ?? ''} ${n.title ?? ''} ${n.department ?? ''} ${n.department_code ?? ''}`.toLowerCase();
            if (hay.includes(q)) {
                s.add(n.id);
            }
        }
        return s;
    }, [q, data]);

    const { visibleIds, edges, levels } = useMemo(() => visibleGraph(data, collapsed), [data, collapsed]);

    const { rfNodes, rfEdges } = useMemo(() => {
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
                    isRoot: roots.has(n.id),
                    selected: selectedId === n.id,
                    dimmed: matchSet ? !matchSet.has(n.id) : false,
                    dir,
                    color: deptColor(n.department_code),
                    onToggle: toggle,
                    onFocus: select,
                } satisfies OrgNodeData,
            }));

        const flowEdges: Edge[] = edges.map((e) => {
            const hot = selectedId != null && (e.source === selectedId || e.target === selectedId);
            const dim = matchSet != null && !(matchSet.has(e.source) && matchSet.has(e.target));
            return {
                id: `${e.source}-${e.target}`,
                source: String(e.source),
                target: String(e.target),
                type: 'smoothstep',
                zIndex: hot ? 5 : 0,
                style: hot
                    ? { stroke: 'var(--brand)', strokeWidth: 2.4 }
                    : { stroke: 'var(--oc-edge)', strokeWidth: 1.6, opacity: dim ? 0.12 : 1 },
            };
        });

        return { rfNodes: layoutGraph(nodes, flowEdges, dir), rfEdges: flowEdges };
    }, [data, visibleIds, edges, collapsed, withReports, roots, selectedId, matchSet, dir, toggle, select]);

    // Refit when the visible structure or orientation changes.
    useEffect(() => {
        if (fitTimer.current) {
            clearTimeout(fitTimer.current);
        }
        fitTimer.current = setTimeout(() => rf.fitView({ padding: 0.16, duration: 320 }), 60);
        return () => {
            if (fitTimer.current) {
                clearTimeout(fitTimer.current);
            }
        };
    }, [dir, collapsed, rf]);

    const anyCollapsed = collapsed.size > 0;
    const toggleAll = useCallback(() => {
        setCollapsed((prev) => (prev.size > 0 ? new Set() : new Set(withReports)));
    }, [withReports]);

    const fit = useCallback(() => rf.fitView({ padding: 0.16, duration: 320 }), [rf]);

    // Distinct department legend (code → colour), in first-seen order.
    const legend = useMemo(() => {
        const seen: { code: string; color: string }[] = [];
        for (const n of data) {
            const code = n.department_code ?? n.department;
            if (code && !seen.some((s) => s.code === code)) {
                seen.push({ code, color: deptColor(n.department_code) });
            }
        }
        return seen;
    }, [data]);

    return (
        <div className="flex h-[74vh] flex-col overflow-hidden rounded-lg border border-border">
            <OrgChartToolbar
                stats={{ total: visibleIds.size, levels, managers: withReports.size }}
                query={query}
                onQueryChange={setQuery}
                dir={dir}
                onDirChange={setDir}
                anyCollapsed={anyCollapsed}
                onToggleAll={toggleAll}
                onFit={fit}
            />
            <div className="min-h-0 flex-1 bg-background">
                <ReactFlow
                    nodes={rfNodes}
                    edges={rfEdges}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.16 }}
                    minZoom={0.28}
                    maxZoom={1.6}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    onPaneClick={() => setSelectedId(null)}
                    proOptions={{ hideAttribution: true }}
                >
                    <Background gap={22} size={1.4} color="var(--oc-dot)" />
                    <Controls showInteractive={false} position="bottom-right" />
                    <MiniMap
                        position="bottom-left"
                        pannable
                        zoomable
                        nodeColor={(n) => (n.data as OrgNodeData)?.color ?? 'var(--brand)'}
                        nodeStrokeWidth={0}
                        style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                    />
                    {legend.length > 1 && (
                        <Panel
                            position="top-center"
                            className="!m-2 flex max-w-[620px] flex-wrap items-center gap-3 rounded-lg border border-border bg-card/90 px-3 py-1.5 backdrop-blur"
                        >
                            {legend.map((d) => (
                                <span key={d.code} className="flex items-center gap-1.5">
                                    <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: d.color }} />
                                    <span className="font-mono text-[10.5px] font-semibold tracking-wide text-muted-foreground">{d.code}</span>
                                </span>
                            ))}
                        </Panel>
                    )}
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
