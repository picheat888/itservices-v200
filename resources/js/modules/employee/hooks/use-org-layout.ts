// Org chart card positions, laid out in a Web Worker and cached per data + direction.
import type { OrgChartNode } from '@/shared/types';
import { useEffect, useState } from 'react';
import type { OrgLayoutRequest, OrgLayoutResponse } from '../lib/org-layout.worker';
import { layoutPositions, visibleGraph, type OrgDir } from '../lib/org-tree';

type Positions = Map<number, { x: number; y: number }>;

/** A finished layout and what it was computed for. */
export type OrgLayout = { data: OrgChartNode[]; dir: OrgDir; positions: Positions };

const cache = new WeakMap<OrgChartNode[], Partial<Record<OrgDir, Positions>>>();
const waiting = new Map<number, { request: OrgLayoutRequest; resolve: (p: Positions) => void }>();
let worker: Worker | null | undefined;
let nextId = 0;

const layoutOnMainThread = ({ ids, edges, dir }: OrgLayoutRequest) => layoutPositions(ids, edges, dir);

// No worker (old browser, blocked script) → finish what is waiting on the main thread
function dropWorker() {
    worker?.terminate();
    worker = null;
    waiting.forEach(({ request, resolve }) => setTimeout(() => resolve(layoutOnMainThread(request))));
    waiting.clear();
}

function getWorker(): Worker | null {
    if (worker === undefined) {
        try {
            worker = new Worker(new URL('../lib/org-layout.worker.ts', import.meta.url), { type: 'module' });
            worker.onmessage = (e: MessageEvent<OrgLayoutResponse>) => {
                const job = waiting.get(e.data.id);
                waiting.delete(e.data.id);
                job?.resolve(new Map(e.data.positions));
            };
            worker.onerror = dropWorker;
        } catch {
            worker = null;
        }
    }
    return worker;
}

function computeLayout(data: OrgChartNode[], dir: OrgDir): Promise<Positions> {
    const request: OrgLayoutRequest = { id: nextId++, ids: data.map((n) => n.id), edges: visibleGraph(data, new Set()).edges, dir };
    return new Promise((resolve) => {
        const w = getWorker();
        if (!w) {
            setTimeout(() => resolve(layoutOnMainThread(request)));
            return;
        }
        waiting.set(request.id, { request, resolve });
        w.postMessage(request);
    });
}

function cached(data: OrgChartNode[], dir: OrgDir): OrgLayout | null {
    const positions = cache.get(data)?.[dir];
    return positions ? { data, dir, positions } : null;
}

/** The latest finished layout; it may still belong to the previous direction or data while a new one is computed. */
export function useOrgLayout(data: OrgChartNode[], dir: OrgDir): OrgLayout | null {
    const [layout, setLayout] = useState<OrgLayout | null>(() => cached(data, dir));

    useEffect(() => {
        const hit = cached(data, dir);
        if (hit) {
            setLayout((prev) => (prev?.data === data && prev.dir === dir ? prev : hit));
            return;
        }
        let live = true;
        computeLayout(data, dir).then((positions) => {
            cache.set(data, { ...cache.get(data), [dir]: positions });
            if (live) {
                setLayout({ data, dir, positions });
            }
        });
        return () => {
            live = false;
        };
    }, [data, dir]);

    return layout;
}
