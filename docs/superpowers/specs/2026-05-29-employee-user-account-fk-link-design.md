# Design: Employee ↔ User account FK link + remove `login_method`

Date: 2026-05-29
Status: Approved (Option A)

## Problem

`users` and `employees` are linked by a fragile **soft match** on `email`/`username`
(no foreign key). Four different code sites implement that match with
inconsistent null handling:

- `EmployeeResource` (`has_account`, `is_super_admin`) — `where(email)->orWhere(closure username)`
- `EmployeeController::resetPassword` — `where(email)->orWhere(username)` (unguarded null)
- `EmployeeController::credentials` (duplicate check) — `where(email)->when(username, orWhere)`
- `User::linkedEmployee()` / `Employee::linkedUser()` — guarded closures
- `EmployeeController::index` sort + `no_account`/`has_account` filters — raw `EXISTS` subqueries on email/username

Consequences: the link breaks if an email/username is edited, can false-positive,
and the "has account" badge can disagree with what Reset Password actually finds.

The `employees.login_method` column (`email` | `userpass`) is metadata only — it
does **not** drive authentication (login already accepts email or username) — and
adds confusion. It will be removed.

## Goals

- A real database link: a login account references the employee it belongs to.
- One single source of truth for "does this employee have a login account".
- Remove `login_method` everywhere (DB, backend, frontend, seeder, i18n).

## Non-goals

- No change to the existing add → notify → set-credentials **workflow** (already built and correct).
- No change to authentication (login by username or email still works).
- No change to permissions (`employees.add`, `employees.set_credentials` already exist).
- `employees.username` column is **kept** (used for display/search; it is the chosen login username, mirrored from the account).

## Decision — Option A: `users.employee_id` FK

A login account *belongs to* an employee. The account is created after the
employee, so the nullable FK lives on `users`. System-only accounts (e.g. the
bootstrap super admin who is not a real employee) keep `employee_id = null`.

### Data model

`users` table:
- Add `employee_id` — `unsignedBigInteger`, **nullable**, **unique**,
  `foreign('employee_id')->references('id')->on('employees')->nullOnDelete()`.
  - `nullable`: system accounts and not-yet-linked states.
  - `unique`: at most one login account per employee.
  - `nullOnDelete`: deleting an employee leaves the account but unlinks it (no cascade delete of credentials).

`employees` table:
- Drop `login_method`.

### Relationships

- `User::employee(): BelongsTo` → `Employee`.
- `Employee::user(): HasOne` → `User` (`employee_id`).
- Keep method names `User::linkedEmployee()` / `Employee::linkedUser()` as thin
  wrappers over the relationship (so external callers don't break), but they now
  resolve via `employee_id`, not email/username.

### Backfill (in Migration #1, after adding the column)

For each existing user, set `employee_id` to the employee matched by the current
soft-link rule (username first, then email), skipping ambiguous/duplicate matches:

```
for each user u with no employee_id:
    e = employees.where(username = u.username, non-null).first()
        ?? employees.where(email = u.email, non-null).first()
    if e and no other user already linked to e: u.employee_id = e.id
```

Current data maps cleanly (verified): U#1↔EMP-1617, U#2↔EMP-1718, U#3↔EMP-1509,
U#4↔EMP-1305, U#5↔EMP-15. Seeded/system accounts without an employee stay null.

## Code changes

### Backend

- **Migration #1**: add `users.employee_id` (+ FK, unique) and run backfill.
- **Migration #2**: drop `employees.login_method`.
- **`User` model**: add `employee()` relation; `linkedEmployee()` returns `$this->employee`.
- **`Employee` model**: add `user()` relation; `linkedUser()` returns `$this->user`;
  `isSuperAdmin()` → `$this->user?->isSuper() ?? false`; remove `login_method` from `$fillable`.
- **`EmployeeService::createUserWithCredentials`**: set `employee_id => $employee->id`
  on the new user; stop writing `login_method`; keep mirroring `username` to the employee.
- **`EmployeeService` (import path, line ~216)**: stop writing `login_method`.
- **`EmployeeResource`**: `has_account => (bool) $this->user`,
  `is_super_admin => $this->user?->role === 'super'`; remove `login_method` from payload.
  (Eager-load `user` in `index`/`store` queries to avoid N+1.)
- **`EmployeeController::resetPassword`**: `$user = $employee->user;` → null ⇒ `no_account`.
- **`EmployeeController::credentials`**: duplicate check ⇒ `$employee->user()->exists()`.
- **`EmployeeController::index`**: replace the email/username `EXISTS` subquery in the
  ordering and the `no_account` / `has_account` filters with `whereHas('user')` /
  `whereDoesntHave('user')` (and the ordering via a `withExists`/raw exists on `employee_id`).

### Frontend

- Remove `login_method` from `types/index.ts` (the `LoginMethod` type + field) and `orgApi.ts`.
- Remove the "Login method" row in `employee-view-drawer.tsx` and `profile-drawer.tsx`.
- Remove `emp_login_method` (and `emp_login_email` / `emp_login_userpass` if now unused) from `i18n.ts` (EN + TH).
- `has_account` continues to drive the badge and the Reset/Set-credentials buttons (no UI behaviour change).

### Seeder

- `OrgSeeder`: remove `login_method` keys; when creating the seeded accounts, set `users.employee_id` to the matching employee.

## Authentication impact

None. `login_method` is not used by `AuthController`; login resolves by
username/email today and continues unchanged.

## Testing

- Update `AdminProtectionTest` and any test asserting `login_method` or the
  `value_display`-style soft link.
- New/updated feature tests:
  - Creating credentials sets `users.employee_id` and `has_account` becomes true.
  - `resetPassword` succeeds for a linked employee, returns `no_account` for an unlinked one.
  - `credentials` rejects when the employee already has a linked account.
  - `index` `no_account` / `has_account` filters return the correct sets via the FK.
  - Backfill migration links the expected accounts (covered indirectly by seeded data + a focused test if practical).
- Run the full suite before finishing (DB-structure change).

## Rollout / risks

- **Live data**: the user runs the app with real data. Migration #1 must backfill
  before anything relies on `employee_id`; Migration #2 (drop column) is irreversible
  forward but `down()` re-adds `login_method` with its default.
- **Unique constraint**: backfill guards against linking two users to one employee.
- **Order**: #1 (add + backfill) must run before code starts reading `employee_id`;
  deploy migrations + code together.
