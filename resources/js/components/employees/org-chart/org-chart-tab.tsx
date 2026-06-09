import { useOrgChart } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { deptColor, layoutGraph, NODE_H, NODE_W, nodesWithReports, rootIds, visibleGraph, type OrgDir, type OrgFlowNode, type OrgNodeData } from '@/lib/org-tree';
import { useUiStore } from '@/stores/ui';
import type { OrgChartNode } from '@/types';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrgChartToolbar } from './org-chart-toolbar';
import { OrgNode } from './org-node';

const nodeTypes = { orgNode: OrgNode };

function OrgChartInner({ data }: { data: OrgChartNode[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
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
                style: hot ? { stroke: 'var(--brand)', strokeWidth: 2.4 } : { stroke: 'var(--oc-edge)', strokeWidth: 1.6, opacity: dim ? 0.12 : 1 },
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

    // Jump to + highlight a person picked from the search suggestions.
    const focusPerson = useCallback(
        (id: number) => {
            // Expand any collapsed ancestors so the target is actually rendered.
            const byId = new Map(data.map((n) => [n.id, n]));
            const ancestors = new Set<number>();
            let cur = byId.get(id)?.manager_id ?? null;
            while (cur != null && byId.has(cur) && !ancestors.has(cur)) {
                ancestors.add(cur);
                cur = byId.get(cur)?.manager_id ?? null;
            }
            setCollapsed((prev) => {
                if (![...ancestors].some((a) => prev.has(a))) {
                    return prev;
                }
                const next = new Set(prev);
                ancestors.forEach((a) => next.delete(a));
                return next;
            });
            setSelectedId(id);
            setQuery('');
            // Defer so the node is laid out (esp. after expanding), then zoom right in (x4).
            setTimeout(() => {
                const node = rf.getNode(String(id));
                if (!node) {
                    return;
                }
                const x = node.position.x + (node.measured?.width ?? NODE_W) / 2;
                const y = node.position.y + (node.measured?.height ?? NODE_H) / 2;
                rf.setCenter(x, y, { zoom: 2.2, duration: 520 });
            }, 90);
        },
        [data, rf],
    );

    const people = useMemo(
        () =>
            data.map((n) => ({
                id: n.id,
                label: lang === 'th' ? (n.name_th ?? n.name) : n.name,
                code: n.code,
                dept: n.department_code ?? n.department ?? '',
                color: deptColor(n.department_code),
            })),
        [data, lang],
    );

    return (
        <div className="space-y-3">
            <div>
                <h2 className="text-foreground text-base font-semibold">{t('org_heading')}</h2>
                <p className="text-muted-foreground mt-0.5 text-xs">{t('org_subtitle')}</p>
            </div>
            <div className="border-border flex h-[70vh] flex-col overflow-hidden rounded-lg border">
                <OrgChartToolbar
                    stats={{ total: visibleIds.size, levels, managers: withReports.size }}
                    query={query}
                    onQueryChange={setQuery}
                    people={people}
                    onPick={focusPerson}
                    dir={dir}
                    onDirChange={setDir}
                    anyCollapsed={anyCollapsed}
                    onToggleAll={toggleAll}
                    onFit={fit}
                />
                <div className="bg-background min-h-0 flex-1">
                    <ReactFlow
                        nodes={rfNodes}
                        edges={rfEdges}
                        nodeTypes={nodeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.16 }}
                        minZoom={0.28}
                        maxZoom={2.5}
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
                    </ReactFlow>
                </div>
            </div>
        </div>
    );
}

/** Org chart tab: fetches the node list and renders the React Flow canvas. */
export function OrgChartTab() {
    const t = useT();
    const { data = [], isLoading } = useOrgChart();

    if (isLoading) {
        return <div className="text-muted-foreground py-16 text-center text-sm">{t('loading')}</div>;
    }
    if (data.length === 0) {
        return <div className="text-muted-foreground py-16 text-center text-sm">{t('pos_empty')}</div>;
    }

    return (
        <ReactFlowProvider>
            <OrgChartInner data={data} />
        </ReactFlowProvider>
    );
}
