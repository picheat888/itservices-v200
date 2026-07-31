# Credentials Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins edit an existing account's username and reset its password (custom or employee-code) with an optional "force password change at next sign-in" switch, on both create and reset.

**Architecture:** A new `users.must_change_password` boolean feeds the existing `password_expired` field in `UserResource`; the app shell already blocks the UI with `ChangePasswordDialog` when that field is true (`resources/js/app/layout/app-shell.tsx:51`), so no auth-frontend changes are needed. A new `PUT /employees/{employee}/credentials` endpoint handles username edits and password resets for existing accounts; the old `POST reset-password` endpoint and `ResetPasswordModal` are removed. Spec: `docs/superpowers/specs/2026-07-30-credentials-management-design.md`.

**Tech Stack:** Laravel 12 + PHPUnit 11 (feature tests), React 19 + TypeScript (employee module), React Query mutations, centralized i18n (`lang/{en,th}/employee.ts`).

## Global Constraints

- PHPUnit classes only (no Pest). Run scoped: `php artisan test --compact <file>`.
- After PHP edits run `vendor/bin/pint --dirty --format agent`; after TS edits run `npx tsc --noEmit` and `npx prettier --write <files>`.
- UI strings via `useT()` keys in `resources/js/lang/{en,th}/employee.ts` — no hardcoded strings.
- Permissions: username edit → `employees.set_credentials`; password reset → `employees.reset_password` (both already exist in `app/Support/Permissions.php`).
- Note: `CheckPasswordExpiry` middleware is currently **not registered anywhere** (dead code). Update its logic for consistency but do NOT register it — enforcement is the `password_expired` flag consumed by the app shell.
- Commit per task; stage specific files (never `git add -A`).

---

### Task 1: Backend — `must_change_password` flag + forced-change plumbing

**Files:**
- Create: `database/migrations/<timestamp>_add_must_change_password_to_users_table.php` (via artisan)
- Modify: `app/Models/User.php` (fillable ~line 36, casts ~line 80)
- Modify: `app/Http/Resources/Auth/UserResource.php:47`
- Modify: `app/Http/Middleware/CheckPasswordExpiry.php` (add flag check)
- Modify: `app/Http/Controllers/Api/Auth/AuthController.php:132-135` (clear flag)
- Test: `tests/Feature/MustChangePasswordTest.php`

**Interfaces:**
- Produces: `users.must_change_password` boolean column (default false); `UserResource.password_expired === must_change_password || isPasswordExpired()`; `PUT /api/password` clears the flag. Task 2 sets this flag from employee endpoints.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MustChangePasswordTest extends TestCase
{
    use RefreshDatabase;

    public function test_flag_marks_password_expired_even_with_policy_off(): void
    {
        $flagged = User::factory()->create(['must_change_password' => true]);
        $this->actingAs($flagged);
        $this->getJson('/api/me')->assertOk()->assertJsonPath('data.password_expired', true);

        $normal = User::factory()->create();
        $this->actingAs($normal);
        $this->getJson('/api/me')->assertOk()->assertJsonPath('data.password_expired', false);
    }

    public function test_changing_own_password_clears_the_flag(): void
    {
        // Factory default password is "password".
        $user = User::factory()->create(['must_change_password' => true]);
        $this->actingAs($user);

        $this->putJson('/api/password', [
            'current_password' => 'password',
            'password' => 'new-secret-123',
            'password_confirmation' => 'new-secret-123',
        ])->assertOk()->assertJsonPath('data.password_expired', false);

        $this->assertFalse((bool) $user->fresh()->must_change_password);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact tests/Feature/MustChangePasswordTest.php`
Expected: FAIL (unknown column `must_change_password`).

- [ ] **Step 3: Create the migration**

Run: `php artisan make:migration add_must_change_password_to_users_table --no-interaction`

```php
public function up(): void
{
    Schema::table('users', function (Blueprint $table) {
        // Admin-driven "force new password at next sign-in" — independent of the expiry policy.
        $table->boolean('must_change_password')->default(false)->after('password_changed_at');
    });
}

public function down(): void
{
    Schema::table('users', function (Blueprint $table) {
        $table->dropColumn('must_change_password');
    });
}
```

Run: `php artisan migrate --no-interaction`

- [ ] **Step 4: Wire the flag through model/resource/middleware/auth**

`app/Models/User.php` — add `'must_change_password'` to `$fillable`; add `'must_change_password' => 'boolean'` to `casts()`.

`app/Http/Resources/Auth/UserResource.php:47`:

```php
'password_expired' => (bool) $this->must_change_password || $this->isPasswordExpired(),
```

`app/Http/Middleware/CheckPasswordExpiry.php` — inside `handle()`, before the policy check:

```php
if ($request->user()?->must_change_password) {
    return response()->json(['message' => 'password_expired'], 403);
}
```

`app/Http/Controllers/Api/Auth/AuthController.php` `changePassword()` — extend the `forceFill`:

```php
$user->forceFill([
    'password' => Hash::make($data['password']),
    'password_changed_at' => now(),
    'must_change_password' => false,
])->save();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php artisan test --compact tests/Feature/MustChangePasswordTest.php`
Expected: PASS (2 tests).

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add database/migrations app/Models/User.php app/Http/Resources/Auth/UserResource.php app/Http/Middleware/CheckPasswordExpiry.php app/Http/Controllers/Api/Auth/AuthController.php tests/Feature/MustChangePasswordTest.php
git commit -m "feat(employee): must_change_password flag drives the forced change-password flow"
```

---

### Task 2: Backend — `PUT /employees/{employee}/credentials` + create-flow `force_change`, remove `reset-password`

**Files:**
- Modify: `app/Http/Controllers/Api/Employee/EmployeeController.php` (replace `resetPassword()` ~line 420 with `updateCredentials()`; extend `credentials()` ~line 444)
- Modify: `app/Services/Employee/EmployeeService.php:55-71` (`createUserWithCredentials`)
- Modify: `routes/api.php:91` (replace POST reset-password route with PUT credentials)
- Modify: `tests/Feature/EmployeeAccountLinkTest.php:56-69` (retarget old reset test)
- Test: `tests/Feature/EmployeeCredentialsManageTest.php`

**Interfaces:**
- Consumes: `users.must_change_password` from Task 1.
- Produces: `PUT /api/employees/{id}/credentials` accepting `{ username? }` and/or `{ reset_password: true, password?, force_change? }`; returns `{ message: 'success', new_password? }`; 422 `{ message: 'no_account' }` without an account. `POST /api/employees/{id}/credentials` additionally accepts `force_change: bool`. Frontend (Task 3) calls both.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class EmployeeCredentialsManageTest extends TestCase
{
    use RefreshDatabase;

    private function makeEmployeeWithAccount(string $code = 'EMP-7001', string $username = 'old_name'): Employee
    {
        $employee = Employee::create(['code' => $code, 'first_name' => 'Cred', 'last_name' => 'Test', 'username' => $username]);
        User::factory()->create(['employee_id' => $employee->id, 'username' => $username]);

        return $employee;
    }

    public function test_username_change_updates_user_and_employee(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = $this->makeEmployeeWithAccount();

        $this->putJson("/api/employees/{$employee->id}/credentials", ['username' => 'new_name'])->assertOk();

        $this->assertSame('new_name', $employee->fresh()->user->username);
        $this->assertSame('new_name', $employee->fresh()->username);
    }

    public function test_username_unique_ignores_own_account_but_rejects_others(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = $this->makeEmployeeWithAccount();
        User::factory()->create(['username' => 'taken_name']);

        // Re-submitting the current username is fine.
        $this->putJson("/api/employees/{$employee->id}/credentials", ['username' => 'old_name'])->assertOk();
        // Someone else's username is rejected.
        $this->putJson("/api/employees/{$employee->id}/credentials", ['username' => 'taken_name'])
            ->assertStatus(422)->assertJsonValidationErrors('username');
    }

    public function test_reset_defaults_to_employee_code_and_custom_password_wins(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = $this->makeEmployeeWithAccount('EMP-7002', 'reset_me');

        $this->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true])
            ->assertOk()->assertJsonPath('new_password', 'EMP-7002');
        $this->assertTrue(Hash::check('EMP-7002', $employee->fresh()->user->password));

        $this->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true, 'password' => 'custom-secret'])
            ->assertOk()->assertJsonPath('new_password', 'custom-secret');
        $this->assertTrue(Hash::check('custom-secret', $employee->fresh()->user->password));
    }

    public function test_force_change_flag_is_set_and_cleared_per_reset(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = $this->makeEmployeeWithAccount('EMP-7003', 'force_me');

        $this->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true, 'force_change' => true])->assertOk();
        $user = $employee->fresh()->user;
        $this->assertTrue((bool) $user->must_change_password);
        $this->assertNull($user->password_changed_at);

        $this->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true, 'force_change' => false])->assertOk();
        $this->assertFalse((bool) $employee->fresh()->user->must_change_password);
    }

    public function test_endpoint_rejects_employee_without_account_and_empty_payload(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $bare = Employee::create(['code' => 'EMP-7004', 'first_name' => 'No', 'last_name' => 'Account']);

        $this->putJson("/api/employees/{$bare->id}/credentials", ['username' => 'whatever'])
            ->assertStatus(422)->assertJsonPath('message', 'no_account');

        $withAccount = $this->makeEmployeeWithAccount('EMP-7005', 'noop_user');
        $this->putJson("/api/employees/{$withAccount->id}/credentials", [])->assertStatus(422);
    }

    public function test_field_level_permission_gates(): void
    {
        // Role with reset_password but NOT set_credentials.
        $role = Role::firstOrCreate(['key' => 'pw_only'], ['name' => 'PW Only']);
        RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => 'employees.reset_password'], ['allowed' => true]);
        $this->actingAs(User::factory()->create(['role' => 'pw_only']));
        $employee = $this->makeEmployeeWithAccount('EMP-7006', 'gate_user');

        $this->putJson("/api/employees/{$employee->id}/credentials", ['username' => 'sneaky'])->assertForbidden();
        $this->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true])->assertOk();
    }

    public function test_create_credentials_accepts_force_change(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $employee = Employee::create(['code' => 'EMP-7007', 'first_name' => 'New', 'last_name' => 'Account']);

        $this->postJson("/api/employees/{$employee->id}/credentials", [
            'username' => 'fresh_user',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
            'force_change' => true,
        ])->assertCreated();

        $user = $employee->fresh()->user;
        $this->assertTrue((bool) $user->must_change_password);
        $this->assertNull($user->password_changed_at);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact tests/Feature/EmployeeCredentialsManageTest.php`
Expected: FAIL (route `PUT .../credentials` not defined; `force_change` ignored).

- [ ] **Step 3: Implement backend changes**

`routes/api.php` — replace line 91 (`POST employees/{employee}/reset-password`) with:

```php
Route::put('employees/{employee}/credentials', [EmployeeController::class, 'updateCredentials'])->name('api.employees.credentials.update');
```

`app/Services/Employee/EmployeeService.php` — extend `createUserWithCredentials`:

```php
public function createUserWithCredentials(Employee $employee, string $username, string $password, bool $mustChangePassword = false): User
{
    $user = User::create([
        'name' => $employee->name,
        'email' => $employee->email ?: null,
        'username' => $username,
        'password' => Hash::make($password),
        // null marks the password as "never set by the user" so the forced-change flow fires.
        'password_changed_at' => $mustChangePassword ? null : now(),
        'must_change_password' => $mustChangePassword,
        'role_id' => $this->resolveGroupRole($employee),
        'employee_id' => $employee->id,
    ]);

    // Mirror the username onto the employee for display/search.
    $employee->update(['username' => $username]);

    return $user;
}
```

`app/Http/Controllers/Api/Employee/EmployeeController.php` — in `credentials()` add `'force_change' => ['sometimes', 'boolean']` to the validate array and pass it through:

```php
$this->service->createUserWithCredentials($employee, $data['username'], $data['password'], $request->boolean('force_change'));
```

Replace the whole `resetPassword()` method with (add `use Illuminate\Validation\Rule;` import):

```php
/**
 * Manage an existing login account: change the username and/or reset the password.
 * Field-level permissions — username requires employees.set_credentials, password
 * reset requires employees.reset_password. Replaces the old reset-password endpoint.
 */
public function updateCredentials(Request $request, Employee $employee): JsonResponse
{
    $user = $employee->user;
    if (! $user) {
        return response()->json(['message' => 'no_account'], 422);
    }

    $data = $request->validate([
        'username' => ['sometimes', 'required', 'string', 'max:255', Rule::unique('users', 'username')->ignore($user->id)],
        'reset_password' => ['sometimes', 'boolean'],
        'password' => ['nullable', 'string', 'min:6'],
        'force_change' => ['sometimes', 'boolean'],
    ]);

    $changingUsername = array_key_exists('username', $data);
    $resetting = $request->boolean('reset_password');
    abort_unless($changingUsername || $resetting, 422, 'Nothing to update.');

    if ($changingUsername) {
        abort_unless((bool) $request->user()?->hasPermission('employees.set_credentials'), 403);
        $user->update(['username' => $data['username']]);
        // Mirror onto the employee for display/search (same as account creation).
        $employee->update(['username' => $data['username']]);
        AuditLog::record('Changed username', "{$employee->name} ({$employee->code})");
    }

    $newPassword = null;
    if ($resetting) {
        abort_unless((bool) $request->user()?->hasPermission('employees.reset_password'), 403);
        $force = $request->boolean('force_change');
        $newPassword = filled($data['password'] ?? null) ? $data['password'] : $employee->code;
        $user->forceFill([
            'password' => Hash::make($newPassword),
            'password_changed_at' => $force ? null : now(),
            'must_change_password' => $force,
        ])->save();
        AuditLog::record('Reset password', "{$employee->name} ({$employee->code})");
    }

    return response()->json(array_filter(['message' => 'success', 'new_password' => $newPassword]));
}
```

`tests/Feature/EmployeeAccountLinkTest.php:56-69` — rename `test_reset_password_uses_fk_link` to `test_credentials_update_uses_fk_link` and retarget:

```php
$this->putJson("/api/employees/{$linked->id}/credentials", ['reset_password' => true])
    ->assertOk()->assertJsonPath('new_password', 'EMP-9003');

$this->putJson("/api/employees/{$unlinked->id}/credentials", ['reset_password' => true])
    ->assertStatus(422)->assertJsonPath('message', 'no_account');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php artisan test --compact tests/Feature/EmployeeCredentialsManageTest.php tests/Feature/EmployeeAccountLinkTest.php tests/Feature/MustChangePasswordTest.php`
Expected: PASS.

- [ ] **Step 5: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/Employee/EmployeeController.php app/Services/Employee/EmployeeService.php routes/api.php tests/Feature/EmployeeCredentialsManageTest.php tests/Feature/EmployeeAccountLinkTest.php
git commit -m "feat(employee): PUT credentials endpoint (username edit + reset with force-change); drop reset-password"
```

---

### Task 3: Frontend — API/hooks, i18n keys, force-change switch on the create dialog

**Files:**
- Modify: `resources/js/modules/employee/api/employeeApi.ts` (setCredentials payload; add `updateCredentials`; remove `resetPassword`)
- Modify: `resources/js/modules/employee/hooks/use-employees.ts` (swap `resetPassword` → `updateCredentials`)
- Modify: `resources/js/modules/employee/components/set-credentials-modal.tsx` (switch)
- Modify: `resources/js/lang/en/employee.ts`, `resources/js/lang/th/employee.ts`

**Interfaces:**
- Consumes: Task 2 endpoints.
- Produces: `employeeApi.updateCredentials(id, payload: UpdateCredentialsPayload)` where `UpdateCredentialsPayload = { username?: string; reset_password?: boolean; password?: string; force_change?: boolean }`, returning `{ message: string; new_password?: string }`; `useEmployeeMutations().updateCredentials`. Task 4's modal calls these.

- [ ] **Step 1: employeeApi.ts**

Replace the `resetPassword` entry with:

```ts
/** Manage an existing account: change username and/or reset the password (returns new_password when reset). */
updateCredentials: async (id: number, payload: UpdateCredentialsPayload) => {
    await ensureCsrf();
    const { data } = await http.put<{ message: string; new_password?: string }>(`/employees/${id}/credentials`, payload);
    return data;
},
```

Add near the other payload types:

```ts
/** PUT /employees/{id}/credentials — username edit and/or password reset for an existing account. */
export interface UpdateCredentialsPayload {
    username?: string;
    reset_password?: boolean;
    password?: string;
    force_change?: boolean;
}
```

Extend `setCredentials` signature so the create flow can pass the switch:

```ts
setCredentials: async (id: number, payload: { username: string; password: string; password_confirmation: string; force_change: boolean }) => {
```

(body unchanged — payload is already posted as-is).

- [ ] **Step 2: use-employees.ts**

In `useEmployeeMutations()` replace the `resetPassword` mutation with:

```ts
updateCredentials: useMutation({
    mutationFn: (v: { id: number; payload: UpdateCredentialsPayload }) => employeeApi.updateCredentials(v.id, v.payload),
    onSuccess: invalidate,
}),
```

and extend the `setCredentials` mutationFn param type with `force_change: boolean` (pass through unchanged). Import `type UpdateCredentialsPayload` from `../api/employeeApi`.

- [ ] **Step 3: i18n keys**

Append to `resources/js/lang/en/employee.ts` (before `};`):

```ts
// ── Credentials management (emp_cred_*) ──
emp_cred_manage_title: 'Manage Account',
emp_cred_username_section: 'Username',
emp_cred_username_saved: 'Username updated',
emp_cred_reset_section: 'Reset Password',
emp_cred_reset_hint: 'Leave blank to use the employee code',
emp_cred_force_change: 'Require a password change at next sign-in',
emp_cred_reset_btn: 'Reset Password',
```

Append to `resources/js/lang/th/employee.ts`:

```ts
// ── Credentials management (emp_cred_*) ──
emp_cred_manage_title: 'จัดการบัญชี',
emp_cred_username_section: 'Username',
emp_cred_username_saved: 'บันทึกชื่อผู้ใช้แล้ว',
emp_cred_reset_section: 'Reset Password',
emp_cred_reset_hint: 'เว้นว่างเพื่อใช้รหัสพนักงาน',
emp_cred_force_change: 'บังคับเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป',
emp_cred_reset_btn: 'Reset Password',
```

- [ ] **Step 4: set-credentials-modal.tsx — force-change switch**

Import `Switch` from `@/shared/ui/switch`. Add state (reset it in the existing `useEffect` alongside the other fields):

```ts
const [forceChange, setForceChange] = useState(true);
```

Below the confirm-password `<Field>` (before the error box) add:

```tsx
<div className="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
    <span className="text-sm">{t('emp_cred_force_change')}</span>
    <Switch checked={forceChange} onChange={setForceChange} aria-label={t('emp_cred_force_change')} />
</div>
```

Extend the submit call:

```ts
await setCredentials.mutateAsync({ id: employee.id, username: username.trim(), password, password_confirmation: confirm, force_change: forceChange });
```

Note: `setCredentials.mutateAsync` takes `{ id, ...payload }` today — keep that call shape consistent with the hook's param type from Step 2.

- [ ] **Step 5: Verify + commit**

```bash
npx tsc --noEmit
npx prettier --write resources/js/modules/employee/api/employeeApi.ts resources/js/modules/employee/hooks/use-employees.ts resources/js/modules/employee/components/set-credentials-modal.tsx resources/js/lang/en/employee.ts resources/js/lang/th/employee.ts
git add resources/js/modules/employee/api/employeeApi.ts resources/js/modules/employee/hooks/use-employees.ts resources/js/modules/employee/components/set-credentials-modal.tsx resources/js/lang/en/employee.ts resources/js/lang/th/employee.ts
git commit -m "feat(employee): updateCredentials api/hook, force-change switch on account creation"
```

(tsc will fail if anything still references `resetPassword` — `pages/index.tsx` and `reset-password-modal.tsx` still do at this point; Task 4 removes them. If running tsc here reports only those two files, proceed — Task 4's tsc run is the real gate. Alternatively execute Tasks 3+4 back-to-back before the tsc gate.)

---

### Task 4: Frontend — ManageCredentialsModal, drawer/page wiring, delete the old modal

**Files:**
- Create: `resources/js/modules/employee/components/manage-credentials-modal.tsx`
- Modify: `resources/js/modules/employee/pages/index.tsx` (~line 52 import, ~line 585 render)
- Modify: `resources/js/modules/employee/components/employee-view-drawer.tsx` (footer button ~line 607)
- Delete: `resources/js/modules/employee/components/reset-password-modal.tsx`

**Interfaces:**
- Consumes: `useEmployeeMutations().updateCredentials` (Task 3), `useAuth().can()`, i18n keys `emp_cred_*` (Task 3), existing keys `reset_password_new`, `reset_password_success`, `cred_username`, `save`, `saving`, `cancel`, `close`.
- Produces: `<ManageCredentialsModal employee={Employee | null} onClose={() => void} />`.

- [ ] **Step 1: Create manage-credentials-modal.tsx**

```tsx
import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { Field } from '@/shared/components/field';
import type { Employee } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { useUiStore } from '@/stores/ui';
import { Check, Copy, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEmployeeMutations } from '../hooks/use-employees';

/**
 * "จัดการบัญชี" dialog for an employee who already has a login account.
 * Two independent sections, gated per permission:
 *  - Username (employees.set_credentials): edit + save the login name.
 *  - Reset password (employees.reset_password): optional custom password
 *    (blank = employee code) + a force-change-at-next-sign-in switch;
 *    reveals the new password with copy after a reset.
 */
export function ManageCredentialsModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { can } = useAuth();
    const { updateCredentials } = useEmployeeMutations();

    const canUsername = can('employees.set_credentials');
    const canReset = can('employees.reset_password');

    const [username, setUsername] = useState('');
    const [usernameSaved, setUsernameSaved] = useState(false);
    const [password, setPassword] = useState('');
    const [forceChange, setForceChange] = useState(true);
    const [newPassword, setNewPassword] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    // Reset per employee opened (skip on close so content survives the exit animation).
    useEffect(() => {
        if (!employee) return;
        setUsername(employee.username ?? '');
        setUsernameSaved(false);
        setPassword('');
        setForceChange(true);
        setNewPassword(null);
        setError('');
        setCopied(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employee?.id]);

    const saveUsername = async () => {
        if (!employee || !username.trim()) return;
        setError('');
        setUsernameSaved(false);
        try {
            await updateCredentials.mutateAsync({ id: employee.id, payload: { username: username.trim() } });
            setUsernameSaved(true);
        } catch (e: unknown) {
            const data = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
            setError(data?.errors?.username ? t('cred_err_username_taken') : (data?.message ?? t('cred_err_generic')));
        }
    };

    const resetPassword = async () => {
        if (!employee) return;
        setError('');
        try {
            const res = await updateCredentials.mutateAsync({
                id: employee.id,
                payload: { reset_password: true, password: password.trim() || undefined, force_change: forceChange },
            });
            setNewPassword(res.new_password ?? null);
        } catch (e: unknown) {
            const data = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
            setError(data?.errors?.password?.[0] ?? data?.message ?? t('cred_err_generic'));
        }
    };

    const copyPw = () => {
        if (!newPassword) return;
        try {
            navigator.clipboard?.writeText(newPassword);
        } catch {
            /* clipboard may be unavailable */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const empName = employee ? (lang === 'th' ? (employee.name_th ?? employee.name) : employee.name) : '';

    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="text-brand h-5 w-5" />
                        {t('emp_cred_manage_title')}
                    </DialogTitle>
                    <DialogDescription>
                        {empName}
                        {employee?.code ? ` (${employee.code})` : ''}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* ── Username ── */}
                    {canUsername && (
                        <section className="space-y-2">
                            <div className="text-muted-foreground text-[10.5px] font-bold tracking-wider uppercase">
                                {t('emp_cred_username_section')}
                            </div>
                            <div className="flex items-center gap-2">
                                <Input value={username} onChange={(e) => setUsername(e.target.value)} className="font-mono" autoComplete="off" />
                                <Button onClick={saveUsername} disabled={updateCredentials.isPending || !username.trim()}>
                                    {updateCredentials.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : usernameSaved ? <Check className="h-4 w-4" /> : null}
                                    {usernameSaved ? t('saved') : t('save')}
                                </Button>
                            </div>
                            {usernameSaved && <p className="text-xs text-emerald-600 dark:text-emerald-400">{t('emp_cred_username_saved')}</p>}
                        </section>
                    )}

                    {canUsername && canReset && <div className="bg-border h-px" />}

                    {/* ── Reset password ── */}
                    {canReset && (
                        <section className="space-y-3">
                            <div className="text-muted-foreground text-[10.5px] font-bold tracking-wider uppercase">
                                {t('emp_cred_reset_section')}
                            </div>
                            {!newPassword ? (
                                <>
                                    <Field label={t('reset_password_new')}>
                                        <Input
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="font-mono"
                                            placeholder={employee?.code ?? ''}
                                            autoComplete="new-password"
                                        />
                                    </Field>
                                    <p className="text-muted-foreground text-xs">{t('emp_cred_reset_hint')}</p>
                                    <div className="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                                        <span className="text-sm">{t('emp_cred_force_change')}</span>
                                        <Switch checked={forceChange} onChange={setForceChange} aria-label={t('emp_cred_force_change')} />
                                    </div>
                                    <Button className="w-full" variant="outline" onClick={resetPassword} disabled={updateCredentials.isPending}>
                                        {updateCredentials.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                                        {t('emp_cred_reset_btn')}
                                    </Button>
                                </>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-muted-foreground text-sm">{t('reset_password_success')}</p>
                                    <div className="border-border bg-muted/50 flex items-center gap-2 rounded-lg border px-3 py-2">
                                        <span className="flex-1 font-mono text-sm font-semibold tracking-wider">{newPassword}</span>
                                        <button type="button" onClick={copyPw} className="text-muted-foreground hover:text-foreground transition-colors">
                                            {copied ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {error && <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">{error}</div>}
                </div>

                <div className="flex justify-end">
                    <Button variant="outline" onClick={onClose}>
                        {t('close')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 2: Wire pages/index.tsx**

Replace the import (`~line 52`):

```ts
import { ManageCredentialsModal } from '../components/manage-credentials-modal';
```

Replace the render (`~line 585`):

```tsx
<ManageCredentialsModal employee={resetPwEmp} onClose={() => setResetPwEmp(null)} />
```

(the `resetPwEmp` state and the drawer's `onResetPassword` callback keep their names — they now open the manage dialog.)

- [ ] **Step 3: Drawer footer button**

In `employee-view-drawer.tsx` footer, replace the Reset Password button block:

```tsx
{(canResetPassword || canSetCredentials) && emp.has_account && (
    <Button variant="outline" onClick={() => onResetPassword(emp)}>
        <ShieldCheck className="h-4 w-4" />
        {t('emp_cred_manage_title')}
    </Button>
)}
```

(`RefreshCw` import becomes unused — remove it; `ShieldCheck` is already imported.)

- [ ] **Step 4: Delete the old modal**

```powershell
Remove-Item "resources\js\modules\employee\components\reset-password-modal.tsx" -Confirm:$false
```

Grep to confirm nothing references `reset-password-modal` or `resetPassword` mutation anymore:
`grep -rn "reset-password-modal\|resetPassword" resources/js` → expect no matches (backend route name strings don't appear in JS).

- [ ] **Step 5: Verify + commit**

```bash
npx tsc --noEmit
npx prettier --write resources/js/modules/employee/components/manage-credentials-modal.tsx resources/js/modules/employee/components/employee-view-drawer.tsx resources/js/modules/employee/pages/index.tsx
php artisan test --compact tests/Feature/EmployeeCredentialsManageTest.php tests/Feature/EmployeeAccountLinkTest.php tests/Feature/MustChangePasswordTest.php
git add resources/js/modules/employee/components/manage-credentials-modal.tsx resources/js/modules/employee/pages/index.tsx resources/js/modules/employee/components/employee-view-drawer.tsx
git rm resources/js/modules/employee/components/reset-password-modal.tsx
git commit -m "feat(employee): Manage Account dialog (username edit + reset w/ force-change); remove ResetPasswordModal"
```
