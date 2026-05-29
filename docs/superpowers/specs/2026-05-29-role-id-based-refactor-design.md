# Design: id-based role references (roles ↔ users / group_roles / role_permissions)

Date: 2026-05-29
Status: Approved (design); pending spec review

## Problem

`roles` is referenced by its **string `key`** from three tables, with no foreign keys:
`users.role`, `group_roles.role`, `role_permissions.role`. The user wants the
**database references to use `roles.id`** (real numeric FKs), and the logic
reviewed/updated end-to-end.

Current data (DB `itservices_v200`): roles = `super`(id1, is_system), `admin`(2),
`hr`(3), `user`(4). No orphan role values. All four role columns are
`varchar(255) utf8mb4_unicode_ci`.

## Goal

- In the database, tables reference a role by **`role_id` → `roles.id`** (FK), not by the string key.
- Backend joins/queries resolve roles through Eloquent relationships on `role_id`.
- FK integrity: can't orphan a role; deleting a role is controlled.
- Logic reviewed and updated everywhere (backend + frontend) with no behaviour regressions.

## Critical constraint (shapes the whole design)

`roles.key` **must stay** and remains the **semantic identifier**. Reason: code
decides meaning by key, e.g. `isSuper()` means "key === 'super'". It can NOT use
`role_id` for that, because **ids are not stable** across environments / reseeds
(id 1 = super here, but not guaranteed elsewhere). So:

- The numeric `role_id` is used only for **DB references (FKs/joins)**.
- The string `key` is used for **meaning** (`isSuper`, default-permission mapping in `Permissions.php`, role gating).
- `User` gains a `role()` relation; `isSuper()` becomes `$this->role?->key === 'super'`. The authenticated user's `role` is eager-loaded to keep auth checks (called very frequently) fast.

### API / Frontend boundary decision (PLEASE REVIEW)

The frontend has 40+ checks like `user.role === 'super'` plus nav role-gating
(`roles: ['super','admin','hr']`). Making the FE compare `role_id` would be
**unsafe** (unstable ids) and pointless. Therefore:

- **The API keeps identifying a role to the client by its `key` string.**
  `UserResource.role` stays the **key** (e.g. `'super'`) and we ADD `role_id`.
  The permission-matrix and group-role endpoints keep accepting/returning the
  role **key** on the wire; controllers translate key→id internally.
- **Result: the frontend keeps its current key-based logic and needs almost no
  change** (only type tweaks + adding `role_id` where useful). The id-based part
  is the database + backend internals.

This satisfies "database references use id" while keeping the client safe and
stable. If you instead want the client itself to send/compare numeric ids
(higher risk, larger FE rewrite), say so at spec review and the plan will expand.

## Data model changes (migrations, forward-only)

Migration A — add nullable `role_id` + FK + backfill, on each of the three tables:

- `users.role_id` → `roles.id`, **RESTRICT on delete**, NOT NULL after backfill.
- `group_roles.role_id` → `roles.id`, **RESTRICT on delete**, nullable (a group may have no role).
- `role_permissions.role_id` → `roles.id`, **CASCADE on delete**, NOT NULL after backfill; replace the `unique(role, permission)` index with `unique(role_id, permission)`.

Backfill (in the same migration, after adding the column):
```
UPDATE <table> t JOIN roles r ON r.key = t.role SET t.role_id = r.id;
```
(No orphans exist, verified, so every row resolves.)

Migration B — finalize:
- Make `users.role_id` and `role_permissions.role_id` NOT NULL.
- Drop the old string columns `users.role`, `group_roles.role`, `role_permissions.role`.

`roles` table itself is unchanged (keeps `id`, `key`, `name`, `color`, `is_system`).

## Backend changes

- **`User`**: add `role(): BelongsTo` (→ Role). Add `'role_id'` to `$fillable`, remove `'role'`.
  - `isSuper()` → `$this->role?->key === 'super'`.
  - `hasRole($keys)` → `in_array($this->role?->key, $keys, true)`.
  - `roleName()` → `$this->role?->name ?? …`.
  - `permissions()` → `RolePermission::where('role_id', $this->role_id)…`.
  - Eager-load `role` for the authenticated user (e.g. in the auth resolver / `me` + middleware paths) so per-request permission checks don't N+1.
- **`Role`**: `members()` → `User::where('role_id', $this->id)->count()`. Add `users()` / `groupRoles()` / `rolePermissions()` relations as needed.
- **`GroupRole`**: replace `'role'` fillable with `'role_id'`; add `role(): BelongsTo`. `resolveGroupRole`/role resolution returns the related role (id for writes, key for meaning).
- **`RolePermission`**: `'role'` → `'role_id'` fillable; add `role(): BelongsTo`.
- **`GroupRoleController`**:
  - `setUserRole` / move logic: set `users.role_id` from the group's `role_id`.
  - index payload: `role` (key, from relation) + `role_id` + `role_label` (name).
  - store/update: accept `role` key OR `role_id` from client (key preferred for FE stability) → resolve to `role_id`. Validation `role` `exists:roles,key`.
- **`RoleController`**: keep routing/identifying by `key` (FE stability). On destroy, the `role_permissions` CASCADE removes the manual `RolePermission::where('role',$key)->delete()` (drop that line). Keep the friendly `members() > 0` guard. Add a guard: block delete if any `group_roles.role_id` references it (RESTRICT would otherwise throw a raw FK error).
- **`RolePermissionController`**: matrix read/write keyed by role **key** on the wire; resolve key→`role_id` when querying/writing `role_permissions`.
- **`EmployeeService`**: `createUserWithCredentials` sets `role_id` (resolved from the group's role) instead of `role`. `resolveGroupRole` returns the role_id (+ fallback to the `user` role id).
- **`EmployeeResource`**: `is_super_admin` → `$linkedUser?->role?->key === 'super'` (eager-load `user.role`).
- **`UserResource`**: expose `role` = `$this->role?->key`, plus `role_id` and existing label logic via the relation.

## Frontend changes (minimal — stays key-based)

- **Types** (`types/index.ts`): `User.role` stays the key string; add `role_id?: number`. Keep the `Role` key union but allow custom string keys.
- No change to the 40+ `user.role === 'super'` checks, nav role-gating, `permissions/index.tsx` `g.role === 'super'`, `login.tsx` demo `a.role` — they keep using the key.
- **`permissionApi` / `use-permissions`**: unchanged on the wire (role identified by key). `RoleRow.value` stays the key.
- **`group-role-modal`**: unchanged — keeps sending `role` (key); backend resolves to id.
- Add `role_id` to the relevant TS interfaces only where the API now returns it (optional, non-breaking).

## Testing

- New `RoleReferenceTest`: relations resolve (`user->role`, `group->role`, `rolePermission->role`); `isSuper()`/`hasPermission()` work via `role_id`+key; `Role::members()` counts via `role_id`.
- Update every test/seeder that sets `role` to set `role_id` (or keep passing the key through a factory helper that resolves it). `UserFactory` must set `role_id` (resolve/seed a default role).
- Verify: `GroupRoleController` move flow updates `users.role_id`; `RolePermissionController` matrix read/write; role delete CASCADE on `role_permissions` + RESTRICT/guard on `group_roles`+`users`.
- Run the full suite (this touches auth). All green before finishing.

## Rollout / risks

- **Live data**: deploy with `php artisan migrate` (forward). Migration A backfills `role_id` before Migration B drops the string columns. NEVER `migrate:fresh` on the real DB.
- **Auth hot-path**: must eager-load the authenticated user's `role` or permission checks regress to N+1. Covered explicitly above.
- **UserFactory / seeders**: every place creating a user/group/role-permission must provide a valid `role_id`; ensure the `roles` rows exist first (DatabaseSeeder seeds roles before users — verify order).
- **Two-step migration**: A (add+backfill, nullable) then B (not-null + drop) so the backfill can't fail on a not-null column.
