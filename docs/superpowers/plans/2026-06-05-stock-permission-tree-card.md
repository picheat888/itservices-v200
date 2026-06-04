# Stock Control Hierarchical Permission Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Stock Control permission card into a master → view → management tree (15 keys) with cascade, server-side normalization, re-gated endpoints, and a live-data migration that preserves current access.

**Architecture:** A flat catalog of 15 stock keys plus a hierarchy map in PHP. Save-time normalization keeps stored grants hierarchy-consistent, so per-key `hasPermission()` checks stay valid. Read endpoints are re-gated to the new per-tab view keys. The frontend renders a Stock-specific tree component with a cascade-aware toggle. A migration grants the new keys to existing roles.

**Tech Stack:** Laravel 12 / PHP 8.2 / PHPUnit, React 19 / TypeScript, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-04-stock-permission-tree-card-design.md`
**Mockup:** `docs/mockups/stock-permission-card.html`

---

## File Structure

**Backend**
- `app/Support/Permissions.php` — add 15 stock keys, `stockHierarchy()`, `normalizeStock()`, update `defaults()`.
- `app/Http/Controllers/Api/RolePermissionController.php` — normalize on save.
- `app/Http/Controllers/Api/StockItemController.php` — add `gateDashboard()`, gate `summary()`.
- `app/Http/Controllers/Api/StockRequestController.php` — gate `index()` by `view_request`.
- `app/Http/Controllers/Api/StockMovementController.php` — gate `index`/`serials`/`labelsPdf`.
- `app/Http/Controllers/Api/StockCountController.php` — split `gate()` into view/manage.
- `database/migrations/2026_06_05_*_grant_stock_tree_permissions.php` — new.

**Frontend**
- `resources/js/lib/permission-labels.ts` — labels + LIVE for new keys.
- `resources/js/components/permissions/stock-permission-tree.tsx` — new tree component.
- `resources/js/pages/permissions/index.tsx` — render tree for stock module.
- `resources/js/pages/stock/index.tsx` — tab filtering, `can('audit')`→`can('count')`.
- `resources/js/pages/stock/tabs/dashboard-tab.tsx` — gate movements widget.
- `resources/js/pages/stock/tabs/counting-tab.tsx` — `can('audit')`→`can('count')`.
- `resources/js/lib/nav.ts` — stock nav gate → `stock.module`.

**Tests**
- `tests/Unit/StockPermissionHierarchyTest.php` — new.
- `tests/Feature/StockPermissionGatingTest.php` — new.
- `tests/Feature/StockTreeMigrationTest.php` — new.
- `tests/Feature/StockCountTest.php` — update grants.

---

## Phase A — Backend foundation

### Task 1: Catalog keys + hierarchy + normalizer

**Files:**
- Modify: `app/Support/Permissions.php`
- Test: `tests/Unit/StockPermissionHierarchyTest.php`

- [ ] **Step 1: Write the failing test**

Create `tests/Unit/StockPermissionHierarchyTest.php`:

```php
<?php

namespace Tests\Unit;

use App\Support\Permissions;
use Tests\TestCase;

class StockPermissionHierarchyTest extends TestCase
{
    public function test_catalog_exposes_the_15_stock_keys(): void
    {
        $expected = [
            'stock.module',
            'stock.view_dashboard', 'stock.view', 'stock.view_request',
            'stock.view_count', 'stock.view_events',
            'stock.manage_items', 'stock.receive', 'stock.return', 'stock.transfer',
            'stock.request', 'stock.approve', 'stock.fulfill',
            'stock.count', 'stock.events',
        ];
        foreach ($expected as $key) {
            $this->assertContains($key, Permissions::all(), "missing {$key}");
        }
        $stockKeys = array_filter(Permissions::all(), fn ($k) => str_starts_with($k, 'stock.'));
        $this->assertCount(15, $stockKeys);
    }

    public function test_normalize_drops_child_when_its_view_is_off(): void
    {
        $in = ['stock.module', 'stock.view', 'stock.receive', 'stock.fulfill']; // fulfill has no view_request
        $out = Permissions::normalizeStock($in);
        $this->assertContains('stock.receive', $out);   // view present
        $this->assertNotContains('stock.fulfill', $out); // view_request absent
    }

    public function test_normalize_drops_everything_when_master_is_off(): void
    {
        $in = ['stock.view', 'stock.receive', 'tickets.create'];
        $out = Permissions::normalizeStock($in);
        $this->assertNotContains('stock.view', $out);
        $this->assertNotContains('stock.receive', $out);
        $this->assertContains('tickets.create', $out); // non-stock untouched
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter=StockPermissionHierarchyTest`
Expected: FAIL — `normalizeStock` undefined / stock key count is 8.

- [ ] **Step 3: Implement catalog + hierarchy + normalizer**

In `app/Support/Permissions.php`, replace the `stock` catalog line:

```php
'stock' => [
    'module',
    'view_dashboard', 'view', 'view_request', 'view_count', 'view_events',
    'manage_items', 'receive', 'return', 'transfer',
    'request', 'approve', 'fulfill',
    'count', 'events',
],
```

Add these two methods to the class (after `defaults()`):

```php
/**
 * Stock permission tree used for client cascade and server normalization.
 *
 * @return array{master: string, groups: array<string, list<string>>}
 */
public static function stockHierarchy(): array
{
    return [
        'master' => 'stock.module',
        'groups' => [
            'stock.view_dashboard' => [],
            'stock.view' => ['stock.manage_items', 'stock.receive', 'stock.return', 'stock.transfer'],
            'stock.view_request' => ['stock.request', 'stock.approve', 'stock.fulfill'],
            'stock.view_count' => ['stock.count'],
            'stock.view_events' => ['stock.events'],
        ],
    ];
}

/**
 * Enforce the stock hierarchy on a granted set: a management child requires its
 * group's view key; every view key requires the master. Non-stock keys pass
 * through untouched. Returns the normalized list.
 *
 * @param  list<string>  $granted
 * @return list<string>
 */
public static function normalizeStock(array $granted): array
{
    $set = array_flip($granted);
    $hierarchy = self::stockHierarchy();

    if (! isset($set[$hierarchy['master']])) {
        return array_values(array_filter($granted, fn ($key) => ! str_starts_with($key, 'stock.')));
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

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact --filter=StockPermissionHierarchyTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/Support/Permissions.php tests/Unit/StockPermissionHierarchyTest.php
git commit -m "feat(stock): 15-key catalog + hierarchy + normalizer"
```

---

### Task 2: Update default grants

**Files:**
- Modify: `app/Support/Permissions.php` (`defaults()`)
- Test: `tests/Unit/StockPermissionHierarchyTest.php` (add a case)

- [ ] **Step 1: Add the failing test**

Append to `StockPermissionHierarchyTest`:

```php
public function test_default_grants_are_hierarchy_consistent(): void
{
    foreach (Permissions::defaults() as $role => $granted) {
        $normalized = Permissions::normalizeStock($granted);
        $stockBefore = array_values(array_filter($granted, fn ($k) => str_starts_with($k, 'stock.')));
        $stockAfter = array_values(array_filter($normalized, fn ($k) => str_starts_with($k, 'stock.')));
        sort($stockBefore);
        sort($stockAfter);
        $this->assertSame($stockBefore, $stockAfter, "default grants for {$role} are not hierarchy-consistent");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter=test_default_grants_are_hierarchy_consistent`
Expected: FAIL — `admin` has `stock.receive` etc. without `stock.module`/view keys.

- [ ] **Step 3: Update `defaults()`**

In `defaults()`, replace the three roles' stock lines:

```php
// admin
'stock.module', 'stock.view_dashboard', 'stock.view', 'stock.view_request', 'stock.view_events',
'stock.request', 'stock.approve', 'stock.fulfill', 'stock.receive', 'stock.transfer', 'stock.return',
```

```php
// hr
'stock.module', 'stock.view_dashboard', 'stock.view', 'stock.view_request', 'stock.view_events',
'stock.request',
```

```php
// user
'stock.module', 'stock.view_dashboard', 'stock.view', 'stock.view_request', 'stock.view_events',
'stock.request',
```

(Keep each role's non-stock grants exactly as they are.)

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact --filter=StockPermissionHierarchyTest`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/Support/Permissions.php tests/Unit/StockPermissionHierarchyTest.php
git commit -m "feat(stock): hierarchy-consistent default grants"
```

---

### Task 3: Normalize permissions on save

**Files:**
- Modify: `app/Http/Controllers/Api/RolePermissionController.php:70`
- Test: `tests/Feature/StockPermissionGatingTest.php`

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/StockPermissionGatingTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use Tests\TestCase;

class StockPermissionGatingTest extends TestCase
{
    /** Create a non-super user holding exactly the given permissions. */
    private function userWith(array $permissions): User
    {
        $role = Role::factory()->create(['key' => 'gate_'.uniqid(), 'is_system' => false]);
        foreach ($permissions as $p) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $p, 'allowed' => true]);
        }

        return User::factory()->create(['role_id' => $role->id]);
    }

    private function admin(): User
    {
        return User::factory()->create(['role_id' => Role::where('key', 'super')->value('id')]);
    }

    public function test_save_normalizes_away_orphan_children(): void
    {
        $admin = $this->admin();
        $role = Role::factory()->create(['key' => 'norm_test', 'is_system' => false]);

        // module + view present, but try to grant fulfill without view_request
        $this->actingAs($admin)->putJson("/api/roles/{$role->key}/permissions", [
            'permissions' => ['stock.module', 'stock.view', 'stock.receive', 'stock.fulfill'],
        ])->assertOk();

        $stored = RolePermission::where('role_id', $role->id)->where('allowed', true)->pluck('permission')->all();
        $this->assertContains('stock.receive', $stored);
        $this->assertNotContains('stock.fulfill', $stored); // dropped (no view_request)
    }
}
```

> Adjust the route name if `php artisan route:list --path=roles` shows a different
> permissions-update path; the controller is `RolePermissionController@update`.

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter=test_save_normalizes_away_orphan_children`
Expected: FAIL — `stock.fulfill` is stored (no normalization yet).

- [ ] **Step 3: Apply normalization**

In `RolePermissionController::update`, change line 70 from:

```php
$granted = $data['permissions'];
```

to:

```php
$granted = Permissions::normalizeStock($data['permissions']);
```

(`use App\Support\Permissions;` already exists at the top of the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact --filter=test_save_normalizes_away_orphan_children`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/RolePermissionController.php tests/Feature/StockPermissionGatingTest.php
git commit -m "feat(stock): normalize permission hierarchy on save"
```

---

## Phase B — Backend re-gating

### Task 4: Dashboard summary → view_dashboard

**Files:**
- Modify: `app/Http/Controllers/Api/StockItemController.php`
- Test: `tests/Feature/StockPermissionGatingTest.php`

- [ ] **Step 1: Add failing tests**

Append to `StockPermissionGatingTest`:

```php
public function test_summary_requires_view_dashboard(): void
{
    $blocked = $this->userWith(['stock.module', 'stock.view']);          // items view, no dashboard
    $allowed = $this->userWith(['stock.module', 'stock.view_dashboard']);

    $this->actingAs($blocked)->getJson('/api/stock-items/summary')->assertForbidden();
    $this->actingAs($allowed)->getJson('/api/stock-items/summary')->assertOk();
}
```

> Confirm the summary path via `php artisan route:list --path=stock-items`.

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter=test_summary_requires_view_dashboard`
Expected: FAIL — `$blocked` currently passes (gated by `stock.view`).

- [ ] **Step 3: Add `gateDashboard()` and use it in `summary()`**

In `StockItemController`, add next to `gateView()`:

```php
/** Gate the Dashboard summary to the stock.view_dashboard permission. */
private function gateDashboard(Request $request): void
{
    abort_unless((bool) $request->user()?->hasPermission('stock.view_dashboard'), 403);
}
```

In `summary()`, change `$this->gateView($request);` to `$this->gateDashboard($request);`.

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact --filter=test_summary_requires_view_dashboard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/StockItemController.php tests/Feature/StockPermissionGatingTest.php
git commit -m "feat(stock): gate dashboard summary by view_dashboard"
```

---

### Task 5: Stock requests list → view_request

**Files:**
- Modify: `app/Http/Controllers/Api/StockRequestController.php:36`
- Test: `tests/Feature/StockPermissionGatingTest.php`

- [ ] **Step 1: Add failing test**

```php
public function test_request_list_requires_view_request(): void
{
    $blocked = $this->userWith(['stock.module', 'stock.view']);
    $allowed = $this->userWith(['stock.module', 'stock.view_request']);

    $this->actingAs($blocked)->getJson('/api/stock-requests')->assertForbidden();
    $this->actingAs($allowed)->getJson('/api/stock-requests')->assertOk();
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter=test_request_list_requires_view_request`
Expected: FAIL — `$blocked` passes (gated by `stock.view`).

- [ ] **Step 3: Re-gate**

In `StockRequestController.php:36`, change `'stock.view'` to `'stock.view_request'`:

```php
abort_unless((bool) $user?->hasPermission('stock.view_request'), 403);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact --filter=test_request_list_requires_view_request`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/StockRequestController.php tests/Feature/StockPermissionGatingTest.php
git commit -m "feat(stock): gate request list by view_request"
```

---

### Task 6: Movements → view_events / events (+ labelsPdf coupling)

**Files:**
- Modify: `app/Http/Controllers/Api/StockMovementController.php:49,77,114`
- Test: `tests/Feature/StockPermissionGatingTest.php`

- [ ] **Step 1: Add failing tests**

```php
public function test_movement_log_requires_view_events(): void
{
    $blocked = $this->userWith(['stock.module', 'stock.view']);
    $allowed = $this->userWith(['stock.module', 'stock.view_events']);

    $this->actingAs($blocked)->getJson('/api/stock-movements')->assertForbidden();
    $this->actingAs($allowed)->getJson('/api/stock-movements')->assertOk();
}

public function test_labels_pdf_allowed_for_a_receiver_without_events(): void
{
    $receiver = $this->userWith(['stock.module', 'stock.view', 'stock.receive']);
    $movement = \App\Models\StockMovement::factory()->create(['type' => 'receive']);

    // 200 (PDF stream) — not 403; receiver may print even without stock.events
    $this->actingAs($receiver)->get("/api/stock-movements/{$movement->id}/labels/pdf")->assertOk();
}
```

> If `StockMovement` has no factory, create the movement via `StockMovementController@store`
> as the receiver, or build it with `StockMovement::create([...])` using required columns
> from `database-schema stock_movements`.

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter="test_movement_log_requires_view_events|test_labels_pdf_allowed_for_a_receiver_without_events"`
Expected: FAIL — log gated by `stock.view` (blocked passes); labels gated by `stock.view` (receiver may 403 if lacking view).

- [ ] **Step 3: Re-gate the three endpoints**

`StockMovementController.php` — `index()` line 49:

```php
abort_unless((bool) $request->user()?->hasPermission('stock.view_events'), 403);
```

`serials()` line 77:

```php
abort_unless((bool) $request->user()?->hasPermission('stock.events'), 403);
```

`labelsPdf()` line 114 — events OR any movement-write permission:

```php
$user = $request->user();
abort_unless((bool) (
    $user?->hasPermission('stock.events')
    || $user?->hasPermission('stock.receive')
    || $user?->hasPermission('stock.return')
    || $user?->hasPermission('stock.transfer')
), 403);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact --filter="test_movement_log_requires_view_events|test_labels_pdf_allowed_for_a_receiver_without_events"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/StockMovementController.php tests/Feature/StockPermissionGatingTest.php
git commit -m "feat(stock): gate movement log/serials by events; labels allow writers"
```

---

### Task 7: Counting → view_count (read) / count (write)

**Files:**
- Modify: `app/Http/Controllers/Api/StockCountController.php`
- Test: `tests/Feature/StockPermissionGatingTest.php`, update `tests/Feature/StockCountTest.php`

- [ ] **Step 1: Add failing tests**

In `StockPermissionGatingTest`:

```php
public function test_count_list_requires_view_count_and_open_requires_count(): void
{
    $viewer = $this->userWith(['stock.module', 'stock.view_count']);
    $manager = $this->userWith(['stock.module', 'stock.view_count', 'stock.count']);

    $this->actingAs($viewer)->getJson('/api/stock-counts')->assertOk();        // list = view_count
    $this->actingAs($viewer)->postJson('/api/stock-counts', [])->assertForbidden(); // open needs count
    $this->actingAs($manager)->postJson('/api/stock-counts', [])->assertCreated();
}
```

> Confirm paths with `php artisan route:list --path=stock-counts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter=test_count_list_requires_view_count_and_open_requires_count`
Expected: FAIL — all methods currently gated by `stock.audit`.

- [ ] **Step 3: Split the gate**

In `StockCountController`, replace `gate()` with two gates and update call sites:

```php
/** Read access to count sessions. */
private function gateView(Request $request): void
{
    abort_unless((bool) $request->user()?->hasPermission('stock.view_count'), 403);
}

/** Mutating a count session (open/save/commit/cancel). */
private function gateManage(Request $request): void
{
    abort_unless((bool) $request->user()?->hasPermission('stock.count'), 403);
}
```

Then: `index()` and `show()` call `$this->gateView($request);`. `store()`, `update()`,
`commit()`, `destroy()` call `$this->gateManage($request);`.

- [ ] **Step 4: Update `StockCountTest`**

In `tests/Feature/StockCountTest.php:170`, the test grants `stock.audit`. Replace that grant with both new keys so the existing flow (open→save→commit) still passes:

```php
foreach (['stock.module', 'stock.view_count', 'stock.count'] as $p) {
    RolePermission::create(['role_id' => $user->role_id, 'permission' => $p, 'allowed' => true]);
}
```

(Remove the single `stock.audit` line.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `php artisan test --compact --filter="test_count_list_requires_view_count_and_open_requires_count|StockCountTest"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/Http/Controllers/Api/StockCountController.php tests/Feature/StockPermissionGatingTest.php tests/Feature/StockCountTest.php
git commit -m "feat(stock): split counting gate into view_count/count"
```

---

## Phase C — Migration

### Task 8: Grant new keys to existing roles

**Files:**
- Create: `database/migrations/2026_06_05_120000_grant_stock_tree_permissions.php`
- Test: `tests/Feature/StockTreeMigrationTest.php`

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/StockTreeMigrationTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\RolePermission;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class StockTreeMigrationTest extends TestCase
{
    public function test_role_with_old_view_gains_module_and_per_tab_views(): void
    {
        $role = Role::factory()->create(['key' => 'legacy_stock', 'is_system' => false]);
        // Simulate a pre-migration role: only the old module-wide view + an action.
        RolePermission::where('role_id', $role->id)->delete();
        RolePermission::insert([
            ['role_id' => $role->id, 'permission' => 'stock.view', 'allowed' => true],
            ['role_id' => $role->id, 'permission' => 'stock.receive', 'allowed' => true],
        ]);

        Artisan::call('migrate', ['--path' => 'database/migrations/2026_06_05_120000_grant_stock_tree_permissions.php', '--force' => true]);

        $granted = RolePermission::where('role_id', $role->id)->where('allowed', true)->pluck('permission')->all();
        foreach (['stock.module', 'stock.view', 'stock.view_dashboard', 'stock.view_request', 'stock.view_events', 'stock.receive'] as $k) {
            $this->assertContains($k, $granted, "expected {$k}");
        }
        $this->assertNotContains('stock.view_count', $granted); // no old audit grant
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter=StockTreeMigrationTest`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

Create `database/migrations/2026_06_05_120000_grant_stock_tree_permissions.php`:

```php
<?php

use App\Models\RolePermission;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Introduce the stock tree keys for existing roles so no current user loses
     * access: any role with a stock.* grant gets the master; holders of the old
     * module-wide stock.view gain the per-tab dashboard/request/events views.
     * Additive and idempotent (updateOrCreate).
     */
    public function up(): void
    {
        $roleIds = RolePermission::where('permission', 'like', 'stock.%')
            ->where('allowed', true)
            ->distinct()
            ->pluck('role_id');

        foreach ($roleIds as $roleId) {
            $has = fn (string $key) => RolePermission::where('role_id', $roleId)
                ->where('permission', $key)->where('allowed', true)->exists();

            $grants = ['stock.module'];
            if ($has('stock.view')) {
                $grants = array_merge($grants, ['stock.view_dashboard', 'stock.view_events', 'stock.view_request']);
            }
            if ($has('stock.request')) {
                $grants[] = 'stock.view_request';
            }

            foreach (array_unique($grants) as $key) {
                RolePermission::updateOrCreate(
                    ['role_id' => $roleId, 'permission' => $key],
                    ['allowed' => true],
                );
            }
        }
    }

    /** Irreversible data backfill. */
    public function down(): void
    {
        //
    }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact --filter=StockTreeMigrationTest`
Expected: PASS.

- [ ] **Step 5: Run the migration against the live DB**

Run: `php artisan migrate --no-interaction`
Expected: the new migration runs `DONE`.

Verify with `database-query`:
```sql
SELECT r.key, GROUP_CONCAT(rp.permission ORDER BY rp.permission) AS perms
FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
WHERE rp.permission LIKE 'stock.%' AND rp.allowed = 1 GROUP BY r.key;
```
Expected: every stock-using role now has `stock.module` + its view keys.

- [ ] **Step 6: Commit**

```bash
git add database/migrations/2026_06_05_120000_grant_stock_tree_permissions.php tests/Feature/StockTreeMigrationTest.php
git commit -m "feat(stock): migration granting tree permissions to existing roles"
```

---

## Phase D — Frontend

### Task 9: Permission labels + LIVE for new keys

**Files:**
- Modify: `resources/js/lib/permission-labels.ts`

- [ ] **Step 1: Add the new ACTIONS labels**

In the `ACTIONS` map, the stock block becomes (replace the existing stock entries):

```ts
'stock.module': { en: 'Stock Module', th: 'โมดูลคลังพัสดุ' },
'stock.view_dashboard': { en: 'Dashboard', th: 'แดชบอร์ด' },
'stock.view': { en: 'Stock item', th: 'รายการพัสดุ' },
'stock.view_request': { en: 'Request', th: 'คำขอเบิก' },
'stock.view_count': { en: 'Counting', th: 'การนับสต็อก' },
'stock.view_events': { en: 'Event', th: 'การเคลื่อนไหว' },
'stock.manage_items': { en: 'Manage SKU', th: 'จัดการรายการสินค้า (SKU, Min/Max)' },
'stock.receive': { en: 'Receive', th: 'รับเข้าคลัง' },
'stock.return': { en: 'Return', th: 'รับคืนพัสดุ' },
'stock.transfer': { en: 'Transfer', th: 'ย้ายระหว่างคลัง' },
'stock.request': { en: 'New Request', th: 'ขอเบิกพัสดุ' },
'stock.approve': { en: 'Approve Request', th: 'อนุมัติคำขอเบิก' },
'stock.fulfill': { en: 'Issue / Fulfill', th: 'จ่ายของ' },
'stock.count': { en: 'Counting', th: 'นับสต็อก' },
'stock.events': { en: 'Events', th: 'ดูการเคลื่อนไหว' },
```

- [ ] **Step 2: Update the LIVE set**

In the `LIVE` Set, replace the old stock block with all 15 keys:

```ts
'stock.module',
'stock.view_dashboard', 'stock.view', 'stock.view_request', 'stock.view_count', 'stock.view_events',
'stock.manage_items', 'stock.receive', 'stock.return', 'stock.transfer',
'stock.request', 'stock.approve', 'stock.fulfill',
'stock.count', 'stock.events',
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors from this file.

- [ ] **Step 4: Commit**

```bash
git add resources/js/lib/permission-labels.ts
git commit -m "feat(stock): labels + LIVE for tree permission keys"
```

---

### Task 10: Stock permission tree component + matrix integration

**Files:**
- Create: `resources/js/components/permissions/stock-permission-tree.tsx`
- Modify: `resources/js/pages/permissions/index.tsx`

- [ ] **Step 1: Create the tree component**

Create `resources/js/components/permissions/stock-permission-tree.tsx`:

```tsx
import { actionLabel } from '@/lib/permission-labels';
import { cn } from '@/lib/utils';
import type { Lang } from '@/types';
import { Check, Lock } from 'lucide-react';

// Mirrors App\Support\Permissions::stockHierarchy() — keep in sync.
const MASTER = 'stock.module';
const GROUPS: { view: string; children: string[] }[] = [
    { view: 'stock.view_dashboard', children: [] },
    { view: 'stock.view', children: ['stock.manage_items', 'stock.receive', 'stock.return', 'stock.transfer'] },
    { view: 'stock.view_request', children: ['stock.request', 'stock.approve', 'stock.fulfill'] },
    { view: 'stock.view_count', children: ['stock.count'] },
    { view: 'stock.view_events', children: ['stock.events'] },
];
const ALL_KEYS = [MASTER, ...GROUPS.flatMap((g) => [g.view, ...g.children])];

const label = (key: string, lang: Lang) => actionLabel('stock', key.replace('stock.', ''), lang);

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
 * Renders the Stock permission card as a master → view → management tree with
 * cascade: turning a parent off clears + locks its children; turning a child on
 * implies its ancestors. Super is read-only (everything shown on + locked).
 */
export function StockPermissionTree({
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
        if (isSuper) return;
        setDraft((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
                if (key === MASTER) ALL_KEYS.forEach((k) => next.delete(k));
                const group = GROUPS.find((g) => g.view === key);
                if (group) group.children.forEach((c) => next.delete(c));
            } else {
                next.add(key);
                const parent = GROUPS.find((g) => g.children.includes(key));
                if (parent) {
                    next.add(parent.view);
                    next.add(MASTER);
                }
                if (GROUPS.some((g) => g.view === key)) next.add(MASTER);
            }
            return next;
        });
    };

    const activeCount = masterOn ? ALL_KEYS.filter((k) => has(k) && (k === MASTER || hasAncestors(k, has))).length : 0;

    return (
        <div className="border-border rounded-lg border">
            {/* card header */}
            <div className="border-border flex items-center justify-between border-b px-3.5 py-2.5">
                <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label(MASTER, lang)}</span>
                <span className={cn('font-mono text-[10.5px] font-bold', activeCount === 0 ? 'text-muted-foreground' : 'text-brand')}>
                    {activeCount}/{ALL_KEYS.length}
                </span>
            </div>

            {/* master row */}
            <div className="bg-brand/[0.035] flex items-center gap-2.5 border-b px-3.5 py-2.5">
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

            {/* groups */}
            <div className={cn('px-3.5 py-1 transition-opacity', !masterOn && 'opacity-40')}>
                {GROUPS.map((group) => {
                    const viewOn = has(group.view) && masterOn;
                    return (
                        <div key={group.view} className="py-0.5">
                            <div className="flex min-h-[34px] items-center gap-2">
                                <span className="text-sm font-medium">{label(group.view, lang)}</span>
                                <span className="ml-auto flex items-center gap-2">
                                    <span className="bg-brand/10 text-brand rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                                        {lang === 'th' ? 'ดู' : 'View'}
                                    </span>
                                    <Switch on={viewOn} locked={isSuper || !masterOn} onClick={() => toggle(group.view)} />
                                </span>
                            </div>
                            {group.children.length > 0 && (
                                <div className="border-rail/0 relative ml-1 space-y-0.5 pl-4 before:absolute before:top-0 before:bottom-3 before:left-1 before:w-px before:bg-current/15">
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
        </div>
    );
}

/** True when every ancestor (master, and the group view for a child) is on. */
function hasAncestors(key: string, has: (k: string) => boolean): boolean {
    if (!has(MASTER)) return false;
    const parent = GROUPS.find((g) => g.children.includes(key));
    if (parent) return has(parent.view);
    return true;
}
```

- [ ] **Step 2: Render the tree for the stock module in the matrix**

In `resources/js/pages/permissions/index.tsx`:

Add the import near the top:

```tsx
import { StockPermissionTree } from '@/components/permissions/stock-permission-tree';
```

In `RolesTab`, inside the `groups.map((group) => { ... })` block, special-case stock.
Find the line that opens each module card:

```tsx
return (
    <div key={group.module} className="border-border rounded-lg border p-3.5">
```

Immediately before it, short-circuit the stock module to the tree (full width):

```tsx
if (group.module === 'stock') {
    return (
        <div key={group.module} className="md:col-span-2">
            <StockPermissionTree draft={draft} setDraft={setDraft} isSuper={role.is_super} lang={lang} />
        </div>
    );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 4: Manual build + visual check**

Run: `npm run build`
Then load the Permissions page (Roles tab), pick a non-super role, and verify:
master cascade, view chips, child rails, lock glyph, save persists a normalized set.

- [ ] **Step 5: Commit**

```bash
git add resources/js/components/permissions/stock-permission-tree.tsx resources/js/pages/permissions/index.tsx
git commit -m "feat(stock): hierarchical Stock permission tree in the matrix"
```

---

### Task 11: Stock page — tab filtering + count rename + events gating

**Files:**
- Modify: `resources/js/pages/stock/index.tsx`

- [ ] **Step 1: Filter tabs by their view key**

In `resources/js/pages/stock/index.tsx`, the `tabs` array (around line 320) is rendered
unfiltered. Replace the `tabs.map(...)` source with a filtered list. First, give each tab
its view key, then filter:

```tsx
const allTabs = [
    { id: 'dashboard' as const, label: t('sub_dashboard'), view: 'view_dashboard' },
    { id: 'items' as const, label: t('stock_items_tab'), count: summary?.skus, view: 'view' },
    { id: 'requests' as const, label: t('stock_requests_tab'), count: outstandingRequests || undefined, view: 'view_request' },
    { id: 'audit' as const, label: t('stock_audit_tab'), count: draftCounts || undefined, view: 'view_count' },
    { id: 'movements' as const, label: t('stock_movements_tab'), view: 'view_events' },
];
const tabs = allTabs.filter((tb) => can(tb.view));
```

- [ ] **Step 2: Rename count gating**

Change line 193 from:

```tsx
const { data: countSessions = [] } = useStockCounts(can('audit'));
```

to:

```tsx
const { data: countSessions = [] } = useStockCounts(can('view_count'));
```

- [ ] **Step 3: Keep the default tab valid**

After the `tabs` filter, ensure the active tab is visible (a role may lack `view_dashboard`):

```tsx
useEffect(() => {
    if (tabs.length > 0 && !tabs.some((tb) => tb.id === tab)) {
        setTab(tabs[0].id);
    }
}, [tabs, tab]);
```

(Place near the other hooks; `useEffect` is already imported, else add it.)

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: no new errors; page builds.

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/stock/index.tsx
git commit -m "feat(stock): filter stock tabs by per-tab view permission"
```

---

### Task 12: Dashboard — gate the movements widget

**Files:**
- Modify: `resources/js/pages/stock/tabs/dashboard-tab.tsx`
- Modify: `resources/js/pages/stock/index.tsx` (pass `canEvents` prop)

- [ ] **Step 1: Accept a `canEvents` prop and gate the query**

In `dashboard-tab.tsx`, extend the props and gate the movements query + its render:

```tsx
export function DashboardTab({
    summary,
    t,
    kpis,
    onSelectWarehouse,
    onSelectCategory,
    canEvents,
}: {
    summary: ReturnType<typeof useStockSummary>['data'];
    t: ReturnType<typeof useT>;
    kpis: Kpi[];
    onSelectWarehouse: (warehouse: string) => void;
    onSelectCategory: (category: string) => void;
    canEvents: boolean;
}) {
    const { data: movements = [] } = useStockMovements(undefined, canEvents);
    // ...rest unchanged; wrap the "recent movements" console in {canEvents && ( ... )}
```

Wrap the JSX block that lists `movements` with `{canEvents && ( ... )}`.

- [ ] **Step 2: Make `useStockMovements` accept an `enabled` flag**

In `resources/js/hooks/use-stock.ts`, line 59:

```ts
export const useStockMovements = (type?: string, enabled = true) =>
    useQuery({ queryKey: [...MOVEMENTS, type ?? 'all'], queryFn: () => stockMovementApi.list({ type }), enabled });
```

- [ ] **Step 3: Pass the prop from the stock page**

In `resources/js/pages/stock/index.tsx`, where `<DashboardTab .../>` is rendered, add:

```tsx
canEvents={can('view_events')}
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add resources/js/pages/stock/tabs/dashboard-tab.tsx resources/js/hooks/use-stock.ts resources/js/pages/stock/index.tsx
git commit -m "feat(stock): gate dashboard movements widget by view_events"
```

---

### Task 13: Counting tab — can('audit') → can('count')

**Files:**
- Modify: `resources/js/pages/stock/tabs/counting-tab.tsx`

- [ ] **Step 1: Swap the permission references**

In `counting-tab.tsx`, replace every `can('audit')` with the correct key:
- line 19 (`useStockCounts(can('audit'))`) → `can('view_count')` (reading the list).
- lines 260, 298, 595 (action buttons: new count / commit) → `can('count')`.

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add resources/js/pages/stock/tabs/counting-tab.tsx
git commit -m "feat(stock): counting tab reads view_count, acts on count"
```

---

### Task 14: Sidebar — follow the master key

**Files:**
- Modify: `resources/js/lib/nav.ts:30`

- [ ] **Step 1: Change the stock nav gate**

In `nav.ts:30`, change `permission: 'stock.view'` to `permission: 'stock.module'`:

```ts
{ id: 'stock', label: 'stock', to: '/stock', icon: Warehouse, permission: 'stock.module' },
```

- [ ] **Step 2: Verify the sidebar badge gate still resolves**

In `resources/js/components/shell/sidebar.tsx:37`, the badge uses `perms.includes('stock.view')`.
Leave it as `stock.view` (the badge counts item-level "needs attention"); it is independent
of icon visibility. No change needed.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add resources/js/lib/nav.ts
git commit -m "feat(stock): sidebar Stock icon follows stock.module"
```

---

## Phase E — Finalize

### Task 15: Full verification

- [ ] **Step 1: Run the full backend suite**

Run: `php artisan test --compact`
Expected: all green (pay attention to `StockWorkflowTest`, `StockCountTest`,
`SettingsPermissionsTest`, the three new test files).

- [ ] **Step 2: Format PHP**

Run: `vendor/bin/pint --dirty --format agent`
Expected: `{"tool":"pint","result":"passed"}`.

- [ ] **Step 3: Build frontend**

Run: `npm run build`
Expected: builds with no errors.

- [ ] **Step 4: Manual smoke test (real app)**

As super: open Permissions → Roles → confirm the Stock tree renders, all-on + locked.
Create/select a non-super role: toggle master off → all lock; toggle a view off → its
children lock; save → reopen → state persists normalized. Open the Stock page as that
role and confirm only permitted tabs appear and the dashboard movements widget honors
`view_events`.

- [ ] **Step 5: Update README (per project cadence)**

Add a short entry under the RBAC section summarizing the Stock tree (master → view →
management, 15 keys, normalization-on-save, migration). One consolidated entry — do not
log each task.

- [ ] **Step 6: Final commit**

```bash
git add Readme.md
git commit -m "docs(stock): README note for hierarchical Stock permissions"
```

---

## Self-Review notes
- **Spec coverage:** key model (T1), defaults (T2), normalize-on-save (T3), re-gating
  dashboard/request/movements/serials/labels/count (T4–T7), migration (T8), labels/LIVE
  (T9), tree UI + cascade (T10), tab filtering + count rename (T11), dashboard widget
  coupling (T12), counting tab (T13), sidebar master (T14), verification + README (T15).
- **Coupling resolutions:** dashboard widget → T12; labelsPdf writers → T6.
- **Naming consistency:** `stock.view_*` keys, `stock.count`/`stock.events`,
  `stockHierarchy()`/`normalizeStock()`, `gateDashboard`/`gateView`/`gateManage` used
  consistently across backend tasks and the frontend `GROUPS` mirror.
