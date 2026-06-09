# Employee Sections (หน่วยงาน) — Design

> Status: approved 2026-06-09. Foundation phase. The org chart is intentionally NOT changed here — integrating sections into the org chart is a later, separate phase.

## Goal

Add an organizational level **between Department and Employee**: a **Section** (TH: "หน่วยงาน"). One department contains many sections; an employee may belong to one section (within their department). This lets the org reflect that a department isn't a single flat unit.

```
Department (แผนก) ──< Section (หน่วยงาน) ──< Employee (พนักงาน)
```

## Decisions (from brainstorming)

| Topic | Decision |
|-------|----------|
| Structure | Department → Section → Employee (one new level). Section belongs to exactly one Department. |
| Naming | English **Section** (table `sections`, FK `section_id`); Thai UI label **"หน่วยงาน"**. |
| Employee ↔ dept/section | Keep `employees.department_id` (unchanged) **and** add `employees.section_id` (nullable). The chosen section must belong to the employee's department. |
| Employee form | Pick **Department** first → the **Section** dropdown is filtered to that department's sections (cascading). Changing department clears + reloads sections. |
| Section management | A new **"Sections" (หน่วยงาน) tab** on the Employees page (beside Positions/Departments), not inside the department card. |
| Org chart | **Unchanged** this phase (still the manager-tree). Sections are HR structure, separate from the approval/reporting tree. |
| Section fields | `name`, `name_th` only. No code, no section head (YAGNI — can add later). |
| Required? | Section is **optional** on employees (existing employees have none until assigned). |

## Architecture

### Backend

- **Migration** `create_sections_table`: `id`, `department_id` (FK → departments, `cascadeOnDelete` so deleting a department removes its sections), `name` (string), `name_th` (string, nullable), timestamps.
- **Migration** `add_section_id_to_employees_table`: `section_id` foreignId nullable, `constrained('sections')->nullOnDelete()`, placed `after('department_id')`.
- **Model** `app/Models/Section.php`: `$fillable = ['department_id', 'name', 'name_th']`; `department(): BelongsTo`; `employees(): HasMany`.
- **Model** `Department`: add `sections(): HasMany`.
- **Model** `Employee`: add `'section_id'` to `$fillable`; add `section(): BelongsTo`.
- **Resource** `SectionResource`: `{ id, department_id, name, name_th, department (name), members_count }`.
- **Request** `StoreSectionRequest`: `authorize()` = `canManageOrg()`; rules `department_id` required+exists, `name` required string, `name_th` nullable string.
- **Controller** `Api/SectionController`: `index(Request)` — all sections with `department` + `withCount('employees as members_count')`, optional `?department_id=` filter, ordered by department then name; `store`, `update`, `destroy` (destroy gated by `canManageOrg`, mirrors `DepartmentController`).
- **Routes** (`routes/api.php`, inside `auth:sanctum`): `Route::apiResource('sections', SectionController::class)` (or explicit index/store/update/destroy), following the `departments` pattern.
- **`EmployeeResource`**: add `section_id` and `section` (= `whenLoaded('section', fn () => $this->section?->name)`), and `section_th`.
- **`StoreEmployeeRequest`**: add rule `section_id` → `nullable`, `exists:sections,id`; add a `withValidator` check: if `section_id` present, the section's `department_id` must equal the submitted `department_id` (else error on `section_id`).
- **`EmployeeController`**: eager-load `section` where employees are returned (index/show) so the resource exposes it.

### Frontend

- **Types** (`resources/js/types/index.ts`): `Section { id; department_id; name; name_th: string|null; department?: string; members_count?: number }`. Add `section_id: number | null` and `section: string | null` to `Employee`.
- **API** (`resources/js/services/orgApi.ts`): `sectionApi` = `list(departmentId?)`, `create`, `update`, `remove` (mirror `departmentApi` + `mutate()` helper). Add `section_id` to `EmployeePayload`.
- **Hooks** (`resources/js/hooks/use-org.ts`): `useSections(departmentId?: number | null)` query (key `['sections', departmentId]`); `useSectionMutations()` (create/update/remove, invalidates `['sections']` + employees).
- **Sections tab** `components/employees/sections-tab.tsx`: header ("หน่วยงานทั้งหมด" + Add button) + a table/list of sections showing **Department**, name (+ name_th), members count, edit/delete actions. Add/Edit via a modal.
- **Section modal** `components/employees/section-modal.tsx`: fields — **Department** (`SearchableSelect` of departments, required), name (EN), name_th. Mirrors `department-modal.tsx`.
- **Employee form** (`components/employees/add-employee-drawer.tsx`): add a **Section** `SearchableSelect` after Department. Options come from `useSections(form.department_id)`. When `department_id` changes, reset `section_id` to null. Include `section_id` in the submit payload.
- **Employee view** (`components/employees/employee-view-drawer.tsx`): show the section (under/next to department).
- **Page wiring** (`pages/employees/index.tsx`): add `'sections'` to `TAB_IDS` + the `Tab` union, a `{ id: 'sections', label: t('sub_sections') }` tab entry, and render `<SectionsTab />`. (`?tab=sections` persistence works automatically via the existing `TAB_IDS` mechanism.)
- **i18n** (`resources/js/lib/i18n.ts`): `sub_sections` ('Sections'/'หน่วยงาน'), `section` ('Section'/'หน่วยงาน'), `add_section`, `edit_section`, `section_all_org`, `section_name_en`, `section_name_th`, `section_members`, `section_empty`, `emp_section` ('Section'/'หน่วยงาน') — en + th.

## Testing

- **`tests/Feature/SectionApiTest.php`**: create (gated by permission/role), list filtered by `?department_id`, `members_count` correct, update, delete (cascade behaviour: deleting a department removes its sections; deleting a section nulls `employees.section_id`), auth + permission gates.
- **`tests/Feature/EmployeeApiTest.php`** additions: assigning a valid section in the same department succeeds; a section from a *different* department is rejected (422 on `section_id`); a null section is allowed.
- **Frontend**: no JS test runner — verify with `npx tsc --noEmit`, `npx eslint`, `npm run build`, plus manual smoke (project convention).

## Out of scope (YAGNI / later phases)

- Org chart / approval chain awareness of sections (separate future phase).
- Section code and section head/lead.
- Making section mandatory.
- Department-members drawer grouping by section (can add later).
