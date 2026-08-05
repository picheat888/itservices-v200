import { useT } from '@/lang';
import type { OrgChartNode } from '@/shared/types';
import { Background, Controls, getNodesBounds, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Edge } from '@xyflow/react';
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

// Zoom bounds for the canvas + our custom wheel zoom. minZoom is low so deep
// trees fit; maxZoom matches the search "zoom right in" target.
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 2.5;
// Wheel-zoom sensitivity. A touchpad pinch arrives as a `wheel` event with
// ctrlKey=true and TINY deltas (≈1–4 per tick), so the old single 0.003 factor
// barely moved — zoom lagged badly behind the fingers. We now split it:
//  • PINCH_SENSITIVITY — much higher, so pinch tracks the fingers in real time.
//  • WHEEL_SENSITIVITY — for a real mouse wheel (big notch deltas), kept gentle.
const PINCH_SENSITIVITY = 0.02;
const WHEEL_SENSITIVITY = 0.003;

function OrgChartInner({ data }: { data: OrgChartNode[] }) {
    const t = useT();
    const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
    const [dir, setDir] = useState<OrgDir>('TB');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [query, setQuery] = useState('');
    const rf = useReactFlow();
    const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Set true right before a "jump to person" so the auto-refit below skips that
    // one change and lets the targeted zoom-in win instead of fighting it.
    const skipFit = useRef(false);
    const paneRef = useRef<HTMLDivElement | null>(null);

    // Custom wheel zoom (see ZOOM_SENSITIVITY). React Flow's built-in scroll/
    // pinch zoom is disabled below so the two don't fight; we zoom toward the
    // cursor and cover real range from a small touchpad gesture. A native
    // non-passive listener is required to preventDefault the browser page zoom.
    useEffect(() => {
        const el = paneRef.current;
        if (!el) {
            return;
        }
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
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
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [rf]);

    const withReports = useMemo(() => nodesWithReports(data), [data]);
    const roots = useMemo(() => rootIds(data), [data]);

    // Lay out the FULL tree once per data/direction so positions are stable: a node
    // keeps its spot no matter what's collapsed. Collapsing just hides a subtree and
    // leaves its reserved gap — siblings never re-pack left/right.
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
                position: fullPositions.get(n.id) ?? { x: 0, y: 0 },
                // Explicit dims so the MiniMap can draw each node's rect (it doesn't rely on DOM measurement).
                width: NODE_W,
                height: NODE_H,
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

        return { rfNodes: nodes, rfEdges: flowEdges };
    }, [data, visibleIds, edges, fullPositions, collapsed, withReports, roots, selectedId, matchSet, dir, toggle, select]);

    // Fit the whole tree in one smooth motion, sitting a bit higher than dead-centre.
    // Trick: pad extra space onto the bottom of the bounds so centring that taller
    // box lifts the real content upward — a single animation, no two-step jump.
    const runFit = useCallback(() => {
        const nodes = rf.getNodes();
        if (nodes.length === 0) {
            return;
        }
        const b = getNodesBounds(nodes);
        // Lift the content slightly above dead-centre by padding the bottom of the bounds —
        // kept small so it doesn't force the camera to zoom out and shrink the chart.
        const lifted = { x: b.x, y: b.y, width: b.width, height: b.height + Math.max(40, b.height * 0.05) };
        rf.fitBounds(lifted, { padding: 0.05, duration: 360 });
    }, [rf]);

    // Refit so the camera tracks the chart's size: when the orientation flips OR the
    // number of visible cards changes (expand / collapse / collapse-all). Debounced and
    // animated so it glides instead of snapping. The skipFit guard lets "jump to person"
    // expand ancestors without the refit stealing its targeted zoom-in.
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
        // The visible-count refit effect handles the camera once the new layout lands.
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
                // Expanding ancestors changes the visible count; tell the refit effect to
                // skip this one so our zoom-to-person below isn't overridden by a full fit.
                skipFit.current = true;
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
                nameEn: n.name,
                nameTh: n.name_th,
                code: n.code,
                color: deptColor(n.department_code),
                // Always searchable across both languages + code/title/dept, regardless of UI language.
                search: `${n.name} ${n.name_th ?? ''} ${n.code} ${n.title ?? ''} ${n.department ?? ''} ${n.department_code ?? ''}`.toLowerCase(),
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
                <div ref={paneRef} className="bg-background min-h-0 flex-1">
                    <ReactFlow
                        nodes={rfNodes}
                        edges={rfEdges}
                        nodeTypes={nodeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.05 }}
                        minZoom={MIN_ZOOM}
                        maxZoom={MAX_ZOOM}
                        zoomOnScroll={false}
                        zoomOnPinch={false}
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
                            style={{ width: 180, height: 130, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
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
        return <div className="text-muted-foreground py-16 text-center text-sm">{t('org_empty')}</div>;
    }

    return (
        <ReactFlowProvider>
            <OrgChartInner data={data} />
        </ReactFlowProvider>
    );
}
