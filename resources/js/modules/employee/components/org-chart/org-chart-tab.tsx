import { useT } from '@/lang';
import type { OrgChartNode } from '@/shared/types';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUiStore } from '@/stores/ui';
import { Background, Controls, getNodesBounds, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type NodeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOrgChart } from '../../hooks/use-employees';
import {
    deptColor,
    layoutPositions,
    NODE_H,
    NODE_W,
    nodesWithReports,
    rootIds,
    visibleGraph,
    type OrgDir,
    type OrgFlowNode,
    type OrgNodeData,
} from '../../lib/org-tree';
import { OrgChartToolbar } from './org-chart-toolbar';
import { OrgNode } from './org-node';

const nodeTypes = { orgNode: OrgNode };

// Zoom bounds; minZoom low so deep trees fit
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 2.5;
// Trackpad pinch (ctrl+wheel, tiny deltas) vs mouse wheel (big notches)
const PINCH_SENSITIVITY = 0.02;
const WHEEL_SENSITIVITY = 0.003;

function OrgChartInner({ data }: { data: OrgChartNode[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
    const [dir, setDir] = useState<OrgDir>('TB');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [query, setQuery] = useState('');
    const rf = useReactFlow();
    const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Lets a "jump to person" skip the next auto-refit
    const skipFit = useRef(false);
    const paneRef = useRef<HTMLDivElement | null>(null);

    // Wheel zoom toward the cursor; capture phase keeps it from React Flow, touch pinch stays with React Flow
    useEffect(() => {
        const el = paneRef.current;
        if (!el) {
            return;
        }
        const onWheel = (e: WheelEvent) => {
            if ((e.target as Element | null)?.closest('.react-flow__minimap')) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const { x, y, zoom } = rf.getViewport();
            // Normalise line-mode deltas (Firefox) to roughly pixel scale.
            const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
            // ctrlKey is set for a trackpad pinch (and ⌘/ctrl + wheel) → zoom
            // snappily so it keeps up with the fingers; a plain mouse wheel stays gentle.
            const sensitivity = e.ctrlKey || e.metaKey ? PINCH_SENSITIVITY : WHEEL_SENSITIVITY;
            const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.exp(-delta * sensitivity)));
            if (next === zoom) {
                return;
            }
            // Keep the point under the cursor fixed while zooming.
            const rect = el.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const fx = (px - x) / zoom;
            const fy = (py - y) / zoom;
            rf.setViewport({ x: px - fx * next, y: py - fy * next, zoom: next });
        };
        el.addEventListener('wheel', onWheel, { passive: false, capture: true });
        return () => el.removeEventListener('wheel', onWheel, { capture: true });
    }, [rf]);

    const withReports = useMemo(() => nodesWithReports(data), [data]);
    const roots = useMemo(() => rootIds(data), [data]);

    // Full-tree layout per data/direction so collapsing never moves other cards
    const fullPositions = useMemo(() => {
        const ids = data.map((n) => n.id);
        const allEdges = visibleGraph(data, new Set<number>()).edges;
        return layoutPositions(ids, allEdges, dir);
    }, [data, dir]);

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

    // Click, Enter and Space select through React Flow
    const onNodesChange = useCallback((changes: NodeChange<OrgFlowNode>[]) => {
        for (const change of changes) {
            if (change.type !== 'select') {
                continue;
            }
            const id = Number(change.id);
            setSelectedId((prev) => (change.selected ? id : prev === id ? null : prev));
        }
    }, []);

    // Clicking the selected card again clears it
    const onNodeClick = useCallback((_: unknown, node: OrgFlowNode) => {
        if (node.selected) {
            setSelectedId(null);
        }
    }, []);

    // Escape always clears (React Flow would select an unselected focused card instead)
    const onCanvasKeyDownCapture = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            setSelectedId(null);
        }
    }, []);

    // Search dims non-matching cards (matches name / Thai name / title / section / dept / code).
    const q = query.trim().toLowerCase();
    const matchSet = useMemo(() => {
        if (!q) {
            return null;
        }
        const s = new Set<number>();
        for (const n of data) {
            const hay =
                `${n.name} ${n.name_th ?? ''} ${n.title ?? ''} ${n.section ?? ''} ${n.department ?? ''} ${n.department_code ?? ''}`.toLowerCase();
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
                position: fullPositions.get(n.id) ?? { x: 0, y: 0 },
                // Explicit dims for the MiniMap
                width: NODE_W,
                height: NODE_H,
                selected: selectedId === n.id,
                ariaLabel: lang === 'th' ? (n.name_th ?? n.name) : n.name,
                className:
                    'rounded-[15px] focus-visible:ring-[3px] focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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

        return { rfNodes: nodes, rfEdges: flowEdges };
    }, [data, visibleIds, edges, fullPositions, collapsed, withReports, roots, selectedId, matchSet, dir, toggle, lang]);

    // Fit the whole tree, lifted slightly above centre by padding the bottom of the bounds
    const runFit = useCallback(() => {
        const nodes = rf.getNodes();
        if (nodes.length === 0) {
            return;
        }
        const b = getNodesBounds(nodes);
        const lifted = { x: b.x, y: b.y, width: b.width, height: b.height + Math.max(40, b.height * 0.05) };
        rf.fitBounds(lifted, { padding: 0.05, duration: 360 });
    }, [rf]);

    // Debounced refit when the direction or the visible-card count changes
    useEffect(() => {
        if (skipFit.current) {
            skipFit.current = false;
            return;
        }
        if (fitTimer.current) {
            clearTimeout(fitTimer.current);
        }
        fitTimer.current = setTimeout(runFit, 120);
        return () => {
            if (fitTimer.current) {
                clearTimeout(fitTimer.current);
            }
        };
    }, [dir, visibleIds.size, runFit]);

    const anyCollapsed = collapsed.size > 0;
    const toggleAll = useCallback(() => {
        setCollapsed((prev) => (prev.size > 0 ? new Set() : new Set(withReports)));
    }, [withReports]);

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
                // Skip the refit so the zoom-to-person below wins
                skipFit.current = true;
                const next = new Set(prev);
                ancestors.forEach((a) => next.delete(a));
                return next;
            });
            setSelectedId(id);
            setQuery('');
            // Defer until the node is laid out, then zoom in
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
                nameEn: n.name,
                nameTh: n.name_th,
                code: n.code,
                color: deptColor(n.department_code),
                search: `${n.name} ${n.name_th ?? ''} ${n.code} ${n.title ?? ''} ${n.section ?? ''} ${n.department ?? ''} ${n.department_code ?? ''}`.toLowerCase(),
            })),
        [data],
    );

    return (
        <div className="space-y-3">
            <div>
                <h2 className="text-foreground text-base font-semibold">{t('org_heading')}</h2>
                <p className="text-muted-foreground mt-0.5 text-xs">{t('org_subtitle')}</p>
            </div>
            <div className="border-border flex h-[65vh] flex-col overflow-hidden rounded-lg border">
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
                    onFit={runFit}
                />
                <div ref={paneRef} onKeyDownCapture={onCanvasKeyDownCapture} className="bg-background min-h-0 flex-1">
                    <ReactFlow
                        nodes={rfNodes}
                        edges={rfEdges}
                        nodeTypes={nodeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.05 }}
                        minZoom={MIN_ZOOM}
                        maxZoom={MAX_ZOOM}
                        zoomOnScroll={false}
                        zoomOnPinch
                        nodesDraggable={false}
                        nodesConnectable={false}
                        edgesFocusable={false}
                        onNodesChange={onNodesChange}
                        onNodeClick={onNodeClick}
                        onPaneClick={() => setSelectedId(null)}
                        ariaLabelConfig={{
                            'node.a11yDescription.default': t('org_node_a11y'),
                            'node.a11yDescription.keyboardDisabled': t('org_node_a11y'),
                        }}
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
                            bgColor="var(--card)"
                            className="border-border hidden overflow-hidden rounded-lg border lg:block"
                            style={{ width: 180, height: 130 }}
                        />
                    </ReactFlow>
                </div>
            </div>
        </div>
    );
}

/** Loading placeholder shaped like the heading, toolbar and a few cards. */
function OrgChartSkeleton() {
    return (
        <div className="space-y-3" aria-busy="true">
            <div className="space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <div className="border-border flex h-[65vh] flex-col overflow-hidden rounded-lg border">
                <div className="border-border flex items-center gap-3 border-b p-3">
                    <Skeleton className="h-8 w-14" />
                    <Skeleton className="ml-auto h-8 w-52" />
                    <Skeleton className="h-8 w-40" />
                    <Skeleton className="h-8 w-24" />
                </div>
                <div className="flex flex-1 flex-col items-center justify-center gap-10 p-6">
                    <Skeleton className="h-[106px] w-[292px] max-w-full rounded-[15px]" />
                    <div className="flex gap-6">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-[106px] w-[200px] rounded-[15px]" />
                        ))}
                    </div>
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
        return <OrgChartSkeleton />;
    }
    if (data.length === 0) {
        return <div className="text-muted-foreground py-16 text-center text-sm">{t('org_empty')}</div>;
    }

    return (
        <ReactFlowProvider>
            <OrgChartInner data={data} />
        </ReactFlowProvider>
    );
}
