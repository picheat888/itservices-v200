# Employee ↔ User account FK link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile email/username "soft link" between `users` and `employees` with a real `users.employee_id` foreign key, and remove the unused `employees.login_method` column.

**Architecture:** A login account *belongs to* an employee via a nullable, unique `users.employee_id` FK (system-only accounts stay null). All "has this employee an account?" checks resolve through Eloquent relationships (`Employee::user()` / `User::employee()`) instead of matching email/username. Login behaviour is unchanged. The add → notify-credential-setters → set-credentials workflow already exists and is not modified.

**Tech Stack:** Laravel 12, PHPUnit, React 19 + TypeScript, MySQL.

Spec: `docs/superpowers/specs/2026-05-29-employee-user-account-fk-link-design.md`

---

## File Structure

- `database/migrations/<ts>_add_employee_id_to_users_table.php` — new: FK column + backfill
- `database/migrations/<ts>_drop_login_method_from_employees_table.php` — new: drop column
- `app/Models/User.php` — add `employee()` relation, `employee_id` fillable, rewrite `linkedEmployee()`
- `app/Models/Employee.php` — add `user()` relation, rewrite `linkedUser()` + `isSuperAdmin()`, drop `login_method` fillable
- `app/Services/EmployeeService.php` — set `employee_id` on credential creation, drop `login_method` writes
- `app/Http/Resources/EmployeeResource.php` — resolve via relation, drop `login_method` payload
- `app/Http/Controllers/Api/EmployeeController.php` — `resetPassword`, `credentials`, `index` use the relation; eager-load `user`
- `database/seeders/OrgSeeder.php` — link demo users via `employee_id`, drop `login_method`
- `resources/js/types/index.ts`, `resources/js/services/orgApi.ts` — drop `login_method` / `LoginMethod`
- `resources/js/components/employees/employee-view-drawer.tsx`, `resources/js/components/shell/profile-drawer.tsx` — drop "Login method" row
- `resources/js/lib/i18n.ts` — drop `emp_login_method` / `emp_login_email` / `emp_login_userpass`
- `tests/Feature/EmployeeAccountLinkTest.php` — new feature tests

---

## Task 1: Add `users.employee_id` FK + model relationships

**Files:**
- Create: `database/migrations/2026_05_29_120000_add_employee_id_to_users_table.php`
- Modify: `app/Models/User.php`, `app/Models/Employee.php`
- Test: `tests/Feature/EmployeeAccountLinkTest.php`

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/EmployeeAccountLinkTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeeAccountLinkTest extends TestCase
{
    use RefreshDatabase;

    public function test_employee_and_user_resolve_each_other_through_the_fk(): void
    {
        $employee = Employee::create(['code' => 'EMP-9001', 'name' => 'Test Person', 'email' => 'tp@x.test']);
        $user = User::factory()->create(['employee_id' => $employee->id]);

        $this->assertSame($user->id, $employee->fresh()->user->id);
        $this->assertSame($employee->id, $user->fresh()->employee->id);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter test_employee_and_user_resolve_each_other_through_the_fk`
Expected: FAIL — `Unknown column 'employee_id'` / `Call to undefined method ...user()`.

- [ ] **Step 3: Create the migration**

`database/migrations/2026_05_29_120000_add_employee_id_to_users_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('employee_id')->nullable()->unique()->after('id')
                ->constrained()->nullOnDelete();
        });

        // Backfill: link each existing account to the employee it matches by
        // username (preferred) then email, skipping employees already linked
        // so the unique constraint is never violated.
        foreach (DB::table('users')->whereNull('employee_id')->get() as $user) {
            $employeeId = null;
            if (! empty($user->username)) {
                $employeeId = DB::table('employees')->where('username', $user->username)->value('id');
            }
            if (! $employeeId && ! empty($user->email)) {
                $employeeId = DB::table('employees')->where('email', $user->email)->value('id');
            }
            if ($employeeId && ! DB::table('users')->where('employee_id', $employeeId)->exists()) {
                DB::table('users')->where('id', $user->id)->update(['employee_id' => $employeeId]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('employee_id');
        });
    }
};
```

- [ ] **Step 4: Add the `employee()` relation + fillable to `User`**

In `app/Models/User.php`: ensure `use Illuminate\Database\Eloquent\Relations\BelongsTo;` is imported, add `'employee_id'` to the `$fillable` array, and add:

```php
/** The employee this login account belongs to (null for system-only accounts). */
public function employee(): BelongsTo
{
    return $this->belongsTo(Employee::class);
}
```

Then replace the body of `linkedEmployee()` with:

```php
public function linkedEmployee(): ?Employee
{
    return $this->employee;
}
```

(Keep the `Employee` import already present.)

- [ ] **Step 5: Add the `user()` relation to `Employee`**

In `app/Models/Employee.php`: add `use Illuminate\Database\Eloquent\Relations\HasOne;`, and add:

```php
/** The login account linked to this employee, or null if none. */
public function user(): HasOne
{
    return $this->hasOne(User::class);
}
```

Then replace the body of `linkedUser()` with `return $this->user;` and `isSuperAdmin()` with `return $this->user?->isSuper() ?? false;`.

- [ ] **Step 6: Run test to verify it passes**

Run: `php artisan test --compact --filter test_employee_and_user_resolve_each_other_through_the_fk`
Expected: PASS

- [ ] **Step 7: Format + commit**

```bash
vendor/bin/pint --dirty --format agent
git add database/migrations/2026_05_29_120000_add_employee_id_to_users_table.php app/Models/User.php app/Models/Employee.php tests/Feature/EmployeeAccountLinkTest.php
git commit -m "feat(employees): add users.employee_id FK + relationships"
```

---

## Task 2: Link the account on credential creation

**Files:**
- Modify: `app/Services/EmployeeService.php`
- Test: `tests/Feature/EmployeeAccountLinkTest.php`

- [ ] **Step 1: Write the failing test**

Add to `tests/Feature/EmployeeAccountLinkTest.php`:

```php
public function test_setting_credentials_links_the_account_via_fk(): void
{
    $this->actingAs(User::factory()->create(['role' => 'super']));
    $employee = Employee::create(['code' => 'EMP-9002', 'name' => 'New Hire', 'email' => 'nh@x.test']);

    $this->postJson("/api/employees/{$employee->id}/credentials", [
        'username' => 'newhire',
        'password' => 'secret123',
        'password_confirmation' => 'secret123',
    ])->assertCreated();

    $user = User::where('username', 'newhire')->first();
    $this->assertNotNull($user);
    $this->assertSame($employee->id, $user->employee_id);
    $this->assertTrue($employee->fresh()->user()->exists());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter test_setting_credentials_links_the_account_via_fk`
Expected: FAIL — `employee_id` is null (not set yet).

- [ ] **Step 3: Set `employee_id` in `createUserWithCredentials`**

In `app/Services/EmployeeService.php`, change the `User::create([...])` call inside `createUserWithCredentials` to include `'employee_id' => $employee->id,` and change the employee update to drop `login_method`:

```php
$user = User::create([
    'name' => $employee->name,
    'email' => $employee->email ?: null,
    'username' => $username,
    'password' => Hash::make($password),
    'password_changed_at' => now(),
    'role' => $roleKey,
    'employee_id' => $employee->id,
]);

// Mirror the username onto the employee for display/search.
$employee->update(['username' => $username]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact --filter test_setting_credentials_links_the_account_via_fk`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/EmployeeService.php tests/Feature/EmployeeAccountLinkTest.php
git commit -m "feat(employees): link account to employee on credential creation"
```

---

## Task 3: Resolve has_account / resetPassword / credentials via the relation

**Files:**
- Modify: `app/Http/Resources/EmployeeResource.php`, `app/Http/Controllers/Api/EmployeeController.php`
- Test: `tests/Feature/EmployeeAccountLinkTest.php`

- [ ] **Step 1: Write the failing tests**

Add to `tests/Feature/EmployeeAccountLinkTest.php`:

```php
public function test_reset_password_uses_fk_link(): void
{
    $this->actingAs(User::factory()->create(['role' => 'super']));

    $linked = Employee::create(['code' => 'EMP-9003', 'name' => 'Linked', 'email' => 'l@x.test']);
    User::factory()->create(['employee_id' => $linked->id]);
    $unlinked = Employee::create(['code' => 'EMP-9004', 'name' => 'Unlinked', 'email' => 'u@x.test']);

    $this->postJson("/api/employees/{$linked->id}/reset-password")
        ->assertOk()->assertJsonPath('new_password', 'EMP-9003');

    $this->postJson("/api/employees/{$unlinked->id}/reset-password")
        ->assertStatus(422)->assertJsonPath('message', 'no_account');
}

public function test_has_account_flag_reflects_fk(): void
{
    $this->actingAs(User::factory()->create(['role' => 'super']));

    $linked = Employee::create(['code' => 'EMP-9005', 'name' => 'HasAcct', 'email' => 'h@x.test']);
    User::factory()->create(['employee_id' => $linked->id]);

    $this->getJson("/api/employees/{$linked->id}")
        ->assertOk()->assertJsonPath('data.has_account', true);
}

public function test_credentials_rejected_when_already_linked(): void
{
    $this->actingAs(User::factory()->create(['role' => 'super']));
    $employee = Employee::create(['code' => 'EMP-9006', 'name' => 'Dup', 'email' => 'd@x.test']);
    User::factory()->create(['employee_id' => $employee->id]);

    $this->postJson("/api/employees/{$employee->id}/credentials", [
        'username' => 'dupuser', 'password' => 'secret123', 'password_confirmation' => 'secret123',
    ])->assertStatus(422);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact --filter EmployeeAccountLinkTest`
Expected: the three new tests FAIL (still matching by email/username).

- [ ] **Step 3: Update `EmployeeResource`**

In `app/Http/Resources/EmployeeResource.php` replace the `$linkedUser = User::where(...)...` block with `$linkedUser = $this->user;`, remove the `'login_method' => $this->login_method,` line from the returned array, and keep `'has_account' => (bool) $linkedUser,` and `'is_super_admin' => $linkedUser?->role === 'super',`. Remove the now-unused `use App\Models\User;` import if nothing else uses it.

- [ ] **Step 4: Update `resetPassword` and `credentials`**

In `app/Http/Controllers/Api/EmployeeController.php`:

`resetPassword` — replace the `User::where(...)` lookup with:

```php
$user = $employee->user;

if (! $user) {
    return response()->json(['message' => 'no_account'], 422);
}
```

`credentials` — replace the `$alreadyHasAccount = User::where(...)->exists();` block with:

```php
if ($employee->user()->exists()) {
    return response()->json(['message' => 'Employee already has a login account.'], 422);
}
```

Remove the now-unused `use App\Models\User;` import if nothing else in the controller uses it (the `index` query still references the `users` table only via subqueries removed in Task 4, so verify before deleting the import).

- [ ] **Step 5: Run tests to verify they pass**

Run: `php artisan test --compact --filter EmployeeAccountLinkTest`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Resources/EmployeeResource.php app/Http/Controllers/Api/EmployeeController.php tests/Feature/EmployeeAccountLinkTest.php
git commit -m "feat(employees): resolve account link via FK in resource + reset/credentials"
```

---

## Task 4: Employee list ordering + has_account/no_account filters via FK

**Files:**
- Modify: `app/Http/Controllers/Api/EmployeeController.php`
- Test: `tests/Feature/EmployeeAccountLinkTest.php`

- [ ] **Step 1: Write the failing test**

Add to `tests/Feature/EmployeeAccountLinkTest.php`:

```php
public function test_index_filters_by_account_via_fk(): void
{
    $this->actingAs(User::factory()->create(['role' => 'super']));

    $withAcct = Employee::create(['code' => 'EMP-9007', 'name' => 'WithAcct', 'email' => 'wa@x.test']);
    User::factory()->create(['employee_id' => $withAcct->id]);
    $without = Employee::create(['code' => 'EMP-9008', 'name' => 'WithoutAcct', 'email' => 'wo@x.test']);

    $hasCodes = collect($this->getJson('/api/employees?page=1&status=has_account')->json('data'))->pluck('code');
    $noCodes = collect($this->getJson('/api/employees?page=1&status=no_account')->json('data'))->pluck('code');

    $this->assertTrue($hasCodes->contains('EMP-9007'));
    $this->assertFalse($hasCodes->contains('EMP-9008'));
    $this->assertTrue($noCodes->contains('EMP-9008'));
    $this->assertFalse($noCodes->contains('EMP-9007'));
}
```

- [ ] **Step 2: Run test to verify it fails or errors**

Run: `php artisan test --compact --filter test_index_filters_by_account_via_fk`
Expected: FAIL — old subqueries match by email/username, not `employee_id` (the seeded factory user has no matching email/username).

- [ ] **Step 3: Update the `index` ordering + filters**

In `app/Http/Controllers/Api/EmployeeController.php` `index()`:

Replace the ordering line:

```php
->orderByRaw('EXISTS(SELECT 1 FROM users WHERE users.employee_id = employees.id)')
```

Replace the `no_account` branch body with:

```php
$query->where('status', 'active')->whereDoesntHave('user');
```

Replace the `has_account` branch body with:

```php
$query->where('status', 'active')->whereHas('user');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact --filter test_index_filters_by_account_via_fk`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/EmployeeController.php tests/Feature/EmployeeAccountLinkTest.php
git commit -m "feat(employees): filter/sort directory by account via FK relation"
```

---

## Task 5: Drop `login_method` (DB + backend + seeder)

**Files:**
- Create: `database/migrations/2026_05_29_120100_drop_login_method_from_employees_table.php`
- Modify: `app/Models/Employee.php`, `app/Services/EmployeeService.php`, `database/seeders/OrgSeeder.php`

- [ ] **Step 1: Create the drop migration**

`database/migrations/2026_05_29_120100_drop_login_method_from_employees_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('login_method');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('login_method')->default('email')->after('phone');
        });
    }
};
```

- [ ] **Step 2: Remove `login_method` from `Employee` fillable**

In `app/Models/Employee.php`, remove `'login_method',` from the `$fillable` array.

- [ ] **Step 3: Remove the `login_method` write in the import path**

In `app/Services/EmployeeService.php`, find the employee-import array (currently around line 216) and delete the `'login_method' => 'email',` entry. (The `createUserWithCredentials` write was already removed in Task 2.)

- [ ] **Step 4: Update `OrgSeeder`**

In `database/seeders/OrgSeeder.php`: add `use App\Models\User;` at the top. Remove `'login_method' => 'email',` from the employee `updateOrCreate` array. Replace `linkDemoAccounts()` with:

```php
private function linkDemoAccounts(): void
{
    $links = [
        'EMP-1617' => 'super', // Wichai Suwannarat
        'EMP-1718' => 'it',    // Kanya Phakdee
        'EMP-1509' => 'hr',    // Ratana Klinprathum
        'EMP-1305' => 'user',  // Pimchanok Wongwai
    ];
    foreach ($links as $code => $username) {
        $employee = Employee::where('code', $code)->first();
        if (! $employee) {
            continue;
        }
        $employee->update(['username' => $username]);
        User::where('username', $username)->update(['employee_id' => $employee->id]);
    }
}
```

- [ ] **Step 5: Migrate fresh + seed, then run the account-link tests**

Run: `php artisan migrate:fresh --seed`
Then: `php artisan test --compact --filter EmployeeAccountLinkTest`
Expected: migration succeeds with no `login_method` column; tests PASS.

- [ ] **Step 6: Commit**

```bash
vendor/bin/pint --dirty --format agent
git add database/migrations/2026_05_29_120100_drop_login_method_from_employees_table.php app/Models/Employee.php app/Services/EmployeeService.php database/seeders/OrgSeeder.php
git commit -m "feat(employees): drop login_method column and its writes"
```

---

## Task 6: Remove `login_method` from the frontend

**Files:**
- Modify: `resources/js/types/index.ts`, `resources/js/services/orgApi.ts`, `resources/js/components/employees/employee-view-drawer.tsx`, `resources/js/components/shell/profile-drawer.tsx`, `resources/js/lib/i18n.ts`

- [ ] **Step 1: Remove the type**

In `resources/js/types/index.ts`: remove `login_method: LoginMethod;` from the `Employee` interface (line ~78) and remove the `LoginMethod` type definition. (Search the file for `LoginMethod` to find both.)

- [ ] **Step 2: Remove the API type field**

In `resources/js/services/orgApi.ts`: remove the `login_method?: 'email' | 'userpass';` line (~36).

- [ ] **Step 3: Remove the view-drawer row**

In `resources/js/components/employees/employee-view-drawer.tsx`: remove the line rendering `<Row label={t('emp_login_method')} value={...} />` (~101).

- [ ] **Step 4: Remove the profile-drawer row + const**

In `resources/js/components/shell/profile-drawer.tsx`: remove the `const loginMethod = ...` line (~86) and the `<Row label={t('emp_login_method')} value={emp ? loginMethod : undefined} />` line (~229).

- [ ] **Step 5: Remove the i18n keys**

In `resources/js/lib/i18n.ts`: remove `emp_login_method` from both EN (~250) and TH (~902). Search for `emp_login_email` and `emp_login_userpass`; if they are no longer referenced anywhere (`grep -rn "emp_login_email\|emp_login_userpass" resources/js`), remove those keys too (EN + TH).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `login_method` / `LoginMethod` / `emp_login_method`.

- [ ] **Step 7: Commit**

```bash
git add resources/js/types/index.ts resources/js/services/orgApi.ts resources/js/components/employees/employee-view-drawer.tsx resources/js/components/shell/profile-drawer.tsx resources/js/lib/i18n.ts
git commit -m "feat(employees): remove login_method from the UI"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Update any test still referencing the old behaviour**

Run: `grep -rn "login_method" tests/ app/` — expect no results. If a test (e.g. `AdminProtectionTest`) references `login_method` or asserts the old soft-link, update it to the FK relation.

- [ ] **Step 2: Run the full backend suite**

Run: `php artisan test --compact`
Expected: all tests pass.

- [ ] **Step 3: Frontend build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Final commit (if Step 1 changed anything)**

```bash
vendor/bin/pint --dirty --format agent
git add -A tests/
git commit -m "test: update employee tests for FK account link"
```

---

## Notes for the implementer

- **Live data:** the user runs the app with real data. Do NOT run `migrate:fresh` against their working DB outside the test environment. Task 5 Step 5 uses `migrate:fresh --seed` only to verify; the real deployment runs `php artisan migrate` (forward) so Migration #1's backfill links existing accounts in place.
- `User::factory()` already exists and accepts `['employee_id' => ...]` once `employee_id` is fillable (Task 1).
- `Employee::create([...])` auto-generates `code` if blank, but the tests pass explicit codes for clarity.
