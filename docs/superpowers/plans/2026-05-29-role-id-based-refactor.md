# id-based Role References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `users`, `group_roles`, and `role_permissions` reference a role by a numeric `role_id` FK → `roles.id` (instead of the string `roles.key`), while keeping `roles.key` as the semantic identifier for code/API.

**Architecture:** Two forward migrations (add `role_id`+FK+backfill, then drop the old string columns). Backend resolves roles through Eloquent relations on `role_id`; the role **key** is still used for meaning (`isSuper`, permission catalog, the wire/API contract). A `UserFactory` shim translates a passed `role` key → `role_id` so the existing test suite barely changes. Frontend stays key-based.

**Tech Stack:** Laravel 12, PHPUnit, MySQL (live data — forward `migrate` only), React/TS.

Spec: `docs/superpowers/specs/2026-05-29-role-id-based-refactor-design.md`

## File Structure
- `database/migrations/2026_05_29_130000_add_role_id_references.php` — add `role_id` + FK + backfill (nullable)
- `database/migrations/2026_05_29_130100_drop_role_string_columns.php` — NOT NULL + drop old `role` columns
- `app/Models/Role.php` — relations + `members()` by id
- `app/Models/User.php` — `role()` relation, `isSuper`/`hasRole`/`permissions`/`roleLabel` via id+key
- `app/Models/GroupRole.php` — `role()` relation, `role_id` fillable
- `app/Models/RolePermission.php` — `role()` relation, `role_id` fillable
- `database/factories/UserFactory.php` — shim: `role` key → `role_id`
- `app/Http/Controllers/Api/GroupRoleController.php` — role_id everywhere; key on the wire
- `app/Http/Controllers/Api/RolePermissionController.php` — aggregate/upsert by role_id; key on the wire
- `app/Http/Controllers/Api/RoleController.php` — drop manual RolePermission delete (CASCADE), guard group usage
- `app/Services/EmployeeService.php` — set `role_id`
- `app/Http/Resources/EmployeeResource.php` / `UserResource.php` — resolve via relation
- `database/seeders/DatabaseSeeder.php`, `OrgSeeder.php` — set `role_id`
- `resources/js/types/index.ts` — add optional `role_id`
- `tests/Feature/RoleReferenceTest.php` — new

---

## Task 1: Add `role_id` columns + FK + backfill (Migration A)

**Files:**
- Create: `database/migrations/2026_05_29_130000_add_role_id_references.php`
- Test: `tests/Feature/RoleReferenceTest.php`

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/RoleReferenceTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class RoleReferenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_users_table_has_role_id_column(): void
    {
        $this->assertTrue(Schema::hasColumn('users', 'role_id'));
        $this->assertTrue(Schema::hasColumn('group_roles', 'role_id'));
        $this->assertTrue(Schema::hasColumn('role_permissions', 'role_id'));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter test_users_table_has_role_id_column`
Expected: FAIL (columns don't exist).

- [ ] **Step 3: Create the migration**

`database/migrations/2026_05_29_130000_add_role_id_references.php`:

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
        // users.role_id — RESTRICT (don't orphan a user's role)
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('role_id')->nullable()->after('role')->constrained('roles')->restrictOnDelete();
        });
        // group_roles.role_id — RESTRICT, stays nullable (a group may have no role)
        Schema::table('group_roles', function (Blueprint $table) {
            $table->foreignId('role_id')->nullable()->after('role')->constrained('roles')->restrictOnDelete();
        });
        // role_permissions.role_id — CASCADE (permissions belong to the role)
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->foreignId('role_id')->nullable()->after('role')->constrained('roles')->cascadeOnDelete();
        });

        // Backfill from the existing string key. Query-builder form so it works on
        // both MySQL (prod) and sqlite (tests). No orphans exist (verified).
        foreach (DB::table('roles')->get(['id', 'key']) as $role) {
            foreach (['users', 'group_roles', 'role_permissions'] as $t) {
                DB::table($t)->where('role', $role->key)->update(['role_id' => $role->id]);
            }
        }

        // Swap the role_permissions uniqueness from (role, permission) to (role_id, permission).
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->unique(['role_id', 'permission'], 'role_permissions_role_id_permission_unique');
        });
    }

    public function down(): void
    {
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->dropUnique('role_permissions_role_id_permission_unique');
            $table->dropConstrainedForeignId('role_id');
        });
        Schema::table('group_roles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('role_id');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('role_id');
        });
    }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact --filter test_users_table_has_role_id_column`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add database/migrations/2026_05_29_130000_add_role_id_references.php tests/Feature/RoleReferenceTest.php
git commit -m "feat(roles): add role_id FK columns + backfill (migration A)"
```
End every commit message with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 2: Role/User/GroupRole/RolePermission relations + UserFactory shim

**Files:**
- Modify: `app/Models/Role.php`, `app/Models/User.php`, `app/Models/GroupRole.php`, `app/Models/RolePermission.php`, `database/factories/UserFactory.php`
- Test: `tests/Feature/RoleReferenceTest.php`

- [ ] **Step 1: Add the failing test**

Add to `tests/Feature/RoleReferenceTest.php`:

```php
public function test_user_role_relation_and_super_check_work_by_id(): void
{
    $super = Role::create(['key' => 'super', 'name' => 'Administrator', 'color' => '#000', 'is_system' => true]);
    $staff = Role::create(['key' => 'user', 'name' => 'Staff', 'color' => '#111', 'is_system' => false]);

    $admin = User::factory()->create(['role' => 'super']);
    $plain = User::factory()->create(['role' => 'user']);

    $this->assertSame($super->id, $admin->role_id);
    $this->assertSame('super', $admin->role->key);
    $this->assertTrue($admin->isSuper());
    $this->assertFalse($plain->isSuper());
    $this->assertSame(1, $super->members());
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `php artisan test --compact --filter test_user_role_relation_and_super_check_work_by_id`
Expected: FAIL (factory still writes `role` string / no `role()` relation).

- [ ] **Step 3: Add relations**

`app/Models/Role.php` — add relations and fix `members()`:

```php
use Illuminate\Database\Eloquent\Relations\HasMany;

// inside class:
public function members(): int
{
    return User::where('role_id', $this->id)->count();
}

/** @return HasMany<User, $this> */
public function users(): HasMany
{
    return $this->hasMany(User::class);
}
```

`app/Models/GroupRole.php` — replace `'role'` fillable with `'role_id'`, add relation:

```php
use Illuminate\Database\Eloquent\Relations\BelongsTo;

protected $fillable = ['name', 'role_id'];

public function role(): BelongsTo
{
    return $this->belongsTo(Role::class);
}
```

`app/Models/RolePermission.php` — replace `'role'` with `'role_id'`, add relation:

```php
use Illuminate\Database\Eloquent\Relations\BelongsTo;

protected $fillable = ['role_id', 'permission', 'allowed'];

protected function casts(): array
{
    return ['allowed' => 'boolean'];
}

public function role(): BelongsTo
{
    return $this->belongsTo(Role::class);
}
```

- [ ] **Step 4: Update `User` to id-based (relation + write-mutator)**

`app/Models/User.php`:
- In `$fillable`, ADD `'role_id'` and KEEP `'role'` (the `'role'` key is intercepted by a write-mutator below so existing `create(['role' => 'x'])` / mass-assign keeps working; it never persists a `role` column).
- Add a `role()` relation. NOTE: `$user->role` now returns the **Role model** (use `$user->role?->key` for the key). Writes via `$user->role = 'key'` or `['role' => 'key']` go through the mutator:

```php
public function role(): BelongsTo
{
    return $this->belongsTo(Role::class);
}

/**
 * Compatibility write-mutator: assigning a role *key* (string) resolves it to
 * role_id. Lets existing code/tests/seeders keep passing `role => '<key>'`
 * while the real column is `role_id`. firstOrCreate so tests that haven't
 * seeded the role still work; in production the role always already exists.
 */
public function setRoleAttribute(?string $key): void
{
    $this->attributes['role_id'] = $key === null
        ? null
        : Role::firstOrCreate(
            ['key' => $key],
            ['name' => ucfirst($key), 'color' => '#64748b', 'is_system' => $key === 'super'],
        )->id;
    // Never persist a literal `role` column (it is dropped in migration B).
    unset($this->attributes['role']);
}
```

- Replace the role helpers:

```php
public function hasRole(string ...$keys): bool
{
    return in_array($this->role?->key, $keys, true);
}

public function isSuper(): bool
{
    return $this->role?->key === 'super';
}

public function roleLabel(): string
{
    return $this->role?->name ?? (string) ($this->role?->key ?? '');
}

public function permissions(): array
{
    if ($this->isSuper()) {
        return Permissions::all();
    }

    return RolePermission::query()
        ->where('role_id', $this->role_id)
        ->where('allowed', true)
        ->pluck('permission')
        ->all();
}
```

(`canManageEmployees`/`canManageOrg`/`hasPermission` already delegate to `hasRole`/`isSuper` and need no change. Remove the now-unused `UserRole` import if Pint flags it.)

- [ ] **Step 5: Default the factory to the `user` role**

`database/factories/UserFactory.php` — give every factory user a default role **key** (the model's write-mutator from Step 4 resolves it to `role_id`). Tests overriding with `['role' => 'super']` keep working through the same mutator — no `configure()`/`afterMaking` needed.

```php
public function definition(): array
{
    return [
        'name' => fake()->name(),
        'email' => fake()->unique()->safeEmail(),
        'email_verified_at' => now(),
        'password' => static::$password ??= Hash::make('password'),
        'remember_token' => Str::random(10),
        'role' => 'user', // resolved to role_id by User::setRoleAttribute
    ];
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `php artisan test --compact --filter RoleReferenceTest`
Expected: PASS (both tests).

- [ ] **Step 7: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Models/Role.php app/Models/User.php app/Models/GroupRole.php app/Models/RolePermission.php database/factories/UserFactory.php tests/Feature/RoleReferenceTest.php
git commit -m "feat(roles): resolve role via role_id relation + factory shim"
```

---

## Task 3: GroupRoleController → role_id (key on the wire)

**Files:**
- Modify: `app/Http/Controllers/Api/GroupRoleController.php`, `app/Services/EmployeeService.php`
- Test: `tests/Feature/RoleReferenceTest.php`

- [ ] **Step 1: Add the failing test**

```php
public function test_group_role_move_sets_user_role_id(): void
{
    Role::create(['key' => 'super', 'name' => 'Admin', 'color' => '#000', 'is_system' => true]);
    $hr = Role::create(['key' => 'hr', 'name' => 'HR', 'color' => '#111', 'is_system' => false]);
    $actor = User::factory()->create(['role' => 'super']);

    $employee = \App\Models\Employee::create(['code' => 'EMP-7001', 'name' => 'X', 'email' => 'x7001@x.test']);
    $account = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);

    $this->actingAs($actor)->postJson('/api/group-roles', [
        'name' => 'HR Team', 'role' => 'hr', 'employee_ids' => [$employee->id],
    ])->assertCreated();

    $this->assertSame($hr->id, $account->fresh()->role_id);
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `php artisan test --compact --filter test_group_role_move_sets_user_role_id`
Expected: FAIL (controller still writes string `role`).

- [ ] **Step 3: Update the controller** — resolve the wire `role` key to a `role_id`, store `role_id`, and set `users.role_id`. Apply these edits in `app/Http/Controllers/Api/GroupRoleController.php`:

(a) `syncUserRoles` + `setUserRole` set `role_id`:
```php
private function syncUserRoles(GroupRole $group, array $newEmployeeIds): void
{
    if (! $group->role_id || count($newEmployeeIds) === 0) {
        return;
    }
    $emails = Employee::whereIn('id', $newEmployeeIds)->pluck('email')->filter();
    $usernames = Employee::whereIn('id', $newEmployeeIds)->pluck('username')->filter();
    User::where(function ($q) use ($emails, $usernames) {
        $q->whereIn('email', $emails)->orWhereIn('username', $usernames);
    })->update(['role_id' => $group->role_id]);
}

private function setUserRole(Employee $employee, ?int $roleId): void
{
    $roleId = $roleId ?? Role::where('key', 'user')->value('id');
    if ($employee->email) {
        User::where('email', $employee->email)->update(['role_id' => $roleId]);
    } elseif ($employee->username) {
        User::where('username', $employee->username)->update(['role_id' => $roleId]);
    }
}
```

(b) `fallbackOrphansToDefault` calls pass `role_id`:
```php
$this->setUserRole($employee, $defaultGroup->role_id);
// and the else branch:
$this->setUserRole($employee, null); // null → resolves to 'user' role id
```

(c) `guardSuperGroup` compares keys (resolve incoming/existing role_id → key, or accept the key directly). Change its signature to take role **keys** and keep comparing keys; the store/update pass the key strings they already validated:
```php
private function guardSuperGroup(Request $request, ?string $existingRoleKey, ?string $incomingRoleKey = null): void
{
    if ($request->user()?->isSuper()) {
        return;
    }
    abort_if($existingRoleKey === 'super' || $incomingRoleKey === 'super', 403,
        'Only an Administrator can manage the Administrator role group.');
}
```
At call sites, pass keys: existing = `$groupRole->role?->key`, incoming = `$data['role'] ?? null` (already a key).

(d) `present()` returns role_id + key + label via the relation:
```php
'role' => $g->role?->key,
'role_id' => $g->role_id,
'role_label' => $g->role?->name,
```
Eager-load `role`: in `index()` use `GroupRole::with(['employees', 'departments', 'role'])`. In `present()` calls after create/update, `->load(['employees','departments','role'])`.

(e) store/update resolve the key to role_id before saving:
```php
$roleId = ! empty($data['role']) ? Role::where('key', $data['role'])->value('id') : null;
// store:
$group = GroupRole::create(['name' => $data['name'], 'role_id' => $roleId]);
// update:
$groupRole->update(['name' => $data['name'], 'role_id' => $roleId]);
```
And `syncUserRoles` already reads `$group->role_id`. Validation in `validateData` stays `'role' => ['nullable','string', Rule::exists('roles','key')]` (key on the wire).

- [ ] **Step 4: Update `EmployeeService`** — `resolveGroupRole` returns a role_id; `createUserWithCredentials` sets `role_id`:

```php
// createUserWithCredentials: replace 'role' => $roleKey with:
'role_id' => $this->resolveGroupRole($employee),

// resolveGroupRole returns ?int (the group's role_id, fallback to 'user' role id):
private function resolveGroupRole(Employee $employee): int
{
    $group = $employee->groupRoles()->first();

    return $group?->role_id ?? Role::where('key', 'user')->value('id');
}
```
Add `use App\Models\Role;` to `EmployeeService`. (The `$roleKey` local in `createUserWithCredentials` is removed.)

- [ ] **Step 5: Run to verify it passes**

Run: `php artisan test --compact --filter RoleReferenceTest`
Expected: PASS

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/GroupRoleController.php app/Services/EmployeeService.php tests/Feature/RoleReferenceTest.php
git commit -m "feat(roles): group role + credential provisioning set users.role_id"
```

---

## Task 4: RolePermissionController + RoleController → role_id (key on the wire)

**Files:**
- Modify: `app/Http/Controllers/Api/RolePermissionController.php`, `app/Http/Controllers/Api/RoleController.php`
- Test: `tests/Feature/RoleReferenceTest.php`

- [ ] **Step 1: Add the failing test**

```php
public function test_permission_matrix_update_persists_by_role_id(): void
{
    Role::create(['key' => 'super', 'name' => 'Admin', 'color' => '#000', 'is_system' => true]);
    $hr = Role::create(['key' => 'hr', 'name' => 'HR', 'color' => '#111', 'is_system' => false]);
    $actor = User::factory()->create(['role' => 'super']);

    $this->actingAs($actor)->putJson('/api/permissions/hr', [
        'permissions' => ['employees.view'],
    ])->assertOk();

    $this->assertDatabaseHas('role_permissions', [
        'role_id' => $hr->id, 'permission' => 'employees.view', 'allowed' => true,
    ]);
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `php artisan test --compact --filter test_permission_matrix_update_persists_by_role_id`
Expected: FAIL.

- [ ] **Step 3: Update `RolePermissionController`** — the wire still uses the role **key** (`/permissions/{role}` where `{role}` = key); resolve to `role_id` internally:

`index()` — aggregate by role_id then key the result by the role's key:
```php
// granted perms per role_id
$permsByRoleId = RolePermission::where('allowed', true)
    ->get(['role_id', 'permission'])
    ->groupBy('role_id')
    ->map(fn ($rows) => $rows->pluck('permission')->all());

// member counts per role_id
$memberCounts = User::select('role_id', DB::raw('count(*) as cnt'))
    ->whereNotNull('role_id')
    ->groupBy('role_id')
    ->pluck('cnt', 'role_id');

$roles = Role::orderByDesc('is_system')->orderBy('name')->get()->map(function (Role $role) use ($permsByRoleId, $memberCounts) {
    $allowed = $role->key === 'super'
        ? Permissions::all()
        : ($permsByRoleId[$role->id] ?? []);

    return [
        'value'     => $role->key,
        'label'     => $role->name,
        'color'     => $role->color,
        'is_super'  => $role->key === 'super',
        'is_system' => $role->is_system,
        'members'   => (int) ($memberCounts[$role->id] ?? 0),
        'permissions' => $allowed,
    ];
});
```

`update(Request $request, string $role)` — `$role` is the key; resolve once:
```php
abort_if($role === 'super', 422, 'Administrator Template permissions cannot be changed.');
$roleId = Role::where('key', $role)->value('id');
abort_if($roleId === null, 404);

$data = $request->validate([
    'permissions'   => ['present', 'array'],
    'permissions.*' => [Rule::in(Permissions::all())],
]);
$granted = $data['permissions'];

$before = RolePermission::where('role_id', $roleId)->where('allowed', true)->pluck('permission')->all();

$grantedSet = array_flip($granted);
$upsertRows = array_map(fn ($key) => [
    'role_id'    => $roleId,
    'permission' => $key,
    'allowed'    => isset($grantedSet[$key]),
], Permissions::all());

RolePermission::upsert($upsertRows, ['role_id', 'permission'], ['allowed']);

$added   = array_values(array_diff($granted, $before));
$removed = array_values(array_diff($before, $granted));
AuditLog::record('Updated permissions', Role::where('key', $role)->value('name') ?? $role, ['added' => $added, 'removed' => $removed]);

return $this->index($request);
```
(`setDefaultRole` is unchanged — it validates `role` as `exists:roles,key` and only records an audit entry.)

- [ ] **Step 4: Update `RoleController::destroy`** — `role_permissions` now CASCADE-delete with the role, so drop the manual cleanup, and block deleting a role still used by any group (RESTRICT would otherwise throw a raw FK error):

```php
public function destroy(Request $request, string $key): JsonResponse
{
    abort_unless((bool) $request->user()?->hasPermission('system.manage_roles'), 403);
    $role = Role::where('key', $key)->firstOrFail();
    abort_if($role->is_system, 422, 'System role cannot be deleted.');
    abort_if($role->members() > 0, 422, 'Role still has members. Reassign them first.');
    abort_if(\App\Models\GroupRole::where('role_id', $role->id)->exists(), 422, 'Role is still used by a Role Group. Reassign it first.');

    $name = $role->name;
    $role->delete(); // role_permissions cascade via FK
    AuditLog::record('Deleted role', $name);

    return response()->json(['message' => 'success']);
}
```
(Remove the `use App\Models\RolePermission;` import if Pint flags it as unused after deleting the manual line.)

- [ ] **Step 5: Run to verify it passes**

Run: `php artisan test --compact --filter RoleReferenceTest`
Expected: PASS

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/RolePermissionController.php app/Http/Controllers/Api/RoleController.php tests/Feature/RoleReferenceTest.php
git commit -m "feat(roles): permission matrix + role delete operate by role_id"
```

---

## Task 5: Resources resolve via relation (UserResource, EmployeeResource)

**Files:**
- Modify: `app/Http/Resources/UserResource.php`, `app/Http/Resources/EmployeeResource.php`
- Test: `tests/Feature/RoleReferenceTest.php`

- [ ] **Step 1: Add the failing test**

```php
public function test_user_resource_exposes_role_key_and_id(): void
{
    Role::create(['key' => 'super', 'name' => 'Administrator', 'color' => '#000', 'is_system' => true]);
    $actor = User::factory()->create(['role' => 'super']);

    $this->actingAs($actor)->getJson('/api/me')
        ->assertOk()
        ->assertJsonPath('data.role', 'super')
        ->assertJsonPath('data.role_id', $actor->role_id);
}
```
(If the authenticated-user endpoint is not `/api/me`, use the project's actual "current user" route — confirm via `php artisan route:list --path=me`.)

- [ ] **Step 2: Run to verify it fails**

Run: `php artisan test --compact --filter test_user_resource_exposes_role_key_and_id`
Expected: FAIL (`role` currently `(string) $this->role` → now a Role model cast to string).

- [ ] **Step 3: Update `UserResource`** — expose the key + id; resolve group by role_id:

```php
'role' => $this->role?->key,
'role_id' => $this->role_id,
'role_label' => $this->roleLabel(),
```
And in `resolveGroupName`, match by role_id:
```php
return $groups->firstWhere('role_id', $this->role_id)?->name
    ?? $groups->first()?->name;
```

- [ ] **Step 4: Update `EmployeeResource`** — `is_super_admin` via the relation:

```php
'is_super_admin' => $linkedUser?->role?->key === 'super',
```
(Eager-load: where the controller builds the employee query for the resource, load `user.role`, e.g. `Employee::with([... 'user.role'])`. Add `'user.role'` to the existing `with([...])` in `EmployeeController::index` and any single-employee load used by the resource.)

- [ ] **Step 5: Run to verify it passes**

Run: `php artisan test --compact --filter RoleReferenceTest`
Expected: PASS

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Resources/UserResource.php app/Http/Resources/EmployeeResource.php app/Http/Controllers/Api/EmployeeController.php tests/Feature/RoleReferenceTest.php
git commit -m "feat(roles): resources resolve role via relation (key + id)"
```

---

## Task 6: Seeders → role_id, then drop the string columns (Migration B)

**Files:**
- Modify: `database/seeders/DatabaseSeeder.php`, `database/seeders/OrgSeeder.php`
- Create: `database/migrations/2026_05_29_130100_drop_role_string_columns.php`

- [ ] **Step 1: Update `DatabaseSeeder`** — when creating the demo users, set `role_id` from the role key. READ the file; the users are created from an array with a `role` key. Resolve it:

```php
// before the loop that creates users, the roles are already seeded.
foreach ($demoUsers as $data) {
    $roleId = \App\Models\Role::where('key', $data['role'])->value('id');
    \App\Models\User::updateOrCreate(
        ['email' => $data['email']],
        ['name' => $data['name'], 'username' => $data['username'], 'role_id' => $roleId, 'password' => 'password'],
    );
}
```
(Match the existing variable names in the file; the key change is `'role' => $data['role']` → `'role_id' => $roleId`.)

- [ ] **Step 2: Update `OrgSeeder`** — `linkDemoAccounts` already sets `users.employee_id`; it does NOT set role (role comes from group sync), so no role change needed there. Verify `seedGroupRoles` creates groups with a role: change `GroupRole::updateOrCreate(['name'=>...], ['role'=>...])` to resolve `role_id`:

```php
foreach ($groups as $g) {
    $roleId = \App\Models\Role::where('key', $g['role'])->value('id');
    GroupRole::updateOrCreate(['name' => $g['name']], ['role_id' => $roleId]);
}
```
Add `use App\Models\Role;` if not present.

- [ ] **Step 3: Create Migration B**

`database/migrations/2026_05_29_130100_drop_role_string_columns.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Drop the legacy string columns + their old unique index. (role_id is left
        // nullable at the DB level — sqlite test rebuilds + FK make a NOT NULL change()
        // fragile; the application always sets role_id, and the FK guards integrity.)
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->dropUnique(['role', 'permission']);
            $table->dropColumn('role');
        });
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('role'));
        Schema::table('group_roles', fn (Blueprint $t) => $t->dropColumn('role'));
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->string('role')->nullable()->after('username'));
        Schema::table('group_roles', fn (Blueprint $t) => $t->string('role')->nullable()->after('name'));
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->string('role')->nullable()->after('id');
            $table->unique(['role', 'permission']);
        });
    }
};
```
(Note: `->change()` on a foreignId requires the column already exists; if the grammar complains about changing a constrained column, instead use `$table->unsignedBigInteger('role_id')->nullable(false)->change();`. Verify by running the suite.)

- [ ] **Step 4: Run the FULL suite (RefreshDatabase applies both migrations on sqlite)**

Run: `php artisan test --compact`
Expected: ALL pass. Fix any test/seeder still referencing the dropped `role` string (search: `grep -rn "'role' =>" tests/ database/` and `->role ===` in tests).

- [ ] **Step 5: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add database/seeders/DatabaseSeeder.php database/seeders/OrgSeeder.php database/migrations/2026_05_29_130100_drop_role_string_columns.php
git commit -m "feat(roles): seeders set role_id; drop legacy role string columns (migration B)"
```

---

## Task 7: Frontend — additive types only (stays key-based)

**Files:**
- Modify: `resources/js/types/index.ts`, `resources/js/services/permissionApi.ts`

- [ ] **Step 1:** In `resources/js/types/index.ts`, on the `User` interface add `role_id?: number;` next to `role`. Leave `role` (the key string) and all `role === 'super'` checks unchanged.

- [ ] **Step 2:** In `resources/js/services/permissionApi.ts`, on the `GroupRole` interface add `role_id?: number | null;` next to `role`. No other change — the wire contract still identifies roles by key.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit -p tsconfig.json`
Run: `npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add resources/js/types/index.ts resources/js/services/permissionApi.ts
git commit -m "feat(roles): add optional role_id to frontend types"
```

---

## Task 8: Full verification

- [ ] **Step 1:** `grep -rn "where('role'\|->role ===\|'role' =>\|users.role\b" app/ database/` — expect no functional string-role references remain (only role_id / role key resolution). Fix stragglers.
- [ ] **Step 2:** Run full backend suite: `php artisan test --compact` — all green.
- [ ] **Step 3:** `npm run build` — succeeds.
- [ ] **Step 4:** `vendor/bin/pint --dirty --format agent` on anything outstanding; commit if needed.

---

## Notes for the implementer
- **LIVE DB**: never run `migrate`/`migrate:fresh`/seeders against the dev MySQL. Verify only via `php artisan test` (sqlite). Real deploy = `php artisan migrate` (forward; A backfills before B drops).
- **Auth hot-path**: ensure the authenticated user's `role` is loaded (relation) so `isSuper()`/`permissions()` don't N+1. If `php artisan test` shows correctness but you spot repeated role queries, eager-load `role` on the user in the auth/me path.
- **`role` key stays on the wire** (API request/response + FE). Only the database references and backend joins switch to `role_id`.
- After Task 2, `User::factory()->create(['role' => 'super'])` keeps working via the factory shim, so most existing tests need no change.
