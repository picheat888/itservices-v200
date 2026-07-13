# Access Directory + Software — Design Spec

**Date:** 2026-07-13
**Status:** Approved (pending spec review)

## 1. Overview

The existing **Access Control** module tracks which employees have access to
IT resources. Today it covers three resource types — Email Groups, File Shares,
Social Platforms — each a polymorphic parent of `AccessMembership` records
(who was granted, at what level, for what purpose, when, and whether revoked).

Two changes:

1. **Rename the module** from *Access Control* to **Access Directory**
   (TH: *ทะเบียนการเข้าถึง*). The old name collided conceptually with the
   RBAC/Permission module ("access" = in-app permissions), causing confusion.
   Access Directory is a *register of who can reach which IT resources* — a
   different concern from what a role can do inside the app.
2. **Add a fourth resource type: Software** — track which employees hold a
   licence for each piece of software, with licence-seat counting.

Reuse the existing polymorphic membership model and the existing permission
gates (`access.view` for reads, `access.manage` for writes) unchanged.

## 2. Rename (labels only)

No route, icon, or permission changes — purely presentational strings.

- `access_title`: `Access Control` → `Access Directory` / `ทะเบียนการเข้าถึง`
- `access_sub`: update to mention software, e.g.
  `Manage email groups, file shares, social access and software licences` /
  Thai equivalent.
- `perm_mod_access` (Permission module card label): `Access Control` →
  `Access Directory` / `ทะเบียนการเข้าถึง`.
- Route `/access`, sidebar icon (KeyRound), and permissions `access.view` /
  `access.manage` stay exactly as they are.

## 3. Data model — `softwares`

A new resource type mirroring the existing three: an auto-generated `code`
(`SW-0001`, `SW-0002`, …), a `name`, type-specific fields, and a `memberships()`
`morphMany` to `AccessMembership`.

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | |
| code | string, unique | auto `SW-0001` on create (mirrors MG-/FS-/SM-) |
| name | string | required |
| publisher | string, nullable | e.g. "Adobe" |
| version | string, nullable | e.g. "2024" |
| license_type | string (enum-backed) | `perpetual` \| `subscription` \| `free` \| `open_source` |
| seats | unsignedInteger, nullable | total licences; `null` = untracked / unlimited |
| department_id | FK employees' department, nullable | which department owns/budgets it |
| notes | text, nullable | |
| timestamps | | |

**Deliberately no `owner_employee_id`.** Unlike email groups / file shares
(which have a responsible owner), software is IT-managed centrally; a per-item
owner would be noise. The membership list already records who uses it, and
`department_id` covers the "belongs to which team/budget" question.

**Seat counting.** `seats_used` = count of active memberships (not a stored
column — computed). The UI shows `used/total` (e.g. `8/10`). Behaviour when a
grant would exceed `seats`: **soft warning, not a hard block** — surface a
warning in the grant UI but still allow it (seat data is often approximate and
IT needs flexibility). `seats = null` means the count is untracked (show just
the used count, no denominator).

### Membership semantics for software

A membership on a software row means "this employee holds a licence / has it
installed". `access_level` is left blank for software (it carries edition/level
only where meaningful, e.g. file-share Read/Write/Full). `purpose` and
`granted_at` behave as for the other types.

## 4. Backend

Follow the existing Access domain patterns exactly.

- **Enum** `App\Enums\Access\SoftwareLicenseType` — `Perpetual`, `Subscription`,
  `Free`, `OpenSource` (string-backed: `perpetual` / `subscription` / `free` /
  `open_source`).
- **Model** `App\Models\Access\Software` — `$fillable`, `booted()` auto-code
  (`SW-` prefix, mirrors `SocialPlatform`), `memberships(): MorphMany`,
  `department(): BelongsTo`, `license_type` cast to the enum.
- **Migration** — `create_softwares_table` per the schema above.
- **Morph map** — add `'software' => Software::class` to the
  `Relation::enforceMorphMap([...])` block in `AppServiceProvider`.
- **Controller** `App\Http\Controllers\Api\Access\SoftwareController` — mirror
  `SocialPlatformController`: `index`, `store`, `update`, `destroy`, `members`,
  `addMember`, `revokeMember`.
- **Form Request** `App\Http\Requests\Access\StoreSoftwareRequest` — `name`
  required; `license_type` in enum values; `seats` nullable integer ≥ 0;
  `department_id` nullable exists; `publisher` / `version` / `notes` nullable
  strings.
- **Resource** `App\Http\Resources\Access\SoftwareResource` — expose fields plus
  `members_count` and `seats_used` (and `members` where the others include it).
- **Service** `AccessService::employeeAccess()` — add a `'software'` group
  (active memberships where `resource_type = 'software'`).
- **Resource** `EmployeeAccessResource` — add a software section so an
  employee's software licences show on the Employee detail (cross-module peek).
- **Routes** — add software endpoints inside the existing `access.view`
  (index + members reads) and `access.manage` (apiResource writes + add/revoke)
  groups in `routes/api.php`.

## 5. Frontend

- **Types** (`shared/types`) — add `Software`; extend `AccessKind` with
  `'software'`; add a `SoftwareLicenseType` union.
- **API** (`accessApi.ts`) — software list / create / update / delete / members /
  addMember / revokeMember (mirror social-platforms).
- **Hooks** (`use-access.ts`) — `useSoftwares`; `useAccessMutations('software')`.
- **Page** (`access/pages/index.tsx`):
  - New tab **Software** (count badge).
  - New KPI card (software count) — KPI row becomes 5 tiles, or swap one; keep
    the "total grants" tile.
  - Software table: Name (icon tile) · Publisher · License type · Seats
    (`used/total`, with an over-seat visual cue) · Department · Members
    (AvatarStack) · Manage members.
  - Search filter over name / publisher / department.
  - `+ New Software` label + open handler + `openSoftware` → members drawer.
- **Resource modal** (`resource-modal.tsx`) — add software fields to the shared
  form state: `publisher`, `version`, `license_type` (dropdown), `seats`
  (number), `department`, `notes`. `name` required.
- **Members drawer** — reuse as-is; for software the access-level control is
  hidden/optional.
- **i18n** (`lang/en/access.ts` + `lang/th/access.ts`) — module title/subtitle
  rename; software tab / new-button / field labels / licence-type labels /
  seats labels. Permission label `perm_mod_access` in `lang/*/permission.ts`.

## 6. Testing

Feature tests (mirror existing Access tests):

- Software CRUD gated by `access.manage`; reads by `access.view`.
- Auto `code` generation (`SW-0001`, increments).
- Add member / revoke member; a second active grant to the same employee is
  rejected (existing `AccessService::grant` rule).
- `seats_used` reflects active memberships; revoking decrements it.
- Over-seat grant is **allowed** (soft warning is UI-only) — assert it still
  succeeds.
- `employeeAccess()` / Employee detail includes the software group.

## 7. Out of scope (YAGNI)

- No change to the permission structure — `access.view` / `access.manage` stay
  flat (no master/tree treatment).
- No notifications (bell/email) for access grant/revoke.
- No hard seat enforcement (soft warning only).
- No `owner_employee_id` on software.
