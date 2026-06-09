# Organization Chart Tab — Design

> Status: approved 2026-06-09. Spec for the first build (Tab). Visual/behaviour details are adjustable later — this is the starting point, not frozen.

## Goal

Add an **Organization chart** tab to the Employees page that renders the company reporting structure as an interactive, zoomable tree — in the spirit of the Microsoft Teams / Microsoft 365 org chart. The source of truth is the existing `employees.manager_id` reporting tree (no new relational data needed).

## Decisions (from brainstorming)

| Topic | Decision |
|-------|----------|
| Navigation model | **Hybrid** — full top-down tree from the roots, with collapse/expand, click-to-focus (recenter), pan + zoom in/out |
| Node card | **Rich** — avatar, name (EN + TH), title, status dot, level, department, direct-reports count badge; quick actions on the node |
| Tree top (roots) | **Forest** — every employee with no manager is its own top-level tree; multiple trees laid out side by side |
| Resigned employees | **Always hidden** — excluded at the backend; never shown in the chart |
| Search | **Yes** — a search box finds an employee and jumps/centers + highlights them |
| Tech | **React Flow (`@xyflow/react`) + `@dagrejs/dagre`** for top-down auto-layout (user approved adding these dependencies) |

## Deferred (noted, not in this build)

- **Person-centered "Teams style" view (Design B)** — the 3-tier (manager → person → reports) focused card view is reserved for a future **per-person Details** experience, opened from a node (double-click). This build only wires the entry point; the Details view itself is a later phase.

## Architecture

### Backend

- **Endpoint:** `GET /api/employees/org-chart` — gated by `employees.view` (auth:sanctum).
  - Placed before `Route::apiResource('employees', ...)` so it is not shadowed.
- **Response:** a flat list of **active** employees (resigned excluded), each:
  ```json
  {
    "id": 12, "code": "EMP012", "name": "Krit S.", "name_th": "กฤต",
    "title": "IT Manager", "level": 4, "department": "IT",
    "avatar_url": "…|null", "manager_id": 7, "reports_count": 2
  }
  ```
  - `reports_count` counts only active direct reports.
  - The frontend assembles the forest + edges from `manager_id`; the API stays a lean flat list.
- **Resource:** `app/Http/Resources/OrgChartNodeResource.php`.
- **Controller:** add `orgChart()` to `app/Http/Controllers/Api/EmployeeController.php` (inject nothing new; query `Employee` active scope with `position`, `department`, and a withCount of active reports).
- **Resigned filter:** reuse the existing `EmployeeStatus` enum / active scope used elsewhere; a resigned manager must not orphan its reports silently — reports of a hidden manager become roots in the forest (documented behaviour).

### Dependencies (new — approved)

- `@xyflow/react` — canvas, pan/zoom, `<Controls>`, `<MiniMap>`, `fitView`.
- `@dagrejs/dagre` — computes top-down (`rankdir: TB`) node positions for each tree.

### Frontend

- **Hook:** `useOrgChart()` in `resources/js/hooks/use-org.ts` — `useQuery(['org-chart'], employeeApi.orgChart)`.
- **API:** `employeeApi.orgChart()` in `resources/js/services/orgApi.ts` → `GET /employees/org-chart`.
- **Types:** `OrgChartNode` in `resources/js/types/index.ts`.
- **Components** (new folder `resources/js/components/employees/org-chart/`):
  - `org-chart-tab.tsx` — orchestrator: data → build tree → drop collapsed subtrees → dagre layout → `<ReactFlow nodeTypes={{ orgNode }}>` with `<Controls>` + `<MiniMap>` + `fitView`. Owns collapsed-set state + selected/highlighted id.
  - `org-node.tsx` — the custom React Flow node (rich card). Renders the report-count badge as the collapse/expand toggle; exposes click (focus) and double-click (open Details — deferred handler).
  - `org-chart-toolbar.tsx` — search box (jump-to-person), zoom −/+, fit-to-screen, collapse-all.
- **Pure helper (unit-tested):** `resources/js/lib/org-tree.ts`
  - `buildForest(nodes)` → roots + children index.
  - `visibleGraph(nodes, collapsedIds)` → `{ rfNodes, rfEdges }` after pruning collapsed subtrees.
  - `layout(rfNodes, rfEdges)` → dagre-positioned nodes.
  - Keeping the graph math out of the React component makes it testable and keeps the component focused.

### Interactions

- **scroll** = zoom · **drag** = pan · **click card** = focus/recenter · **click ▾/▸ badge** = collapse/expand that branch · **fit button** = `fitView` · **collapse-all** = collapse every node with reports.
- **Search** → pick a result → center viewport on that node + transient highlight ring.
- **Double-click node** → open per-person Details (Design B) — wired as a no-op/placeholder this build.

### Tab placement

- Add `'orgchart'` to the `Tab` union and a tab entry (label `t('sub_org_chart')`) in `resources/js/pages/employees/index.tsx`; render `<OrgChartTab />` when active.

### i18n

New keys (en + th): `sub_org_chart`, `org_search_placeholder`, `org_fit`, `org_collapse_all`, `org_separate_tree`, `org_no_reports`, plus reuse existing status/level/department labels.

## Testing

- `resources/js/lib/org-tree.ts` → unit tests: build forest from flat list (incl. multiple roots), prune collapsed subtree, reports-count, resigned-manager-orphan-becomes-root.
- Backend: `tests/Feature/OrgChartTest.php` — endpoint returns active only (excludes resigned), correct `reports_count`, auth + `employees.view` permission gates.
- React Flow UI: verified via `tsc --noEmit` + `eslint` + `npm run build` + manual smoke (project convention — no JS test harness).

## Out of scope (YAGNI)

- Editing the tree (drag-to-reparent) from the chart — managers are still set via the employee form.
- Export to image/PDF.
- The full person-centered Details view (deferred, see above).
- Department-filtered or multi-root virtual grouping — forest only.
