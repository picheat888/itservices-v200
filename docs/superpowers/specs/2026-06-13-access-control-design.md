# Access Control — Design Spec (Phase 1: Registry + Members)

**Date:** 2026-06-13
**Module:** Access Control (new) — part of the Inaba IT Service Desk
**Status:** Approved design, pending implementation plan

## 1. Purpose

Track which IT resources each employee can access, so IT can answer "what does this
person have access to?" and, when someone resigns, know exactly what to revoke.

Three resource registries:

1. **Email distribution groups** — mailing lists (e.g. `qa-team@inaba.co.th`)
2. **File shares** — shared folders (e.g. `\\FILES\Recipes\Plant1`)
3. **Social / internet platforms** — managed catalogue of platforms (Facebook, LINE, …) with who may use each

Each registry tracks **members** with a per-type access level, who granted it, and when.

**Phase 1 = registry + membership management + the per-employee Access view.**
Access *requests* and their approval workflow are **out of scope** (they belong to the
future Request/Workflow module) and are explicitly deferred.

## 2. Decisions (locked)

| Topic | Decision |
|---|---|
| Scope | Registry + members only. No request/approval workflow this phase. |
| Data model | **Three resource tables + one polymorphic `access_memberships` table.** |
| Permissions | New permission group: `access.view` (read), `access.manage` (write). |
| Offboarding | **Soft-revoke** (`granted_at` + `revoked_at`). Resign does not auto-revoke; the employee's Access tab surfaces still-active memberships as "outstanding / to revoke" with revoke / revoke-all actions (gated by `access.manage`). |

## 3. Data model

### 3.1 `email_groups`
| column | type | notes |
|---|---|---|
| id | bigint pk | |
| code | string unique | auto `MG-####` (sequential, in `booted()`) |
| name | string | |
| email | string unique | the distribution address |
| department_id | bigint FK nullable | `nullOnDelete`; null = company-wide ("Multiple") |
| description | string nullable | |
| owner_employee_id | bigint FK employees nullable | `nullOnDelete`; the responsible owner |
| timestamps | | |

### 3.2 `file_shares`
| column | type | notes |
|---|---|---|
| id | bigint pk | |
| code | string unique | auto `FS-####` |
| name | string | |
| path | string | UNC path, e.g. `\\FILES\Recipes\Plant1` |
| department_id | bigint FK nullable | `nullOnDelete` |
| size_label | string nullable | free text, e.g. `48 GB` (display only) |
| owner_employee_id | bigint FK employees nullable | `nullOnDelete` |
| timestamps | | |

### 3.3 `social_platforms`
| column | type | notes |
|---|---|---|
| id | bigint pk | |
| code | string unique | auto `SM-####` |
| name | string | Facebook / LINE / … |
| url | string nullable | |
| color | string nullable | hex brand colour for the UI dot |
| policy | text nullable | usage policy text |
| timestamps | | |

No owner — it is a catalogue. Access is per-member.

### 3.4 `access_memberships` (polymorphic)
| column | type | notes |
|---|---|---|
| id | bigint pk | |
| resource_type | string | morph: `EmailGroup` / `FileShare` / `SocialPlatform` |
| resource_id | bigint | |
| employee_id | bigint FK employees | `cascadeOnDelete` |
| access_level | string nullable | per type — email: `Owner`/`Member` · fileshare: `Full`/`Write`/`Read` · social: null |
| purpose | string nullable | social: why they have access (e.g. "Brand page admin") |
| granted_at | date | |
| granted_by | bigint FK users nullable | `nullOnDelete`; who granted it |
| revoked_at | date nullable | soft-revoke; **active = `revoked_at IS NULL`** |
| timestamps | | |

- Indexes: `(resource_type, resource_id)`, `(employee_id, revoked_at)`.
- A member may be re-granted after revocation → history rows allowed. Uniqueness is
  enforced in application logic on the **active** row only (no DB partial-unique to
  keep it portable across MySQL/MariaDB/sqlite): granting when an active row exists is
  rejected by the form request.

### 3.5 Access-level rules (validated in form requests)
- EmailGroup membership: `access_level ∈ {Owner, Member}` (required).
- FileShare membership: `access_level ∈ {Full, Write, Read}` (required).
- SocialPlatform membership: `access_level` null; `purpose` optional string.

## 4. Backend

### 4.1 Models
- `EmailGroup`, `FileShare`, `SocialPlatform`: `morphMany(AccessMembership, 'resource')`;
  `belongsTo(Department)`; `belongsTo(Employee, 'owner_employee_id')` (first two only);
  auto-code in `booted()` (mirrors `Position`/`Section` `PST-`/`SEC-` pattern).
- `AccessMembership`: `morphTo('resource')`, `belongsTo(Employee)`, `belongsTo(User, 'granted_by')`.
  Scope `active()` → `whereNull('revoked_at')`. Casts `granted_at`/`revoked_at` to date.

### 4.2 Services
- `AccessService` — membership operations in one place:
  - `grant(resource, employee, attrs)` → rejects if an active membership exists.
  - `revoke(membership)` → set `revoked_at = today` (idempotent).
  - `employeeAccess(employee)` → active (and, for resigned, outstanding) memberships
    grouped by resource type, eager-loaded for the Access tab.

### 4.3 Permissions
- Seed `access.view` and `access.manage` into the permission registry used by the
  Permission Management module (follow how `employees.*` / `settings.*` are registered
  — likely a permissions catalogue config/seeder). Assign to the Administrator/IT roles
  by default in the role seeder.

### 4.4 Form Requests
- `StoreEmailGroupRequest`, `StoreFileShareRequest`, `StoreSocialPlatformRequest`
  (authorize → `access.manage`; validate fields + unique code/email).
- `StoreAccessMembershipRequest` — validates `employee_id` exists, `access_level` per
  resource type, no duplicate active membership.

### 4.5 Controllers (`app/Http/Controllers/Api/`)
- `EmailGroupController`, `FileShareController`, `SocialPlatformController`:
  `index / store / update / destroy` + nested member actions:
  - `POST {resource}/{id}/members` — grant
  - `PUT {resource}/{id}/members/{membership}` — change level/purpose
  - `POST {resource}/{id}/members/{membership}/revoke` — soft-revoke
  - `DELETE {resource}/{id}/members/{membership}` — hard remove (mistakes)
- `AccessController@employee` — `GET employees/{employee}/access` → grouped membership
  payload for the Access tab (and `outstanding` flag when the employee is resigned).
- Reads gated `permission:access.view`; writes `permission:access.manage`.
  Destroying a resource is **blocked while it has active members** (422 with a clear
  message), mirroring the Position/Section delete-guard. Revoke members first.

### 4.6 API Resources
- `EmailGroupResource`, `FileShareResource`, `SocialPlatformResource` (include
  `members_count` of active members + owner summary).
- `AccessMembershipResource` (employee summary, level, purpose, granted_at, revoked_at).
- `EmployeeAccessResource` — `{ email_groups:[], file_shares:[], social:[], outstanding: bool }`.

### 4.7 Routes (`routes/api.php`, under `auth:sanctum`)
```
Route::middleware('permission:access.view')->group(function () {
    Route::get('email-groups', ...); Route::get('file-shares', ...); Route::get('social-platforms', ...);
    Route::get('employees/{employee}/access', [AccessController::class, 'employee']);
});
Route::middleware('permission:access.manage')->group(function () {
    apiResource writes for the three registries + member actions
});
```

## 5. Frontend

### 5.1 Shared
- `resources/js/types/index.ts` — `EmailGroup`, `FileShare`, `SocialPlatform`,
  `AccessMembership`, `EmployeeAccess`.
- `resources/js/services/accessApi.ts` — axios calls.
- `resources/js/hooks/use-access.ts` — React Query queries + mutations (invalidate on write).

### 5.2 Access Control page
- New page with **three sub-tabs** (Email groups / File shares / Social), each a
  `DataTable` of resources (code, name, key field, owner, member count, actions).
- Row → a **members drawer** (right Sheet): owner picker (email/file), member list with
  level dropdown + revoke, "add member" (employee searchable-select + level/purpose).
- Add/edit resource via a modal per type.
- Menu placement: under the **Employees** area (same section as Departments/Sections/Positions)
  — it is org/people-access data. (Open to moving to Settings if preferred.)

### 5.3 Employee detail → "Access" tab
- The redesigned employee dialog (cover + Overview + Organization tabs, already built)
  gains a third tab **"Access"** (shield icon, count = active memberships), shown when
  the viewer has `access.view`.
- Renders grouped sections exactly like the design's access pane: Email groups / File
  shares / Social, each row = resource + the employee's level/purpose + granted date.
- When the employee is **resigned**, active memberships render as **outstanding** with a
  revoke button per row + "revoke all" (only if `access.manage`).
- Data from `GET /employees/{id}/access`.

### 5.4 i18n
- EN + TH keys for the page, tabs, levels, member actions, revoke/outstanding copy.

## 6. Out of scope (future)
- Access **requests** + approval workflow (`access_requests`, `workflows`) — belongs to
  the Request/Workflow module. The membership model is designed so a future request, on
  approval, simply calls `AccessService::grant(...)`.

## 7. Testing
- Feature tests (`tests/Feature/`):
  - Permission gating: `access.view` for reads, `access.manage` for writes; forbidden otherwise.
  - CRUD per registry + auto-code (`MG-`/`FS-`/`SM-`).
  - Grant membership; duplicate active grant rejected; change level; **soft-revoke** sets
    `revoked_at` and drops it from active/`members_count`; re-grant after revoke allowed.
  - `GET employees/{id}/access` returns grouped active memberships; resigned employee
    payload sets `outstanding = true`.
  - Resource delete blocked while it has active members (422).

## 8. File touch-list (for the plan)
- **Migrations:** `email_groups`, `file_shares`, `social_platforms`, `access_memberships`.
- **Models:** EmailGroup, FileShare, SocialPlatform, AccessMembership.
- **Service:** AccessService.
- **Requests:** Store{EmailGroup,FileShare,SocialPlatform,AccessMembership}Request.
- **Controllers:** EmailGroupController, FileShareController, SocialPlatformController, AccessController.
- **Resources:** {EmailGroup,FileShare,SocialPlatform,AccessMembership,EmployeeAccess}Resource.
- **Routes:** access read/write groups in `routes/api.php`.
- **Permissions:** register `access.view` / `access.manage` + assign in role seeder.
- **Seeder:** demo registries + members (mirror the design's data.js sample) in `OrgSeeder` or a new `AccessSeeder`.
- **Frontend:** types, accessApi, use-access, Access Control page + sub-tabs + members drawer + resource modals, Access tab in `employee-view-drawer.tsx`, i18n.
