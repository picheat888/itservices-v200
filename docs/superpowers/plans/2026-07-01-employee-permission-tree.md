# Employee Control Permission Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปรับ card สิทธิ์ Employee ในหน้า Role Template ให้เป็น master→view→management tree with cascade แบบ Stock พร้อม full enforcement (frontend + backend)

**Architecture:** เพิ่มสิทธิ์ granular ใต้ catalog module `employees` (master `employees.module` + view groups ตาม 6 tabs + management children) mirror `stockHierarchy()`/`normalizeStock()`. Backend enforce แต่ละ write ด้วย `hasPermission()`; frontend ซ่อน tab/ปุ่มตามสิทธิ์. `employees.edit_own` เป็น standalone ไม่ผูก master. Reference-read endpoints (dropdown ข้ามโมดูล) ไม่ถูก gate.

**Tech Stack:** Laravel 12 (PHP 8.2), React 19 + TS, Tailwind v4, PHPUnit 11, Sanctum

## Global Constraints

- Catalog module key = `employees`; ทุก permission key prefix `employees.` (snake_case action)
- `employees.edit_own` = standalone: `normalizeEmployees()` ต้องไม่ตัดทิ้งแม้ไม่มี `employees.module`
- Org CRUD (`section_*`, `department_*`, `position_*`, `position_special`) default = super เท่านั้น
- reference-read endpoints (`departments`/`positions`/`sections` index, `employees` index แบบไม่ paginate) **ห้าม** gate ด้วย `view_*` (dropdown ข้ามโมดูลต้องไม่พัง)
- Backend validate เสมอ; ทุก method ที่แก้ไขต้องมี PHPDoc/comment (ตาม CLAUDE.md)
- รัน `vendor/bin/pint --dirty --format agent` ก่อนจบงานฝั่ง PHP
- ห้าม inline style ฝั่ง React — Tailwind เท่านั้น
- Employee key set (25): `module, view_dashboard, view, add, import, edit, reset_password, resign, cancel_resign, set_credentials, view_section, section_add, section_edit, section_delete, view_department, department_add, department_edit, department_delete, view_position, position_add, position_edit, position_delete, position_special, view_org, edit_own`

---

### Task 1: Catalog + employeeHierarchy() + normalizeEmployees()

**Files:**
- Modify: `app/Support/Permissions.php`
- Test: `tests/Unit/EmployeePermissionHierarchyTest.php`

**Interfaces:**
- Produces: `Permissions::employeeHierarchy(): array{master:string, standalone:list<string>, groups:array<string,list<string>>}`
- Produces: `Permissions::normalizeEmployees(array $granted): list<string>`
- Modifies: `Permissions::catalog()['employees']` → 25 action keys

- [ ] **Step 1: Write the failing test**

Create `tests/Unit/EmployeePermissionHierarchyTest.php`:

```php
<?php

namespace Tests\Unit;

use App\Support\Permissions;
use Tests\TestCase;

class EmployeePermissionHierarchyTest extends TestCase
{
    public function test_catalog_exposes_the_25_employee_keys(): void
    {
        $expected = [
            'employees.module', 'employees.view_dashboard', 'employees.view',
            'employees.add', 'employees.import', 'employees.edit', 'employees.reset_password',
            'employees.resign', 'employees.cancel_resign', 'employees.set_credentials',
            'employees.view_section', 'employees.section_add', 'employees.section_edit', 'employees.section_delete',
            'employees.view_department', 'employees.department_add', 'employees.department_edit', 'employees.department_delete',
            'employees.view_position', 'employees.position_add', 'employees.position_edit', 'employees.position_delete', 'employees.position_special',
            'employees.view_org', 'employees.edit_own',
        ];
        foreach ($expected as $key) {
            $this->assertContains($key, Permissions::all(), "missing {$key}");
        }
        $empKeys = array_filter(Permissions::all(), fn ($k) => str_starts_with($k, 'employees.'));
        $this->assertCount(25, $empKeys);
    }

    public function test_normalize_drops_child_when_its_view_is_off(): void
    {
        // section_add's parent view_section is absent → dropped; add's parent view IS present → kept
        $in = ['employees.module', 'employees.view', 'employees.add', 'employees.section_add'];
        $out = Permissions::normalizeEmployees($in);
        $this->assertContains('employees.add', $out);
        $this->assertNotContains('employees.section_add', $out);
    }

    public function test_normalize_drops_all_but_edit_own_when_master_is_off(): void
    {
        $in = ['employees.view', 'employees.add', 'employees.edit_own', 'tickets.create'];
        $out = Permissions::normalizeEmployees($in);
        $this->assertNotContains('employees.view', $out);
        $this->assertNotContains('employees.add', $out);
        $this->assertContains('employees.edit_own', $out); // standalone survives master-off
        $this->assertContains('tickets.create', $out);     // non-employee untouched
    }

    public function test_edit_own_is_not_a_child_of_any_group(): void
    {
        $h = Permissions::employeeHierarchy();
        $this->assertContains('employees.edit_own', $h['standalone']);
        foreach ($h['groups'] as $children) {
            $this->assertNotContains('employees.edit_own', $children);
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter=EmployeePermissionHierarchyTest`
Expected: FAIL (methods `employeeHierarchy`/`normalizeEmployees` not defined; key count wrong)

- [ ] **Step 3: Update catalog in `app/Support/Permissions.php`**

Replace the `'employees' => [...]` line in `catalog()`:

```php
            'employees' => [
                'module',
                'view_dashboard', 'view', 'view_section', 'view_department', 'view_position', 'view_org',
                'add', 'import', 'edit', 'reset_password', 'resign', 'cancel_resign', 'set_credentials',
                'section_add', 'section_edit', 'section_delete',
                'department_add', 'department_edit', 'department_delete',
                'position_add', 'position_edit', 'position_delete', 'position_special',
                'edit_own',
            ],
```

- [ ] **Step 4: Add hierarchy + normalize methods**

Add after `normalizeStock()` in `app/Support/Permissions.php`:

```php
    /**
     * Employee permission tree used for client cascade and server normalization.
     * `standalone` keys (edit_own — self-service) are never gated by the master.
     *
     * @return array{master: string, standalone: list<string>, groups: array<string, list<string>>}
     */
    public static function employeeHierarchy(): array
    {
        return [
            'master' => 'employees.module',
            'standalone' => ['employees.edit_own'],
            'groups' => [
                'employees.view_dashboard' => [],
                'employees.view' => [
                    'employees.add', 'employees.import', 'employees.edit', 'employees.reset_password',
                    'employees.resign', 'employees.cancel_resign', 'employees.set_credentials',
                ],
                'employees.view_section' => ['employees.section_add', 'employees.section_edit', 'employees.section_delete'],
                'employees.view_department' => ['employees.department_add', 'employees.department_edit', 'employees.department_delete'],
                'employees.view_position' => ['employees.position_add', 'employees.position_edit', 'employees.position_delete', 'employees.position_special'],
                'employees.view_org' => [],
            ],
        ];
    }

    /**
     * Enforce the employee hierarchy on a granted set: a management child requires its
     * group's view key; every view key requires the master. `standalone` keys survive
     * even when the master is off (edit_own is self-service). Non-employee keys pass
     * through untouched. Returns the normalized list.
     *
     * @param  list<string>  $granted
     * @return list<string>
     */
    public static function normalizeEmployees(array $granted): array
    {
        $set = array_flip($granted);
        $hierarchy = self::employeeHierarchy();
        $standalone = array_flip($hierarchy['standalone']);

        if (! isset($set[$hierarchy['master']])) {
            return array_values(array_filter(
                $granted,
                fn ($key) => ! str_starts_with($key, 'employees.') || isset($standalone[$key]),
            ));
        }

        foreach ($hierarchy['groups'] as $viewKey => $children) {
            if (! isset($set[$viewKey])) {
                foreach ($children as $child) {
                    unset($set[$child]);
                }
            }
        }

        return array_keys($set);
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php artisan test --compact --filter=EmployeePermissionHierarchyTest`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add app/Support/Permissions.php tests/Unit/EmployeePermissionHierarchyTest.php
git commit -m "feat(permissions): employee permission catalog + hierarchy + normalize"
```

---

### Task 2: Role defaults (hierarchy-consistent)

**Files:**
- Modify: `app/Support/Permissions.php` (method `defaults()`)
- Test: `tests/Unit/EmployeePermissionHierarchyTest.php` (add one test)

**Interfaces:**
- Consumes: `Permissions::normalizeEmployees()` (Task 1)

- [ ] **Step 1: Add the failing consistency test**

Append to `tests/Unit/EmployeePermissionHierarchyTest.php`:

```php
    public function test_default_grants_are_employee_hierarchy_consistent(): void
    {
        foreach (Permissions::defaults() as $role => $granted) {
            $normalized = Permissions::normalizeEmployees($granted);
            $before = array_values(array_filter($granted, fn ($k) => str_starts_with($k, 'employees.')));
            $after = array_values(array_filter($normalized, fn ($k) => str_starts_with($k, 'employees.')));
            sort($before);
            sort($after);
            $this->assertSame($before, $after, "employee defaults for {$role} are not hierarchy-consistent");
        }
    }

    public function test_admin_and_hr_defaults_include_module_and_view_groups(): void
    {
        foreach (['admin', 'hr'] as $role) {
            $g = Permissions::defaults()[$role];
            $this->assertContains('employees.module', $g, "{$role} missing module");
            $this->assertContains('employees.view_dashboard', $g);
            $this->assertContains('employees.view_org', $g);
        }
        // Org CRUD stays super-only: not granted to admin/hr by default.
        $this->assertNotContains('employees.section_add', Permissions::defaults()['admin']);
        $this->assertNotContains('employees.position_delete', Permissions::defaults()['hr']);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter=EmployeePermissionHierarchyTest`
Expected: FAIL (admin/hr defaults lack `employees.module` etc.)

- [ ] **Step 3: Update `defaults()` grants**

In `app/Support/Permissions.php` `defaults()`, replace the employee lines per role.

`admin` — replace the existing `'employees.view', ... 'employees.set_credentials',` block with:

```php
                'employees.module', 'employees.view_dashboard', 'employees.view', 'employees.view_org',
                'employees.view_section', 'employees.view_department', 'employees.view_position',
                'employees.add', 'employees.import', 'employees.edit',
                'employees.reset_password', 'employees.resign', 'employees.cancel_resign', 'employees.set_credentials',
```

`hr` — replace `'employees.view', 'employees.add', 'employees.import', 'employees.edit', 'employees.edit_own',` with:

```php
                'employees.module', 'employees.view_dashboard', 'employees.view', 'employees.view_org',
                'employees.view_section', 'employees.view_department', 'employees.view_position',
                'employees.add', 'employees.import', 'employees.edit', 'employees.edit_own',
```

`user` — leave unchanged (keeps only `employees.edit_own`).

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact --filter=EmployeePermissionHierarchyTest`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add app/Support/Permissions.php tests/Unit/EmployeePermissionHierarchyTest.php
git commit -m "feat(permissions): grant employee module + view groups to admin/hr defaults"
```

---

### Task 3: Wire normalizeEmployees into permission save

**Files:**
- Modify: `app/Http/Controllers/Api/RolePermissionController.php:70-71`
- Test: `tests/Feature/EmployeePermissionGatingTest.php` (new file — first test)

**Interfaces:**
- Consumes: `Permissions::normalizeEmployees()` (Task 1)

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/EmployeePermissionGatingTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeePermissionGatingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** Create a non-super user holding exactly the given permissions. */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'emp_'.uniqid(), 'name' => 'Emp Test', 'is_system' => false]);
        foreach ($permissions as $p) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $p, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    public function test_save_normalizes_away_orphan_employee_children(): void
    {
        $admin = $this->admin();
        $role = Role::create(['key' => 'emp_norm', 'name' => 'Norm', 'is_system' => false]);

        // module + view present → add kept; view_section absent → section_add dropped
        $this->actingAs($admin)->putJson("/api/permissions/{$role->key}", [
            'permissions' => ['employees.module', 'employees.view', 'employees.add', 'employees.section_add'],
        ])->assertOk();

        $stored = RolePermission::where('role_id', $role->id)->where('allowed', true)->pluck('permission')->all();
        $this->assertContains('employees.add', $stored);
        $this->assertNotContains('employees.section_add', $stored);
    }

    public function test_save_preserves_edit_own_without_master(): void
    {
        $admin = $this->admin();
        $role = Role::create(['key' => 'emp_own', 'name' => 'Own', 'is_system' => false]);

        $this->actingAs($admin)->putJson("/api/permissions/{$role->key}", [
            'permissions' => ['employees.edit_own'],
        ])->assertOk();

        $stored = RolePermission::where('role_id', $role->id)->where('allowed', true)->pluck('permission')->all();
        $this->assertContains('employees.edit_own', $stored);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter=EmployeePermissionGatingTest`
Expected: FAIL (`section_add` persisted because normalize not wired)

- [ ] **Step 3: Wire the normalize call**

In `app/Http/Controllers/Api/RolePermissionController.php`, after the existing normalize lines (currently `$granted = Permissions::normalizeStock(...)` then `normalizeSettings`), add:

```php
        $granted = Permissions::normalizeStock($data['permissions']);
        $granted = Permissions::normalizeSettings($granted);
        $granted = Permissions::normalizeEmployees($granted);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact --filter=EmployeePermissionGatingTest`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/RolePermissionController.php tests/Feature/EmployeePermissionGatingTest.php
git commit -m "feat(permissions): normalize employee hierarchy on role save"
```

---

### Task 4: Backend enforcement — Section / Department / Position writes

**Files:**
- Modify: `app/Http/Requests/StoreSectionRequest.php`, `StoreDepartmentRequest.php`, `StorePositionRequest.php`
- Modify: `app/Http/Controllers/Api/SectionController.php`, `DepartmentController.php`, `PositionController.php`
- Test: `tests/Feature/EmployeePermissionGatingTest.php` (add tests)

**Interfaces:**
- Consumes: `User::hasPermission(string): bool` (existing)
- Note: FormRequest `authorize()` distinguishes store vs update via route binding, mirroring `StoreEmployeeRequest`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/Feature/EmployeePermissionGatingTest.php`:

```php
    public function test_section_store_requires_section_add(): void
    {
        $dept = \App\Models\Department::create(['name' => 'IT', 'tag' => 'IT']);
        $blocked = $this->userWith(['employees.module', 'employees.view_section']);
        $allowed = $this->userWith(['employees.module', 'employees.view_section', 'employees.section_add']);

        $payload = ['department_id' => $dept->id, 'name' => 'Helpdesk'];
        $this->actingAs($blocked)->postJson('/api/sections', $payload)->assertForbidden();
        $this->actingAs($allowed)->postJson('/api/sections', $payload)->assertCreated();
    }

    public function test_department_delete_requires_department_delete(): void
    {
        $dept = \App\Models\Department::create(['name' => 'Temp', 'tag' => 'TMP']);
        $blocked = $this->userWith(['employees.module', 'employees.view_department']);
        $this->actingAs($blocked)->deleteJson("/api/departments/{$dept->id}")->assertForbidden();

        $allowed = $this->userWith(['employees.module', 'employees.view_department', 'employees.department_delete']);
        $this->actingAs($allowed)->deleteJson("/api/departments/{$dept->id}")->assertOk();
    }

    public function test_position_special_toggle_requires_position_special(): void
    {
        $pos = \App\Models\Position::create(['title' => 'Dev', 'allow_special_position' => false]);
        // Has edit but not special → may rename, may NOT flip allow_special_position
        $editor = $this->userWith(['employees.module', 'employees.view_position', 'employees.position_edit']);
        $this->actingAs($editor)
            ->putJson("/api/positions/{$pos->id}", ['title' => 'Dev', 'allow_special_position' => true])
            ->assertForbidden();

        $special = $this->userWith(['employees.module', 'employees.view_position', 'employees.position_edit', 'employees.position_special']);
        $this->actingAs($special)
            ->putJson("/api/positions/{$pos->id}", ['title' => 'Dev', 'allow_special_position' => true])
            ->assertOk();
    }

    public function test_reference_reads_stay_open_for_any_authenticated_user(): void
    {
        // A user with NO employee permissions can still read the dropdown lists.
        $picker = $this->userWith(['tickets.create']);
        $this->actingAs($picker)->getJson('/api/departments')->assertOk();
        $this->actingAs($picker)->getJson('/api/positions')->assertOk();
        $this->actingAs($picker)->getJson('/api/sections')->assertOk();
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact --filter=EmployeePermissionGatingTest`
Expected: FAIL (writes still allowed/blocked by super-only `canManageOrg`; special not gated)

- [ ] **Step 3: Update the three FormRequest `authorize()` methods**

`StoreSectionRequest.php` — replace `authorize()`:

```php
    /**
     * Store requires employees.section_add; update requires employees.section_edit.
     * The presence of a {section} route binding distinguishes update from store.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }
        $permission = $this->route('section') ? 'employees.section_edit' : 'employees.section_add';

        return (bool) $user->hasPermission($permission);
    }
```

`StoreDepartmentRequest.php` — replace `authorize()`:

```php
    /**
     * Store requires employees.department_add; update requires employees.department_edit.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }
        $permission = $this->route('department') ? 'employees.department_edit' : 'employees.department_add';

        return (bool) $user->hasPermission($permission);
    }
```

`StorePositionRequest.php` — replace `authorize()`:

```php
    /**
     * Store requires employees.position_add; update requires employees.position_edit.
     * The allow_special_position field is additionally gated in the controller by
     * employees.position_special.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }
        $permission = $this->route('position') ? 'employees.position_edit' : 'employees.position_add';

        return (bool) $user->hasPermission($permission);
    }
```

- [ ] **Step 4: Gate the three `destroy()` methods**

In each controller `destroy()`, replace `abort_unless((bool) $request->user()?->canManageOrg(), 403);` with the granular key:

- `SectionController::destroy`: `abort_unless((bool) $request->user()?->hasPermission('employees.section_delete'), 403);`
- `DepartmentController::destroy`: `abort_unless((bool) $request->user()?->hasPermission('employees.department_delete'), 403);`
- `PositionController::destroy`: `abort_unless((bool) $request->user()?->hasPermission('employees.position_delete'), 403);`

- [ ] **Step 5: Gate the special-position field in PositionController**

In `PositionController.php`, add a private helper and call it in both `store()` and `update()` before persisting. Add this method:

```php
    /**
     * The allow_special_position flag is a privileged toggle: changing it requires
     * employees.position_special. If the caller lacks that permission, drop the field
     * from the payload when it would change the stored value (super bypasses).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function guardSpecialFlag(Request $request, array $data, ?Position $position = null): array
    {
        if (! array_key_exists('allow_special_position', $data)) {
            return $data;
        }
        $current = (bool) ($position?->allow_special_position ?? false);
        $requested = (bool) $data['allow_special_position'];
        if ($requested !== $current && ! $request->user()?->hasPermission('employees.position_special')) {
            abort(403, 'Changing the special-position flag requires the Special Position Control permission.');
        }

        return $data;
    }
```

Then in `store()`:

```php
    public function store(StorePositionRequest $request): JsonResponse
    {
        $data = $this->guardSpecialFlag($request, $request->validated());
        $position = Position::create($data);
        AuditLog::record('Created position', $position->title);

        return (new PositionResource($position))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }
```

And in `update()`:

```php
    public function update(StorePositionRequest $request, Position $position): JsonResponse
    {
        $before = $position->getOriginal();
        $data = $this->guardSpecialFlag($request, $request->validated(), $position);
        $position->update($data);
        AuditLog::record('Updated position', $position->title, AuditLog::changes($before, $position));

        return (new PositionResource($position))->additional(['message' => 'success'])->response();
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `php artisan test --compact --filter=EmployeePermissionGatingTest`
Expected: PASS (all tests, incl. reference-reads-open)

- [ ] **Step 7: Commit**

```bash
git add app/Http/Requests/StoreSectionRequest.php app/Http/Requests/StoreDepartmentRequest.php app/Http/Requests/StorePositionRequest.php app/Http/Controllers/Api/SectionController.php app/Http/Controllers/Api/DepartmentController.php app/Http/Controllers/Api/PositionController.php tests/Feature/EmployeePermissionGatingTest.php
git commit -m "feat(employees): granular backend enforcement for section/department/position writes"
```

---

### Task 5: Backend enforcement — Employee view/dashboard/org browse

**Files:**
- Modify: `app/Http/Controllers/Api/EmployeeController.php` (`summary`, `orgChart`, `index`)
- Test: `tests/Feature/EmployeePermissionGatingTest.php` (add tests)

**Interfaces:**
- Consumes: `User::hasPermission()`
- Note: `index()` gates ONLY the paginated directory browse (`?page=` present); the unpaginated list stays open (cross-module picker).

- [ ] **Step 1: Write the failing tests**

Append to `tests/Feature/EmployeePermissionGatingTest.php`:

```php
    public function test_summary_requires_view_dashboard(): void
    {
        $blocked = $this->userWith(['employees.module', 'employees.view']);
        $allowed = $this->userWith(['employees.module', 'employees.view_dashboard']);
        $this->actingAs($blocked)->getJson('/api/employees/summary')->assertForbidden();
        $this->actingAs($allowed)->getJson('/api/employees/summary')->assertOk();
    }

    public function test_org_chart_requires_view_org(): void
    {
        $blocked = $this->userWith(['employees.module', 'employees.view']);
        $allowed = $this->userWith(['employees.module', 'employees.view_org']);
        $this->actingAs($blocked)->getJson('/api/employees/org-chart')->assertForbidden();
        $this->actingAs($allowed)->getJson('/api/employees/org-chart')->assertOk();
    }

    public function test_directory_browse_requires_view_but_picker_stays_open(): void
    {
        $picker = $this->userWith(['tickets.create']); // no employee perms
        // Paginated directory browse is gated
        $this->actingAs($picker)->getJson('/api/employees?page=1')->assertForbidden();
        // Unpaginated picker list stays open
        $this->actingAs($picker)->getJson('/api/employees')->assertOk();

        $viewer = $this->userWith(['employees.module', 'employees.view']);
        $this->actingAs($viewer)->getJson('/api/employees?page=1')->assertOk();
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact --filter=EmployeePermissionGatingTest`
Expected: FAIL (endpoints currently ungated → 200 where 403 expected)

- [ ] **Step 3: Gate summary + orgChart**

In `EmployeeController.php`:

`summary()` — add as first line of the method body:

```php
        abort_unless((bool) request()->user()?->hasPermission('employees.view_dashboard'), 403);
```

`orgChart()` — change the existing gate from `employees.view` to `employees.view_org`:

```php
        abort_unless((bool) $request->user()?->hasPermission('employees.view_org'), 403);
```

- [ ] **Step 4: Gate the paginated directory browse in `index()`**

In `EmployeeController::index()`, inside the `if ($request->has('page')) {` block, add as its first line:

```php
        if ($request->has('page')) {
            abort_unless((bool) $request->user()?->hasPermission('employees.view'), 403);
```

(Leave the trailing `return EmployeeResource::collection($query->get())->response();` — the unpaginated picker path — ungated.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `php artisan test --compact --filter=EmployeePermissionGatingTest`
Expected: PASS

- [ ] **Step 6: Verify existing employee/org tests still pass**

Run: `php artisan test --compact --filter=EmployeeApiTest`
Then: `php artisan test --compact --filter=OrgChartTest`
Expected: PASS (fix any test that relied on ungated summary/org-chart by granting the new perm in that test's setup)

- [ ] **Step 7: Commit**

```bash
git add app/Http/Controllers/Api/EmployeeController.php tests/Feature/EmployeePermissionGatingTest.php
git commit -m "feat(employees): gate dashboard/org/directory browse; keep picker open"
```

---

### Task 6: Migration backfill for existing roles

**Files:**
- Create: `database/migrations/2026_07_01_000000_backfill_employee_module_permissions.php`
- Test: (covered by existing suite + manual note; no new unit test — data migration)

**Interfaces:**
- Grants `employees.module`, `employees.view_dashboard`, `employees.view_org` to every non-super role that already holds `employees.view`, so the sidebar entry and dashboard/org tabs don't disappear after deploy.

- [ ] **Step 1: Create the migration**

Create `database/migrations/2026_07_01_000000_backfill_employee_module_permissions.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Grant the new employee master + dashboard/org view keys to every role that
     * currently holds employees.view, so existing roles keep their Employees sidebar
     * entry and Dashboard/Org tabs once the tree-gating goes live.
     */
    public function up(): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('permission', 'employees.view')
            ->where('allowed', true)
            ->pluck('role_id')
            ->unique();

        $keys = ['employees.module', 'employees.view_dashboard', 'employees.view_org'];

        foreach ($roleIds as $roleId) {
            foreach ($keys as $key) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission' => $key],
                    ['allowed' => true],
                );
            }
        }
    }

    /**
     * Down: remove only the backfilled master/dashboard/org grants. Left intentionally
     * conservative — it does not touch management children.
     */
    public function down(): void
    {
        DB::table('role_permissions')
            ->whereIn('permission', ['employees.module', 'employees.view_dashboard', 'employees.view_org'])
            ->delete();
    }
};
```

- [ ] **Step 2: Run the migration**

Run: `php artisan migrate`
Expected: migration runs without error (`Migrated: 2026_07_01_000000_backfill_employee_module_permissions`)

- [ ] **Step 3: Verify grants applied**

Run: `php artisan tinker --execute 'echo App\Models\RolePermission::where("permission","employees.module")->where("allowed",true)->count();'`
Expected: a count ≥ number of roles that had `employees.view` (non-zero if any non-super role had directory access)

- [ ] **Step 4: Commit**

```bash
git add database/migrations/2026_07_01_000000_backfill_employee_module_permissions.php
git commit -m "feat(permissions): backfill employees.module for roles with employees.view"
```

---

### Task 7: Frontend labels + LIVE set

**Files:**
- Modify: `resources/js/lib/permission-labels.ts`

**Interfaces:**
- Produces: `moduleLabel`/`actionLabel` return values for the new keys; `isLivePermission` returns true for all new employee keys.

- [ ] **Step 1: Add ACTIONS labels**

In `resources/js/lib/permission-labels.ts`, add these entries to the `ACTIONS` object (near the existing `employees.*` block):

```ts
    'employees.module': { en: 'Employee Module', th: 'โมดูลพนักงาน' },
    'employees.view_dashboard': { en: 'Dashboard', th: 'แดชบอร์ด' },
    'employees.view_section': { en: 'Sections', th: 'ส่วนงาน' },
    'employees.section_add': { en: 'Add section', th: 'เพิ่มส่วนงาน' },
    'employees.section_edit': { en: 'Edit section', th: 'แก้ไขส่วนงาน' },
    'employees.section_delete': { en: 'Delete section', th: 'ลบส่วนงาน' },
    'employees.view_department': { en: 'Departments', th: 'แผนก' },
    'employees.department_add': { en: 'Add department', th: 'เพิ่มแผนก' },
    'employees.department_edit': { en: 'Edit department', th: 'แก้ไขแผนก' },
    'employees.department_delete': { en: 'Delete department', th: 'ลบแผนก' },
    'employees.view_position': { en: 'Positions', th: 'ตำแหน่ง' },
    'employees.position_add': { en: 'Add position', th: 'เพิ่มตำแหน่ง' },
    'employees.position_edit': { en: 'Edit position', th: 'แก้ไขตำแหน่ง' },
    'employees.position_delete': { en: 'Delete position', th: 'ลบตำแหน่ง' },
    'employees.position_special': { en: 'Special Position Control', th: 'ควบคุมตำแหน่งพิเศษ' },
    'employees.view_org': { en: 'Organization chart', th: 'ผังองค์กร' },
```

(The existing `employees.view`, `employees.add`, etc. entries stay as-is.)

- [ ] **Step 2: Add keys to the LIVE set**

In the `LIVE` set, add all new employee keys after the existing `'employees.set_credentials',` line:

```ts
    'employees.module',
    'employees.view_dashboard',
    'employees.view_section',
    'employees.section_add',
    'employees.section_edit',
    'employees.section_delete',
    'employees.view_department',
    'employees.department_add',
    'employees.department_edit',
    'employees.department_delete',
    'employees.view_position',
    'employees.position_add',
    'employees.position_edit',
    'employees.position_delete',
    'employees.position_special',
    'employees.view_org',
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from this file

- [ ] **Step 4: Commit**

```bash
git add resources/js/lib/permission-labels.ts
git commit -m "feat(permissions): labels + live flags for employee tree keys"
```

---

### Task 8: EmployeePermissionTree component

**Files:**
- Create: `resources/js/components/permissions/employee-permission-tree.tsx`

**Interfaces:**
- Produces: `export function EmployeePermissionTree({ draft, setDraft, isSuper, lang }: { draft: Set<string>; setDraft: React.Dispatch<React.SetStateAction<Set<string>>>; isSuper: boolean; lang: Lang })`
- Mirrors `StockPermissionTree` prop shape exactly (so the page swaps them the same way).

- [ ] **Step 1: Create the component**

Create `resources/js/components/permissions/employee-permission-tree.tsx`. This mirrors `stock-permission-tree.tsx` with an added standalone `edit_own` row that the master never locks:

```tsx
import { actionLabel } from '@/lib/permission-labels';
import { cn } from '@/lib/utils';
import type { Lang } from '@/types';
import { Check, Lock } from 'lucide-react';

// Mirrors App\Support\Permissions::employeeHierarchy() — keep in sync.
const MASTER = 'employees.module';
const STANDALONE = 'employees.edit_own';
// `chip: false` hides the "View" tag — used for single-switch groups (Dashboard,
// Org chart) that gate their whole tab rather than a view/management split.
const GROUPS: { view: string; children: string[]; chip?: boolean }[] = [
    { view: 'employees.view_dashboard', children: [], chip: false },
    {
        view: 'employees.view',
        children: [
            'employees.add',
            'employees.import',
            'employees.edit',
            'employees.reset_password',
            'employees.resign',
            'employees.cancel_resign',
            'employees.set_credentials',
        ],
    },
    { view: 'employees.view_section', children: ['employees.section_add', 'employees.section_edit', 'employees.section_delete'] },
    { view: 'employees.view_department', children: ['employees.department_add', 'employees.department_edit', 'employees.department_delete'] },
    {
        view: 'employees.view_position',
        children: ['employees.position_add', 'employees.position_edit', 'employees.position_delete', 'employees.position_special'],
    },
    { view: 'employees.view_org', children: [], chip: false },
];
// Every key that lives under the master (excludes the standalone edit_own).
const GATED_KEYS = [MASTER, ...GROUPS.flatMap((g) => [g.view, ...g.children])];

const label = (key: string, lang: Lang) => actionLabel('employees', key.replace('employees.', ''), lang);

/** True when every ancestor (master, and the group view for a child) is on. */
function hasAncestors(key: string, has: (k: string) => boolean): boolean {
    if (!has(MASTER)) {
        return false;
    }
    const parent = GROUPS.find((g) => g.children.includes(key));
    if (parent) {
        return has(parent.view);
    }
    return true;
}

/** A single toggle, matching the matrix switch (h-5 w-9). */
function Switch({ on, locked, onClick }: { on: boolean; locked: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={locked}
            onClick={onClick}
            className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-brand' : 'bg-muted')}
        >
            <span className={cn('absolute top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-all', on ? 'left-[1.125rem]' : 'left-0.5')}>
                {on && <Check className="text-brand h-2.5 w-2.5" />}
                {locked && !on && <Lock className="text-muted-foreground h-2.5 w-2.5" />}
            </span>
        </button>
    );
}

/**
 * Renders the Employee permission card as a master → view → management tree with
 * cascade: turning a parent off clears + locks its children; turning a child on
 * implies its ancestors. `edit_own` is a standalone self-service switch the master
 * never locks. Super is read-only (everything shown on + locked).
 */
export function EmployeePermissionTree({
    draft,
    setDraft,
    isSuper,
    lang,
}: {
    draft: Set<string>;
    setDraft: React.Dispatch<React.SetStateAction<Set<string>>>;
    isSuper: boolean;
    lang: Lang;
}) {
    const has = (key: string) => isSuper || draft.has(key);
    const masterOn = has(MASTER);

    const toggle = (key: string) => {
        if (isSuper) {
            return;
        }
        setDraft((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
                if (key === MASTER) {
                    GATED_KEYS.forEach((k) => next.delete(k));
                }
                const group = GROUPS.find((g) => g.view === key);
                if (group) {
                    group.children.forEach((c) => next.delete(c));
                }
            } else {
                next.add(key);
                const parent = GROUPS.find((g) => g.children.includes(key));
                if (parent) {
                    next.add(parent.view);
                    next.add(MASTER);
                }
                if (GROUPS.some((g) => g.view === key)) {
                    next.add(MASTER);
                }
            }
            return next;
        });
    };

    const editOwnOn = has(STANDALONE);
    const gatedActive = masterOn ? GATED_KEYS.filter((k) => has(k) && hasAncestors(k, has)).length : 0;
    const activeCount = gatedActive + (editOwnOn ? 1 : 0);
    const totalCount = GATED_KEYS.length + 1; // + edit_own

    return (
        <div className="border-border rounded-lg border">
            <div className="border-border flex items-center justify-between border-b px-3.5 py-2.5">
                <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label(MASTER, lang)}</span>
                <span className={cn('font-mono text-[10.5px] font-bold', activeCount === 0 ? 'text-muted-foreground' : 'text-brand')}>
                    {activeCount}/{totalCount}
                </span>
            </div>

            <div className="bg-brand/5 border-border flex items-center gap-2.5 border-b px-3.5 py-2.5">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">{label(MASTER, lang)}</div>
                    <div className="text-muted-foreground text-[10.5px]">
                        {lang === 'th' ? 'ตัวหลัก · คุมโมดูลและไอคอนใน sidebar' : 'Master · gates the module and the sidebar icon'}
                    </div>
                </div>
                <div className="ml-auto">
                    <Switch on={masterOn} locked={isSuper} onClick={() => toggle(MASTER)} />
                </div>
            </div>

            <div className={cn('px-3.5 py-1 transition-opacity', !masterOn && 'opacity-40')}>
                {GROUPS.map((group) => {
                    const viewOn = has(group.view) && masterOn;
                    return (
                        <div key={group.view} className="py-0.5">
                            <div className="flex min-h-[34px] items-center gap-2">
                                <span className="text-sm font-medium">{label(group.view, lang)}</span>
                                <span className="ml-auto flex items-center gap-2">
                                    {group.chip !== false && (
                                        <span className="bg-brand/10 text-brand rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                                            {lang === 'th' ? 'ดู' : 'View'}
                                        </span>
                                    )}
                                    <Switch on={viewOn} locked={isSuper || !masterOn} onClick={() => toggle(group.view)} />
                                </span>
                            </div>
                            {group.children.length > 0 && (
                                <div className="border-border ml-2 space-y-0.5 border-l pl-3">
                                    {group.children.map((child) => (
                                        <div key={child} className="flex min-h-[30px] items-center gap-2">
                                            <span className="text-muted-foreground text-[12.5px]">{label(child, lang)}</span>
                                            <span className="ml-auto">
                                                <Switch on={has(child) && viewOn} locked={isSuper || !viewOn} onClick={() => toggle(child)} />
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Standalone self-service switch — never locked by the master. */}
            <div className="border-border flex items-center gap-2.5 border-t px-3.5 py-2.5">
                <div className="min-w-0">
                    <div className="text-sm font-medium">{label(STANDALONE, lang)}</div>
                    <div className="text-muted-foreground text-[10.5px]">
                        {lang === 'th' ? 'ทุกผู้ใช้แก้โปรไฟล์ตัวเองได้ · ไม่ขึ้นกับตัวหลัก' : 'Self-service · independent of the master'}
                    </div>
                </div>
                <div className="ml-auto">
                    <Switch on={editOwnOn} locked={isSuper} onClick={() => toggle(STANDALONE)} />
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/permissions/employee-permission-tree.tsx
git commit -m "feat(permissions): EmployeePermissionTree card component"
```

---

### Task 9: Render the tree in the Role Template page

**Files:**
- Modify: `resources/js/pages/permissions/index.tsx`

**Interfaces:**
- Consumes: `EmployeePermissionTree` (Task 8)

- [ ] **Step 1: Import the component**

At the top of `resources/js/pages/permissions/index.tsx`, add next to the StockPermissionTree import:

```tsx
import { EmployeePermissionTree } from '@/components/permissions/employee-permission-tree';
```

- [ ] **Step 2: Branch on the `employees` module in the card renderer**

In `RolesTab`, inside `groups.map((group) => { ... })`, directly after the existing `if (group.module === 'stock') { ... }` block, add:

```tsx
                                            if (group.module === 'employees') {
                                                return (
                                                    <EmployeePermissionTree
                                                        key={group.module}
                                                        draft={draft}
                                                        setDraft={setDraft}
                                                        isSuper={role.is_super}
                                                        lang={lang}
                                                    />
                                                );
                                            }
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual verification (build assets)**

Run: `npm run build`
Expected: build succeeds. (Ask the user to open Role Template → the Employee card now renders as a master→view tree with a standalone "Edit own profile" row; toggling master cascades; `edit_own` toggles independently.)

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/permissions/index.tsx
git commit -m "feat(permissions): render EmployeePermissionTree for the employees card"
```

---

### Task 10: Sidebar nav master gate

**Files:**
- Modify: `resources/js/lib/nav.ts:13`

**Interfaces:**
- Changes the `/employees` nav item gate from `employees.view` to `employees.module`.

- [ ] **Step 1: Change the permission**

In `resources/js/lib/nav.ts`, change the employees nav item:

```ts
            { id: 'employees', label: 'employees', to: '/employees', icon: Users, permission: 'employees.module' },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add resources/js/lib/nav.ts
git commit -m "feat(employees): gate sidebar entry by employees.module master"
```

---

### Task 11: Gate Employees page tabs + org action buttons

**Files:**
- Modify: `resources/js/pages/employees/index.tsx`

**Interfaces:**
- Consumes: `user.permissions` (existing `perms` array)
- Replaces `canManageOrg = role === 'super'` usage for section/department/position buttons with granular permission flags; keeps `role === 'super'` bypass by relying on super having all perms in `user.permissions`.

- [ ] **Step 1: Derive granular permission flags**

In `EmployeesPage`, next to the existing `canAdd`/`canImport`/... flags, add (super already holds every key via `user.permissions`):

```tsx
    const canViewDashboard = perms.includes('employees.view_dashboard');
    const canViewDirectory = perms.includes('employees.view');
    const canViewSections = perms.includes('employees.view_section');
    const canViewDepartments = perms.includes('employees.view_department');
    const canViewPositions = perms.includes('employees.view_position');
    const canViewOrg = perms.includes('employees.view_org');

    const canSectionAdd = perms.includes('employees.section_add');
    const canSectionEdit = perms.includes('employees.section_edit');
    const canSectionDelete = perms.includes('employees.section_delete');
    const canDeptAdd = perms.includes('employees.department_add');
    const canDeptEdit = perms.includes('employees.department_edit');
    const canDeptDelete = perms.includes('employees.department_delete');
    const canPosAdd = perms.includes('employees.position_add');
    const canPosEdit = perms.includes('employees.position_edit');
    const canPosDelete = perms.includes('employees.position_delete');
    const canPosSpecial = perms.includes('employees.position_special');
```

- [ ] **Step 2: Filter the tab list by view permission**

Replace the `const tabs: { id: Tab; label: string; count?: number }[] = [ ... ];` array with a filtered version:

```tsx
    const tabs: { id: Tab; label: string; count?: number }[] = [
        canViewDashboard && { id: 'dashboard' as Tab, label: t('sub_dashboard') },
        canViewDirectory && { id: 'directory' as Tab, label: t('sub_directory'), count: summary?.total },
        canViewSections && { id: 'sections' as Tab, label: t('sub_sections') },
        canViewDepartments && { id: 'departments' as Tab, label: t('sub_departments') },
        canViewPositions && { id: 'positions' as Tab, label: t('sub_positions') },
        canViewOrg && { id: 'orgchart' as Tab, label: t('sub_org_chart') },
    ].filter(Boolean) as { id: Tab; label: string; count?: number }[];
```

- [ ] **Step 3: Keep the active tab valid**

Add an effect so a landing tab the user can't see falls back to the first visible tab. Add after the `tabs` definition:

```tsx
    useEffect(() => {
        if (tabs.length > 0 && !tabs.some((tb) => tb.id === tab)) {
            changeTab(tabs[0].id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabs.map((tb) => tb.id).join(',')]);
```

- [ ] **Step 4: Replace `canManageOrg` on the position column actions/special toggle**

In `posColumns`, the `allow_special_position` Switch `disabled` prop: change `disabled={!canManageOrg || positionMut.update.isPending}` to:

```tsx
                        disabled={!canPosSpecial || positionMut.update.isPending}
```

And the `actions` column render: change `canManageOrg ? ( ... ) : ( ... )` so edit/delete buttons check their own flags. Replace the actions render body with:

```tsx
            render: (p) =>
                canPosEdit || canPosDelete ? (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {canPosEdit && (
                            <button
                                onClick={() => {
                                    setEditPos(p);
                                    setPosModalOpen(true);
                                }}
                                className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md"
                            >
                                <SquarePen className="h-4 w-4" />
                            </button>
                        )}
                        {canPosDelete && (
                            <button
                                onClick={() => handleDeletePos(p)}
                                className="text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
```

- [ ] **Step 5: Replace `canManageOrg` on department column + add button**

In `deptColumns` actions render, mirror the position pattern:

```tsx
            render: (d) =>
                canDeptEdit || canDeptDelete ? (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {canDeptEdit && (
                            <button
                                onClick={() => {
                                    setEditDept(d);
                                    setDeptModalOpen(true);
                                }}
                                className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md"
                            >
                                <SquarePen className="h-4 w-4" />
                            </button>
                        )}
                        {canDeptDelete && (
                            <button
                                onClick={() => handleDeleteDept(d)}
                                className="text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
```

Departments "Add" button (`actions={ canManageOrg && ( ... ) }`) → `actions={ canDeptAdd && ( ... ) }`.

- [ ] **Step 6: Replace `canManageOrg` on positions "Add" + sections tab**

Positions tab "Add position" button: change `{canManageOrg && ( ... )}` to `{canPosAdd && ( ... )}`.

Sections tab render: change `<SectionsTab canManage={canManageOrg} />` to pass granular flags. Update the call to:

```tsx
                    {tab === 'sections' && <SectionsTab canAdd={canSectionAdd} canEdit={canSectionEdit} canDelete={canSectionDelete} />}
```

Then open `resources/js/components/employees/sections-tab.tsx`, replace its `canManage: boolean` prop with `canAdd`, `canEdit`, `canDelete` booleans, and wire each button/action to the matching flag (Add button → `canAdd`, edit action → `canEdit`, delete action → `canDelete`). Preserve all other behavior.

- [ ] **Step 7: Remove the now-unused `canManageOrg`**

Delete the `const canManageOrg = role === 'super';` line once no references remain. Confirm with:

Run: `npx tsc --noEmit`
Expected: no "canManageOrg is not defined" and no "declared but never read" errors

- [ ] **Step 8: Build + manual verification**

Run: `npm run build`
Expected: succeeds. Ask the user to verify: a role with only `employees.view` sees just the Directory tab; a role granted `employees.view_position` + `employees.position_edit` sees the Positions tab with only the edit button (no delete, no special toggle); super sees everything.

- [ ] **Step 9: Commit**

```bash
git add resources/js/pages/employees/index.tsx resources/js/components/employees/sections-tab.tsx
git commit -m "feat(employees): gate tabs + org action buttons by granular permissions"
```

---

### Task 12: Full suite + Pint + final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the affected backend suites**

Run: `php artisan test --compact --filter=EmployeePermissionHierarchyTest`
Run: `php artisan test --compact --filter=EmployeePermissionGatingTest`
Run: `php artisan test --compact --filter=StockPermissionGatingTest`
Run: `php artisan test --compact --filter=EmployeeApiTest`
Run: `php artisan test --compact --filter=OrgChartTest`
Expected: all PASS

- [ ] **Step 2: Run Pint on changed PHP**

Run: `vendor/bin/pint --dirty --format agent`
Expected: files formatted, no manual fixes needed

- [ ] **Step 3: Full frontend typecheck + build**

Run: `npx tsc --noEmit`
Run: `npm run build`
Expected: both succeed

- [ ] **Step 4: Ask user before running the whole PHP suite**

Ask the user: "อยากรัน `php artisan test --compact` ทั้ง suite เพื่อยืนยันว่าไม่มีอะไรพังไหม?" If yes, run it.

- [ ] **Step 5: Update README with the phase summary**

Append a short section to `README.md` summarizing the Employee permission tree (per CLAUDE.md README cadence). Commit:

```bash
git add README.md
git commit -m "docs: employee permission tree summary"
```

---

## Self-Review Notes

**Spec coverage:** §2.1 keys → Task 1; §2.2 cascade → Tasks 1, 8; §2.3 write enforcement → Tasks 4, 5; §2.3 view/tab gating → Tasks 5, 10, 11; §2.3 reference reads open → Task 4/5 tests; §2.4 defaults + backfill → Tasks 2, 6; §2.5 labels+LIVE → Task 7. All covered.

**Type consistency:** `EmployeePermissionTree` prop shape (draft/setDraft/isSuper/lang) matches `StockPermissionTree` and the page's usage (Task 9). `guardSpecialFlag()` signature consistent across store/update (Task 4). `SectionsTab` prop change (canAdd/canEdit/canDelete) applied in both caller and component (Task 11 Step 6).

**Placeholder scan:** none — every code step has full code.
