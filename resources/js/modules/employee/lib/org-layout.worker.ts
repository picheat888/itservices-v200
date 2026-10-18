// Web Worker: runs the dagre org-chart layout off the main thread so the tab stays responsive.
import { layoutPositions, type OrgDir } from './org-tree';

export type OrgLayoutRequest = { id: number; ids: number[]; edges: { source: number; target: number }[]; dir: OrgDir };
export type OrgLayoutResponse = { id: number; positions: [number, { x: number; y: number }][] };

self.onmessage = (e: MessageEvent<OrgLayoutRequest>) => {
    const { id, ids, edges, dir } = e.data;
    const response: OrgLayoutResponse = { id, positions: [...layoutPositions(ids, edges, dir)] };
    self.postMessage(response);
};
