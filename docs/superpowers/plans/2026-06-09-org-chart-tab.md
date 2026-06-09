# Organization Chart Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive, zoomable "Organization chart" tab to the Employees page that renders the company reporting tree (built from `employees.manager_id`) as a hybrid top-down forest with collapse/expand, pan/zoom, and search-to-jump.

**Architecture:** A lean backend endpoint returns active employees as a flat node list. The frontend assembles a forest, prunes collapsed subtrees, runs a dagre top-down layout, and renders it with React Flow custom nodes. Graph math lives in a pure helper (`lib/org-tree.ts`) so the React component stays focused.

**Tech Stack:** Laravel 12 / PHPUnit (backend); React 19 + TypeScript, TanStack Query, React Flow (`@xyflow/react`) + `@dagrejs/dagre`, Tailwind v4 (frontend).

**Spec:** `docs/superpowers/specs/2026-06-09-org-chart-tab-design.md`

---

## Testing convention

- **Backend:** PHPUnit, TDD (write the failing test first). Run with `php artisan test --compact`.
- **Frontend:** This project has **no JS test runner** (only `tsc`, `eslint`, `vite build`). Frontend tasks are verified with `npx tsc --noEmit`, `npx eslint <files>`, and `npm run build`, plus manual smoke — matching the existing project convention. Keep `lib/org-tree.ts` pure and fully typed so `tsc` covers its contracts.

## Data contract (shared by backend + frontend)

```
OrgChartNode {
  id: number
  code: string
  name: string
  name_th: string | null
  title: string | null        // position.title
  level: number | null        // position.level
  department: string | null   // department.name
  photo_url: string | null
  manager_id: number | null
  reports_count: number        // count of ACTIVE direct reports
}
```

A node whose `manager_id` is null **or** points to an employee not in the active set is treated as a **root** (forest).

## File Structure

**Backend**
- Create `app/Http/Resources/OrgChartNodeResource.php` — serialize one node.
- Modify `app/Http/Controllers/Api/EmployeeController.php` — add `orgChart()`.
- Modify `routes/api.php` — add the route before `apiResource('employees', …)`.
- Create `tests/Feature/OrgChartTest.php`.

**Frontend**
- Modify `resources/js/types/index.ts` — `OrgChartNode`.
- Modify `resources/js/services/orgApi.ts` — `employeeApi.orgChart()`.
- Modify `resources/js/hooks/use-org.ts` — `useOrgChart()`.
- Create `resources/js/lib/org-tree.ts` — pure graph helper (forest, prune, dagre layout).
- Create `resources/js/components/employees/org-chart/org-node.tsx` — custom React Flow node.
- Create `resources/js/components/employees/org-chart/org-chart-toolbar.tsx` — search + collapse/expand-all.
- Create `resources/js/components/employees/org-chart/org-chart-tab.tsx` — orchestrator (ReactFlow canvas).
- Modify `resources/js/pages/employees/index.tsx` — add the tab.
- Modify `resources/js/lib/i18n.ts` — new keys (en + th).

---

## Task 1: Backend — org-chart endpoint

**Files:**
- Create: `app/Http/Resources/OrgChartNodeResource.php`
- Modify: `app/Http/Controllers/Api/EmployeeController.php`
- Modify: `routes/api.php:90-91`
- Test: `tests/Feature/OrgChartTest.php`

- [ ] **Step 1: Write the failing test** — create `tests/Feature/OrgChartTest.php`

```php
<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Position;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrgChartTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_returns_active_employees_with_report_counts(): void
    {
        $this->actingAs($this->super());
        $pos = Position::create(['title' => 'Director', 'level' => 5]);
        $boss = Employee::create(['name' => 'Boss', 'position_id' => $pos->id]);
        Employee::create(['name' => 'Staff A', 'manager_id' => $boss->id]);
        Employee::create(['name' => 'Staff B', 'manager_id' => $boss->id]);

        $res = $this->getJson('/api/employees/org-chart')->assertOk();

        $res->assertJsonCount(3, 'data');
        $boss_row = collect($res->json('data'))->firstWhere('name', 'Boss');
        $this->assertSame(2, $boss_row['reports_count']);
        $this->assertSame('Director', $boss_row['title']);
        $this->assertSame(5, $boss_row['level']);
    }

    public function test_excludes_resigned_employees(): void
    {
        $this->actingAs($this->super());
        Employee::create(['name' => 'Active One']);
        Employee::create(['name' => 'Gone', 'status' => 'resigned']);

        $this->getJson('/api/employees/org-chart')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Active One');
    }

    public function test_requires_authentication(): void
    {
        $this->getJson('/api/employees/org-chart')->assertUnauthorized();
    }

    public function test_requires_employees_view_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->getJson('/api/employees/org-chart')->assertForbidden();
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `php artisan test --compact --filter=OrgChartTest`
Expected: FAIL (route `employees/org-chart` not defined → 404/500).

- [ ] **Step 3: Create the resource** `app/Http/Resources/OrgChartNodeResource.php`

```php
<?php

namespace App\Http\Resources;

use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/** @mixin Employee */
class OrgChartNodeResource extends JsonResource
{
    /**
     * One node in the org chart: identity, position/department labels, photo,
     * the manager link, and a count of active direct reports.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'name_th' => $this->name_th,
            'title' => $this->position?->title,
            'level' => $this->position?->level,
            'department' => $this->department?->name,
            'photo_url' => $this->photo_path ? Storage::disk('public')->url($this->photo_path) : null,
            'manager_id' => $this->manager_id,
            'reports_count' => (int) ($this->reports_count ?? 0),
        ];
    }
}
```

- [ ] **Step 4: Add `orgChart()` to `EmployeeController`** — add imports at the top and the method (place it next to `approvalChain()`):

Add these `use` statements if missing:
```php
use App\Enums\EmployeeStatus;
use App\Http\Resources\OrgChartNodeResource;
```

Add the method:
```php
/**
 * Returns active employees as a flat list of org-chart nodes (resigned
 * excluded). The frontend assembles the reporting forest from manager_id;
 * reports_count is the number of active direct reports.
 */
public function orgChart(Request $request): JsonResponse
{
    abort_unless((bool) $request->user()?->hasPermission('employees.view'), 403);

    $employees = Employee::query()
        ->where('status', EmployeeStatus::Active)
        ->with(['position', 'department'])
        ->withCount(['subordinates as reports_count' => fn ($q) => $q->where('status', EmployeeStatus::Active)])
        ->orderBy('name')
        ->get();

    return OrgChartNodeResource::collection($employees)->additional(['message' => 'success'])->response();
}
```

- [ ] **Step 5: Add the route** in `routes/api.php` — immediately before `Route::apiResource('employees', EmployeeController::class);` (currently line 91):

```php
Route::get('employees/org-chart', [EmployeeController::class, 'orgChart'])->name('api.employees.org-chart');
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `php artisan test --compact --filter=OrgChartTest`
Expected: PASS (4 tests).

- [ ] **Step 7: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Resources/OrgChartNodeResource.php app/Http/Controllers/Api/EmployeeController.php routes/api.php tests/Feature/OrgChartTest.php
git commit -m "feat(org): org-chart endpoint (active employees + report counts)"
```

---

## Task 2: Add React Flow + dagre dependencies

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the packages**

Run: `npm install @xyflow/react@^12 @dagrejs/dagre@^1`
Expected: both added to `dependencies` in `package.json`, no peer-dep errors (React 19 is supported by `@xyflow/react` v12).

- [ ] **Step 2: Verify the build still works**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(org): add @xyflow/react + @dagrejs/dagre for the org chart"
```

---

## Task 3: Frontend types, API call, and query hook

**Files:**
- Modify: `resources/js/types/index.ts`
- Modify: `resources/js/services/orgApi.ts`
- Modify: `resources/js/hooks/use-org.ts`

- [ ] **Step 1: Add the `OrgChartNode` type** to `resources/js/types/index.ts` (after the `ApproverNode` interface)

```ts
export interface OrgChartNode {
    id: number;
    code: string;
    name: string;
    name_th: string | null;
    title: string | null;
    level: number | null;
    department: string | null;
    photo_url: string | null;
    manager_id: number | null;
    reports_count: number;
}
```

- [ ] **Step 2: Add the API call** in `resources/js/services/orgApi.ts`

Add `OrgChartNode` to the type import on line 1:
```ts
import type { ApiEnvelope, ApproverNode, Department, Employee, LocationItem, OrgChartNode, Position } from '@/types';
```

Add to the `employeeApi` object (after the `approvalChain` entry):
```ts
    orgChart: () => http.get<ApiEnvelope<OrgChartNode[]>>('/employees/org-chart').then((r) => r.data.data),
```

- [ ] **Step 3: Add the query hook** in `resources/js/hooks/use-org.ts` (after `useApprovalChain`)

```ts
export function useOrgChart() {
    return useQuery({ queryKey: ['org-chart'], queryFn: employeeApi.orgChart });
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add resources/js/types/index.ts resources/js/services/orgApi.ts resources/js/hooks/use-org.ts
git commit -m "feat(org): org-chart type, api call, and query hook"
```

---

## Task 4: Pure graph helper (`lib/org-tree.ts`)

**Files:**
- Create: `resources/js/lib/org-tree.ts`

- [ ] **Step 1: Write the helper**

```ts
import type { OrgChartNode } from '@/types';
import dagre from '@dagrejs/dagre';
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
        (index.get(key) ?? index.set(key, []).get(key)!).push(n);
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add resources/js/lib/org-tree.ts
git commit -m "feat(org): pure org-tree helper (forest, prune, dagre layout)"
```

---

## Task 5: Custom node (`org-node.tsx`)

**Files:**
- Create: `resources/js/components/employees/org-chart/org-node.tsx`

- [ ] **Step 1: Write the node component**

```tsx
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { OrgNodeData } from '@/lib/org-tree';
import { NODE_W } from '@/lib/org-tree';
import { cn } from '@/lib/utils';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/** Initials fallback when an employee has no photo. */
function initials(name: string): string {
    return name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

/**
 * One person card in the org chart. Top handle receives the edge from the
 * manager; bottom handle feeds edges to reports. The report-count pill is the
 * collapse/expand toggle. Single click focuses; double click is reserved for
 * the future per-person Details view.
 */
export function OrgNode({ data }: NodeProps) {
    const d = data as OrgNodeData;

    return (
        <div
            className={cn(
                'rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md',
                d.highlighted ? 'border-brand ring-2 ring-brand/40' : 'border-border',
            )}
            style={{ width: NODE_W }}
            onClick={() => d.onFocus(d.id)}
        >
            <Handle type="target" position={Position.Top} className="!bg-border" />

            <div className="flex items-center gap-2.5">
                <div className="relative shrink-0">
                    <Avatar className="h-10 w-10">
                        {d.photo_url && <AvatarImage src={d.photo_url} alt={d.name} />}
                        <AvatarFallback className="bg-brand/10 text-brand text-xs font-semibold">{initials(d.name)}</AvatarFallback>
                    </Avatar>
                    <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
                </div>
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold leading-tight">
                        {d.name}
                        {d.name_th && <span className="ml-1 font-normal text-muted-foreground">· {d.name_th}</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{d.title ?? '—'}</div>
                </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
                <span className="truncate">
                    {d.department ?? '—'}
                    {d.level != null && <span className="ml-1 font-mono">· Lv {d.level}</span>}
                </span>
                {d.hasReports && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            d.onToggle(d.id);
                        }}
                        className="ml-2 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand/10 px-2 py-0.5 font-mono font-semibold text-brand hover:bg-brand/20"
                    >
                        {d.collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {d.reports_count}
                    </button>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} className="!bg-border" />
        </div>
    );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint resources/js/components/employees/org-chart/org-node.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/employees/org-chart/org-node.tsx
git commit -m "feat(org): org chart custom node card"
```

---

## Task 6: Toolbar (`org-chart-toolbar.tsx`)

**Files:**
- Create: `resources/js/components/employees/org-chart/org-chart-toolbar.tsx`

- [ ] **Step 1: Write the toolbar**

Uses the project's existing `SearchableSelect` (see `department-modal.tsx`) for jump-to-person, plus a collapse/expand-all button. Zoom/fit is handled by React Flow's built-in `<Controls>` (added in the tab), so the toolbar does not duplicate it.

```tsx
import { SearchableSelect } from '@/components/shared/searchable-select';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { OrgChartNode } from '@/types';
import { FoldVertical, UnfoldVertical } from 'lucide-react';
import { useMemo } from 'react';

/**
 * Org chart toolbar: search a person to jump+center on them, and a single
 * collapse-all / expand-all toggle. Zoom and fit live in React Flow's Controls.
 */
export function OrgChartToolbar({
    nodes,
    allCollapsed,
    onJump,
    onToggleAll,
}: {
    nodes: OrgChartNode[];
    allCollapsed: boolean;
    onJump: (id: number) => void;
    onToggleAll: () => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    const options = useMemo(
        () =>
            nodes.map((n) => ({
                value: String(n.id),
                label: lang === 'th' ? (n.name_th ?? n.name) : n.name,
                sub: n.title ?? n.code,
                search: `${n.name} ${n.name_th ?? ''} ${n.code} ${n.title ?? ''}`,
            })),
        [nodes, lang],
    );

    return (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
            <div className="w-64 max-w-full">
                <SearchableSelect
                    value=""
                    onChange={(v) => v && onJump(Number(v))}
                    options={options}
                    placeholder={t('org_search_placeholder')}
                />
            </div>
            <Button variant="outline" onClick={onToggleAll}>
                {allCollapsed ? <UnfoldVertical className="h-4 w-4" /> : <FoldVertical className="h-4 w-4" />}
                {allCollapsed ? t('org_expand_all') : t('org_collapse_all')}
            </Button>
        </div>
    );
}
```

- [ ] **Step 2: Verify `SearchableSelect` prop names**

Run: `npx eslint resources/js/components/employees/org-chart/org-chart-toolbar.tsx && npx tsc --noEmit`
Expected: clean. If `tsc` reports a prop mismatch on `SearchableSelect` (e.g. `placeholder` not accepted, or option shape differs), open `resources/js/components/shared/searchable-select.tsx`, read its props, and adjust this call to match — do not change `SearchableSelect` itself.

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/employees/org-chart/org-chart-toolbar.tsx
git commit -m "feat(org): org chart toolbar (search-to-jump + collapse all)"
```

---

## Task 7: Canvas orchestrator (`org-chart-tab.tsx`)

**Files:**
- Create: `resources/js/components/employees/org-chart/org-chart-tab.tsx`

- [ ] **Step 1: Write the orchestrator**

```tsx
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
            next.has(id) ? next.delete(id) : next.add(id);
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

    // Build → prune collapsed → dagre layout. Recomputed when data/collapse/highlight change.
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
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint resources/js/components/employees/org-chart/org-chart-tab.tsx`
Expected: clean. Note: the `next.has(id) ? next.delete(id) : next.add(id)` ternary may trip `no-unused-expressions`; if eslint flags it, rewrite as `if (next.has(id)) { next.delete(id); } else { next.add(id); }`.

- [ ] **Step 3: Confirm `t('loading')` exists**

Run: `grep -n "    loading:" resources/js/lib/i18n.ts`
Expected: a match in both the en and th maps. If it does NOT exist, use the literal already used elsewhere for loading, or add a `loading` key in Task 8's i18n step.

- [ ] **Step 4: Commit**

```bash
git add resources/js/components/employees/org-chart/org-chart-tab.tsx
git commit -m "feat(org): org chart canvas (React Flow + dagre, collapse/focus/minimap)"
```

---

## Task 8: Wire the tab into the Employees page + i18n

**Files:**
- Modify: `resources/js/pages/employees/index.tsx`
- Modify: `resources/js/lib/i18n.ts`

- [ ] **Step 1: Add i18n keys** in `resources/js/lib/i18n.ts`

In the **en** map, next to the other `sub_*`/`org_*`-area keys, add:
```ts
    sub_org_chart: 'Org chart',
    org_search_placeholder: 'Search a person to jump to…',
    org_collapse_all: 'Collapse all',
    org_expand_all: 'Expand all',
```
In the **th** map, add the matching keys:
```ts
    sub_org_chart: 'ผังองค์กร',
    org_search_placeholder: 'ค้นหาพนักงานเพื่อกระโดดไป…',
    org_collapse_all: 'ยุบทั้งหมด',
    org_expand_all: 'ขยายทั้งหมด',
```
If Task 7 Step 3 found `loading` missing, also add `loading: 'Loading…'` (en) / `loading: 'กำลังโหลด…'` (th).

- [ ] **Step 2: Import the tab** in `resources/js/pages/employees/index.tsx` (next to the other employee-component imports)

```tsx
import { OrgChartTab } from '@/components/employees/org-chart/org-chart-tab';
```

- [ ] **Step 3: Extend the `Tab` type** (currently `type Tab = 'dashboard' | 'directory' | 'positions' | 'departments';`)

```tsx
type Tab = 'dashboard' | 'directory' | 'positions' | 'departments' | 'orgchart';
```

- [ ] **Step 4: Add the tab entry** to the `tabs` array (after the `positions` entry)

```tsx
        { id: 'orgchart', label: t('sub_org_chart') },
```

- [ ] **Step 5: Render the tab content** — add next to the other `{tab === '…' && (…)}` blocks (e.g. right after the `positions` block)

```tsx
            {tab === 'orgchart' && <OrgChartTab />}
```

- [ ] **Step 6: Typecheck, lint, build**

Run: `npx tsc --noEmit && npx eslint resources/js/pages/employees/index.tsx resources/js/lib/i18n.ts && npm run build`
Expected: all clean, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add resources/js/pages/employees/index.tsx resources/js/lib/i18n.ts
git commit -m "feat(org): add Org chart tab to the Employees page"
```

---

## Task 9: Full verification + README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the backend tests**

Run: `php artisan test --compact --filter=OrgChartTest`
Expected: 4 PASS.

- [ ] **Step 2: Frontend gate**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build.

- [ ] **Step 3: Manual smoke**

Start the app (`composer run dev` or `php artisan serve` + `npm run dev`), open Employees → **Org chart** tab. Confirm: tree renders from the roots, collapse/expand via the report-count pill works, scroll zooms, drag pans, the Controls fit button works, and searching a person centers + highlights them. Set a couple of `manager_id` values via the employee form if the tree looks flat.

- [ ] **Step 4: Update README** — add a short section under the Org area (mirror the existing "Org Approval Chain" section style)

```markdown
## Org Chart (ผังองค์กร) — แท็บผังองค์กรแบบโต้ตอบ

- แท็บใหม่ในหน้า Employees แสดงผังบังคับบัญชาจาก `employees.manager_id` แบบ **forest** (คนไม่มีหัวหน้า = ต้นไม้แยก), ซ่อนคนลาออก
- สร้างด้วย **React Flow (`@xyflow/react`) + `@dagrejs/dagre`** (layout บนลงล่าง); node การ์ดละเอียด (รูป/ชื่อ EN+TH/ตำแหน่ง/แผนก/level/จำนวนลูกน้อง)
- โต้ตอบ: scroll = zoom, ลาก = pan, คลิกการ์ด = โฟกัส, ป้ายจำนวนลูกน้อง = ยุบ/ขยายกิ่ง, ค้นหา = กระโดด+ไฮไลต์, มี MiniMap + Controls
- Backend: `GET /api/employees/org-chart` (gate `employees.view`, ตัด resigned, นับ reports_count) · `OrgChartNodeResource`
- Frontend: `lib/org-tree.ts` (helper บริสุทธิ์ — forest/prune/dagre), `components/employees/org-chart/*`, `useOrgChart`
- มุมมองโฟกัสรายคน (Design B) ถูก note ไว้สำหรับหน้า Details ในอนาคต (ดับเบิลคลิก node)
- **ตรวจสอบ**: `OrgChartTest` 4 ผ่าน · `tsc` ✅ · `npm run build` ✅
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(org): document the Org chart tab"
```

---

## Self-review notes

- **Spec coverage:** nav model (hybrid: Task 7 full tree + focus + collapse + pan/zoom) ✓; rich node (Task 5) ✓; forest (Task 4 `buildChildrenIndex` null-key roots) ✓; hide resigned (Task 1 active filter) ✓; search/jump (Task 6 + `focus`) ✓; React Flow + dagre (Tasks 2, 4, 7) ✓; deferred Design B (Task 5 double-click reserved — note: wire the actual handler in a later phase) ✓.
- **Type consistency:** `OrgChartNode` fields identical across resource (Task 1), TS type (Task 3), helper (Task 4); `OrgNodeData`/`OrgFlowNode` defined in Task 4 and consumed in Tasks 5 & 7; `nodeTypes` key `orgNode` matches the node `type: 'orgNode'`.
- **Known adjustment points (verify during build, fix inline):** `SearchableSelect` prop shape (Task 6 Step 2), `t('loading')` existence (Task 7 Step 3), the Set-toggle ternary lint (Task 7 Step 2). Each step says exactly what to do if the check fails.
```
