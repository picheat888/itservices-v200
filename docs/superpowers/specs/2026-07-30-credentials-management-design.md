# Credentials Management — Design

**Date:** 2026-07-30
**Module:** Employee
**Status:** Approved

## Problem

- After an account is provisioned (username + password), an admin has no way to change the username.
- "Reset Password" silently sets the password to the employee code with `password_changed_at = now()`, which *defeats* the forced-change mechanism — the employee keeps using the code as their password indefinitely.
- The Add Employee flow promises "They'll be asked to change it on first sign-in", but that only happens when the `password_expiry_days` policy is enabled.

## Decisions (from brainstorming)

1. Force-change is a **per-action choice**: a small switch on both the create-credentials dialog and the reset-password action (default ON).
2. One consolidated **"จัดการบัญชี" (Manage account) dialog** for existing accounts replaces the footer Reset Password button: username edit + password reset in one place.
3. On reset the admin **may type a custom password**; leaving it blank falls back to the employee code.

## Backend

### 1. `users.must_change_password` flag

- Migration: `ALTER TABLE users ADD must_change_password BOOLEAN DEFAULT FALSE` (new migration, nullable-safe default).
- Independent of the `password_expiry_days` policy.

### 2. Forced-change plumbing (reuses the existing expiry flow)

- `UserResource`: `password_expired` becomes `must_change_password || isPasswordExpired()` — the existing `ChangePasswordDialog` on the frontend fires with **zero auth-frontend changes**.
- `CheckPasswordExpiry` middleware: also returns `403 password_expired` when `must_change_password` is set (before the policy check, so it works with the policy off).
- `AuthController@changePassword`: clears `must_change_password` on success (alongside the existing `password_changed_at = now()`).

### 3. Endpoints

- **New `PUT /employees/{employee}/credentials`** (`EmployeeController@updateCredentials`) — manage an existing account:
  - `username` (optional): change the login name. Requires `employees.set_credentials`. Unique against `users.username` ignoring the employee's own user.
  - `password` (optional, min 6, confirmed) + `force_change` (boolean): reset the password. `password` omitted/blank → employee code. Requires `employees.reset_password`. Sets `must_change_password = force_change` and `password_changed_at = null` when forcing.
  - 422 `no_account` when the employee has no user.
  - Response includes `new_password` when a reset happened (so the dialog can reveal/copy it).
- **`POST /employees/{employee}/credentials`** (create, existing): accepts a new `force_change` boolean; sets the flag on the created user.
- **Removed:** `POST /employees/{employee}/reset-password` + `EmployeeController@resetPassword` — superseded by the PUT endpoint. Frontend `ResetPasswordModal` is deleted with it.

## Frontend (Employee module)

- **New `manage-credentials-modal.tsx`** — per approved mockup:
  - Username section (visible with `employees.set_credentials`): input prefilled with the current username + Save.
  - Reset section (visible with `employees.reset_password`): password input (placeholder: employee code), force-change switch (default ON), Reset button; on success reveals the new password with copy, like the old reset modal.
- **Drawer footer:** "Reset Password" button becomes "จัดการบัญชี" (Manage account); visible when `emp.has_account && (canResetPassword || canSetCredentials)`.
- **`set-credentials-modal.tsx` (create):** adds the force-change switch (default ON), passes `force_change` to the POST.
- **API/hooks:** `employeeApi.updateCredentials(id, payload)`; `useEmployeeMutations` gains `updateCredentials`, drops `resetPassword`.
- **i18n:** new keys under `emp_cred_*` in `lang/{en,th}/employee.ts`.

## Tests (Feature)

- Username change: happy path, uniqueness (taken by another user → 422), ignores own username, permission gate.
- Password reset via PUT: blank password defaults to employee code; custom password respected; `force_change` sets `must_change_password` and next `changePassword` clears it.
- Middleware: request with `must_change_password` set → 403 `password_expired` even with the expiry policy off.
- Create credentials with `force_change: true` → flag set on the new user.
- No-account employee → 422 on PUT.

## Out of scope

- Password strength policy, password history, self-service username change, notification e-mails.
