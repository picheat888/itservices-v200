# Design: 1 User = 1 Role Group + Review-on-Move

**Date:** 2026-05-29
**Module:** Permission Management → Role Groups
**Approach:** A — DB unique index + "move-on-assign" (keeps existing pivot/relations)

## Problem

Role Group membership is currently many-to-many: an employee can belong to
several groups at once (the demo seeds everyone into "All Staff" plus their
department team). The business rule is that **an employee may belong to exactly
one Role Group**. In addition, when an admin reassigns an employee who already
belongs to a group, the UI must show a **review dialog summarising the move**
(and the resulting permission-role change) before it is committed.

## Current State (verified)

- `GroupRole` has `employees()` (pivot `group_role_employee`) and `departments()`
  (pivot `group_role_department`).
- `Employee::groupRoles()` reads **only** from `group_role_employee`. Therefore
  department assignment does **not** currently grant real group membership — it
  is already informational / a quick-add convenience.
- Assigning an employee to a group sets `User.role` to that group's role
  (`GroupRoleController::syncUserRoles`). Removing resets to another group's role
  or `'user'` (`resetRoleForOrphans`).
- `guardSuperGroup` restricts who may manage the `super` (Administrator) group:
  only a super user can add/remove members of a super-role group.
- The modal `resources/js/components/permissions/group-role-modal.tsx` edits one
  group's member list (individual picker + department expand → add members) and
  saves via a single `sync`.

## Decisions (from brainstorming)

1. **Department assignment** stays as a quick-add / informational feature only.
   No schema or behaviour change needed — it is already non-membership.
2. **Existing data migration:** each employee keeps the group whose `role`
   matches their linked `User.role`; if none matches (or no linked user), keep
   the default group (All Staff); detach all other memberships.
3. **Review dialog timing:** summarised on **Save**. One dialog listing every
   employee being moved (from-group → to-group, old role → new role); OK commits
   all, Cancel returns to the modal.
4. **Removed-without-reassignment:** an employee removed from their only group
   **falls back to the default group (All Staff)** and takes its role, preserving
   the invariant "every employee has exactly one group." (Approved — this changes
   the previous behaviour of resetting to bare role `user`.)

## Design

### 1. Data model / DB

- **Migration** (single file, ordered):
  1. **Reconcile** existing rows: for each employee in `group_role_employee`,
     determine the surviving group:
     - the group whose `role` equals the employee's linked `User.role`
       (matched via the employee's `email` or `username`), else
     - the default group from `AppSetting('default_employee_group_id')`
       (All Staff), else
     - the lowest-id group the employee is currently in (last-resort, so the
       unique index can be created).
     Delete the employee's other `group_role_employee` rows.
  2. **Add unique index** on `group_role_employee.employee_id`.
- `group_role_department` is untouched.
- `down()`: drop the unique index. (The reconcile is not reversible — note this
  in the migration; reversing only removes the constraint.)

### 2. Backend — `GroupRoleController`

- **`store` / `update`:** wrap membership writes in a `DB::transaction`.
  Implement **move-on-assign**: before syncing this group's `employee_ids`,
  detach those employee ids from `group_role_employee` rows belonging to **other**
  groups. Then `sync` this group's members as today.
- Keep `syncUserRoles($group, $newEmployeeIds)` — moved employees get this
  group's role.
- **Orphan fallback:** when an employee is removed from this group and not added
  to another in the same request, attach them to the **default group** instead
  of leaving them group-less, and set their `User.role` to the default group's
  role. Replace the current `resetRoleForOrphans` "→ role user" behaviour with
  this fallback. If this group *is* the default group, the employee simply has no
  group and role resets to `'user'` (cannot fall back into itself).
- Keep `guardSuperGroup` — the move logic must respect it: a non-super user
  cannot move a member into or out of a super-role group.
- **No new endpoint** for the review: the modal already loads all groups (with
  `employee_ids` and `role`) via `useGroupRoles`, so the frontend can compute the
  moves and role labels locally.

### 3. Frontend — review dialog (`group-role-modal.tsx`)

- On **Save**, before mutating, compute `moves`:
  - For each selected `empId`, find whether it currently belongs to a **different**
    group (scan the cached groups list, excluding the group being edited).
  - For each such employee build `{ name, fromGroup, fromRole, toGroup, toRole }`
    using role labels from the permission matrix.
- If `moves.length > 0`: open a **Review Dialog** (reuse the existing `Dialog`
  component) listing each move as `Name — FromGroup [FromRoleLabel] → ToGroup
  [ToRoleLabel]`, with a short note that the employee's permission role will
  change. Footer: **Cancel** (back to modal) / **OK** (run the mutation).
- If `moves.length === 0`: submit directly (current behaviour).
- After a successful mutation the groups query is invalidated (existing hook
  behaviour), so the old groups visibly lose the moved members.

### 4. Demo seeder — `OrgSeeder::seedGroupRoles`

- Assign each demo employee to exactly **one** group (no overlap):
  - **Administrator** (super): the super demo account's employee (Wichai / username `super`).
  - **IT Team** (admin): IT-department employees **except** anyone already placed
    in a higher group (e.g. Kanya).
  - **HR Team** (hr): HR-department employees (Ratana).
  - **All Staff** (user): every remaining active employee.
- Use `sync` semantics so re-running the seeder converges to single membership.
- All Staff remains the recorded default group (`default_employee_group_id`).

### 5. Testing (backend feature tests, PHPUnit)

- Assigning an employee already in group A into group B **moves** them: A loses
  the member, B gains it, and `User.role` becomes B's role.
- The unique index prevents an employee from holding two `group_role_employee`
  rows.
- The reconcile migration reduces a multi-group employee to the single correct
  group (role-matching, else default).
- Removing an employee from a non-default group **falls back** to All Staff with
  All Staff's role.
- Removing from the default group leaves them group-less with role `'user'`.
- `guardSuperGroup` still blocks a non-super actor from moving members into/out of
  the Administrator group.
- The frontend review dialog is verified manually (no FE test harness in repo);
  backend tests cover the move/role outcomes it triggers.

## Out of Scope

- Replacing the pivot with a single `employees.group_role_id` column (Approach C).
- Changing the department feature beyond confirming it is non-membership.
- Frontend automated tests (none exist in the project).
