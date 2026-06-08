# Org Approval Chain — Foundation (Design)

**Date:** 2026-06-08
**Status:** Approved (design) — pending implementation plan
**Approach:** A — manager reporting tree (single source of truth for both the
approval chain and, later, the org chart). Position `level` is kept only as the
ceiling that stops the chain at VP.

## 1. Purpose & Scope

Make the Employee/Org data ready to compute and display an **approval chain** for a
staff member by walking up the management reporting tree, stopping at VP:
`(submitter) → direct manager → … → VP`.

**In scope (this spec — Foundation only):**
- `employees.manager_id` — each employee's direct manager (self-referencing).
- A service that resolves an employee's approval chain by climbing `manager_id`,
  stopping once it includes a manager at/above the configured VP level.
- UI to set an employee's manager (with self/cycle protection).
- A read-only display of the chain on the employee detail drawer + an API endpoint.
- A single config value: the VP ceiling level.

**Out of scope:**
- Approve/Reject actions, request state machine, the Request module.
- Binding to `requests.approve_*` permissions; choosing which approver must act.
- **Phase 2 (separate spec):** the Organization tab / org-chart visualization, drawn
  from the same `manager_id` tree.

## 2. Decisions (locked)

| # | Decision |
|---|----------|
| Hierarchy source | A single **manager reporting tree** (`employees.manager_id`). Drives both the approval chain now and the org chart in Phase 2. |
| Chain direction | Walk **up** from the submitter via `manager_id`, one manager per step. |
| Stop condition | Stop once the chain includes the first manager whose `positions.level >= approval_ceiling_level` (the VP tier is included; nothing above it). Also stops at the tree root (`manager_id` null) or on a detected cycle. |
| Role of `positions.level` | Kept **only** as the ceiling test. Not used for scoping. |
| Cycle safety | A manager may not be the employee itself or any of its descendants. Enforced on save + a runtime guard in the resolver. |
| Persistence | Chain is **computed on the fly**; nothing stored per-employee. |

(Dropped from the earlier level-based draft: `approval_org_wide_level`,
`approval_level_labels`, department-scoped resolution.)

## 3. Data Model

- **`employees.manager_id`** — `foreignId` nullable, `constrained('employees')`,
  `nullOnDelete()`. A self-referencing FK to the direct manager.
  - Add `manager_id` to `Employee::$fillable`.
  - Relations: `manager()` (BelongsTo self), `subordinates()` (HasMany self).
- **`positions.level`** — `unsignedTinyInteger`, NOT NULL, default `1`
  (1 = staff … higher = senior). Add to `Position::$fillable`.
- **app_settings:** `approval_ceiling_level` (int) — the level treated as VP.
  Default = the maximum position level present (so the top tier caps the chain).

## 4. Resolver — `App\Services\ApprovalChainService`

```
chainFor(Employee $employee): Employee[]   // ordered: direct manager first → VP last

ceiling = (int) setting('approval_ceiling_level')
chain   = []
seen    = { employee.id }          // cycle guard
current = employee

loop:
    mgr = current.manager
    if mgr is null:            break        // reached the top before VP
    if mgr.id in seen:         break        // cycle — stop defensively
    chain[] = mgr
    seen.add(mgr.id)
    if (mgr.position?.level ?? 0) >= ceiling: break   // VP reached (included), stop
    current = mgr

return chain
```

- Logic lives entirely in the service (per project rules).
- A manager with no position/level counts as level `0`, so the climb continues
  past them rather than stopping early.
- Resigned employees are not skipped mid-tree (the link is explicit); but the
  resolver may exclude resigned managers from being *returned* as active approvers
  — **decision:** a resigned manager is still returned (data-integrity: fix the
  tree), flagged by their `status` in the payload so the UI can warn. Keeps the
  foundation honest without silently re-routing.

## 5. Cycle Prevention (on save)

When setting/updating `manager_id` (Employee create/update):
- Reject `manager_id == employee.id`.
- Reject when the chosen manager is a **descendant** of the employee (walking the
  chosen manager's own chain upward must not encounter the employee).
- Enforced in the Employee form-request / service; returns a 422 validation error.

## 6. API & UI

- **Endpoint:** `GET /api/employees/{employee}/approval-chain`
  - Auth `auth:sanctum`; gated by `employees.view` (super bypasses).
  - Returns `{ data: ApproverNode[] }` where `ApproverNode =
    { id, code, name, name_th, position, department, level, status }`,
    ordered direct-manager-first.
- **Employee form (create/edit):** add a **Manager** field — a searchable employee
  picker. Excludes the employee itself and its descendants from the options.
- **Employee detail drawer:** show the approval chain as ascending rows
  (`Direct manager → … → VP`); empty chain → "No approver above this person /
  ไม่มีผู้อนุมัติเหนือกว่า". A resigned approver is visibly flagged.
- **Position master-data modal:** add a numeric `level` input.

## 7. Config

- `approval_ceiling_level` editable in a small **"Approval"** sub-section under
  **Settings → Master Data** (gated by `settings.masterdata`). Do NOT recreate the
  removed Workflow tab / `settings.workflows` permission.
- Seeded default = max position level, so the chain works before configuration.

## 8. Edge Cases

| Case | Behaviour |
|------|-----------|
| Employee has no manager | Empty chain. |
| Manager chain reaches root before VP level | Chain ends at the root manager. |
| A manager has no position/level | Counts as level 0; climb continues. |
| Cycle in the tree | Resolver breaks at the repeat; save-time validation prevents creating one. |
| Submitter already at/above VP level | Normal climb; stops at the first manager ≥ ceiling (may be empty if no manager). |
| Resigned manager in the path | Returned but flagged by `status`. |

## 9. Testing (PHPUnit feature tests)

- Climbs `manager_id` and **stops at the VP-level** manager (VP included, anything
  above excluded).
- Employee with no manager → empty chain.
- Manager with no position/level → climb continues past them.
- Cycle guard: a manually-induced loop terminates instead of looping.
- Save-time validation rejects self-manager and descendant-as-manager (422).
- Resigned manager still appears, flagged.
- Endpoint authorization: guest 401; user without `employees.view` 403.

## 10. Components Summary

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `employees.manager_id` migration + relations | Store the reporting tree | — |
| `positions.level` migration + model | Provide the VP ceiling test | — |
| `ApprovalChainService` | Resolve the chain by climbing `manager_id` | manager relation, ceiling setting |
| Employee form-request / service cycle check | Keep the tree acyclic | manager relation |
| `EmployeeController@approvalChain` + `ApproverNode` resource | Expose the chain | service |
| Employee form + detail drawer (frontend) | Set manager / show chain | employee + chain APIs |
| Position modal + Approval setting (frontend) | Edit level / ceiling | master-data + settings APIs |

## 11. Phase 2 (separate spec)

Organization tab rendering the full `manager_id` tree as an org chart
(person-by-person), reusing the relations and cycle guarantees built here.
