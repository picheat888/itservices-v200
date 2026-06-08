# Org Approval Chain — Foundation (Design)

**Date:** 2026-06-08
**Status:** Approved (design) — pending implementation plan
**Approach:** B — position-level based approval chain (no per-employee manager link)

## 1. Purpose & Scope

Make the Employee/Org data ready to compute and display an **approval chain** for a
staff member, following management rank:
`Supervisor/Head → Asst.Manager/Manager → VP`.

**In scope (this spec — Foundation only):**
- A numeric seniority `level` on each Position.
- A service that resolves an employee's approval chain (ordered tiers of approver
  candidates).
- A read-only display of that chain on the employee detail drawer + an API endpoint.
- Minimal config (org-wide threshold + tier labels).

**Out of scope (deferred to a later spec):**
- Approve/Reject actions, request state machine, the Request module.
- Binding to `requests.approve_*` permissions.
- Choosing *which* candidate must act at a tier.
- Any per-employee manager override (Approach A).

## 2. Decisions (locked)

| # | Decision |
|---|----------|
| Level model | Numeric `level` on `positions` (1 = staff … higher = senior). Multiple titles may share a level. |
| Resolution scope | Low/mid tiers resolved **within the submitter's department**; top tier(s) resolved **org-wide**. |
| Org-wide boundary | A single configurable setting `approval_org_wide_level`. `level >= threshold` → org-wide; below → department. |
| Multiplicity | Every active employee at a level (in scope) is an **approver candidate** for that tier. No "the one approver" field. |
| Missing level | **Skip** empty levels and continue upward — the chain always reaches the top. |
| Persistence | Chain is **computed on the fly**; nothing is stored per-employee. |

## 3. Data Model

- **`positions.level`** — `unsignedTinyInteger`, NOT NULL, default `1`.
  - Migration adds the column; existing rows default to `1`.
  - Add `level` to `Position::$fillable`.
- **No change** to `employees` or `departments` (no `manager_id`; `departments.head`
  stays a string and is not used by the resolver).
- **app_settings keys:**
  - `approval_org_wide_level` (int) — default = the current maximum position level
    (so the top tier is org-wide out of the box).
  - `approval_level_labels` (JSON) — `{ "2": "Supervisor/Head", "3": "Asst.Manager/Manager", "4": "VP" }`.
    Display-only; a level with no label shows as `Level N`.

## 4. Resolver — `App\Services\ApprovalChainService`

```
chainFor(Employee $employee): Tier[]

Tier = { level:int, label:string, scope:'department'|'org', approvers: Employee[] }

Lx       = employee.position.level  (null position → 0)
maxLevel = max(positions.level)
T        = setting('approval_org_wide_level')

tiers = []
for L from (Lx + 1) to maxLevel:
    scope = (L >= T) ? 'org' : 'department'
    approvers = Employee::active()
                 ->whereHas('position', level == L)
                 ->when(scope == 'department', sameDepartmentAs($employee))
                 ->where('id', '!=', $employee->id)
                 ->get()
    if approvers not empty:
        tiers[] = { L, label(L), scope, approvers }
return tiers
```

- Lives entirely in the service (no logic in controller/Blade).
- "active" = `status = active` (resigned employees never approve).
- The submitter is always excluded from their own chain.
- Department scope = same `department_id` as the submitter; an employee with no
  department gets an empty department scope (mid tiers resolve to nothing → skipped),
  but org-wide tiers still resolve.

## 5. API & UI

- **Endpoint:** `GET /api/employees/{employee}/approval-chain`
  - Auth: `auth:sanctum`; gated by `employees.view` (super bypasses).
  - Returns `{ data: Tier[] }` via an `ApprovalChainResource` (each approver
    serialized as `{ id, code, name, name_th, position, department }`).
- **Display:** Employee **detail drawer** shows the chain as ascending tier rows,
  each row: tier label + candidate name(s). Empty chain → "No approver above this
  person" / "ไม่มีผู้อนุมัติเหนือกว่า".
- **Position master-data modal:** add a numeric `level` input.

## 6. Config UI

- `approval_org_wide_level` and `approval_level_labels` are editable in a small
  **"Approval"** sub-section under **Settings → Master Data** (do NOT recreate the
  removed Workflow tab / `settings.workflows` permission). Gated by an existing
  settings permission (`settings.masterdata`).
- Sensible seeded defaults so the feature works before anyone visits the config.

## 7. Edge Cases

| Case | Behaviour |
|------|-----------|
| Submitter at top level | Empty chain; UI shows "no approver above". |
| Missing intermediate level | Skipped; chain continues upward. |
| Submitter has no position | `Lx = 0`; chain includes every level above 0 in scope. |
| Submitter has no department | Department-scoped tiers resolve to empty (skipped); org-wide tiers still resolve. |
| Multiple candidates at a tier | All listed as candidates for that tier. |
| Resigned employees | Never appear as approvers. |

## 8. Testing (PHPUnit feature tests)

- Mid-tier resolves within the submitter's department only.
- Top-tier (≥ threshold) resolves org-wide (across departments).
- Empty intermediate level is skipped; chain still reaches the top.
- Submitter at the top level → empty chain.
- Submitter with no position → chain spans all levels above 0.
- Submitter excluded from own chain; resigned employees excluded.
- Endpoint authorization: guest 401; user without `employees.view` 403.

## 9. Components Summary

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `positions.level` migration + model | Store seniority rank | — |
| `ApprovalChainService` | Resolve tiers for an employee | Position level, settings |
| `EmployeeController@approvalChain` + `ApprovalChainResource` | Expose chain over API | service |
| Employee detail drawer (frontend) | Display the chain | API service/hook |
| Position modal + Approval settings (frontend) | Edit level / threshold / labels | settings + master-data APIs |
