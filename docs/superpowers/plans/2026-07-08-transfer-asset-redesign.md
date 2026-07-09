# Transfer Asset Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text asset ownership with an `owner_employee_id` FK, give the transfer UI two explicit modes (Employee / Shared), and block writing off an asset that is still held by an employee.

**Architecture:** Add a nullable `assets.owner_employee_id` FK → `employees(id)` that is the single source of truth for "is this asset held by an employee?". The existing `owner` string stays as a display label (employee `code` in employee mode, a free label in shared mode, `null` in the pool). `AssetService::transfer` becomes mode-aware; the write-off paths and the my-assets / accept / request-return authorization all key off the FK instead of the owner string. The Sheet-based transfer drawer becomes a centered Dialog with a segmented Employee/Shared toggle.

**Tech Stack:** Laravel 12 (PHP 8.2), PHPUnit 11 feature tests (SQLite in-memory via `RefreshDatabase`), React 19 + TypeScript, TanStack Query, Tailwind v4, i18n via `useT()`.

## Global Constraints

- **API response format:** success returns `{ "data": {...}, "message": "success" }` via `AssetResource`; validation errors return `422` with `{ "message", "errors" }`. Copy the existing controller idioms.
- **DB columns are `snake_case`; PHP methods are `camelCase`.**
- **Migrations must be SQLite-safe** (tests run on SQLite via `RefreshDatabase`). Use correlated-subquery `UPDATE` statements exactly like `2026_07_06_050012_convert_assets_location_to_fk.php`, not `UPDATE ... JOIN`.
- **No business logic in controllers** — it lives in `App\Services\Asset\AssetService`.
- **Every PHP method gets a docblock** describing what it does (project rule).
- **Frontend: no hardcoded UI strings** — all copy goes through `useT()` with keys in both `lang/en/asset.ts` and `lang/th/asset.ts`. **No inline `style=`** — Tailwind classes only.
- **After any PHP change** run `vendor/bin/pint --dirty --format agent` before finalizing.
- **Run tests** with `php artisan test --compact --filter=AssetApiTest`.
- Do **not** change the contract cancel/end rule, `initial_owner`, or the `asset_transfers` history (they stay free-text snapshots).

---

## File Structure

**Backend**
- `database/migrations/2026_07_08_000000_add_owner_employee_id_to_assets_table.php` — **create**. Adds FK column + backfills from `owner` codes.
- `app/Models/Asset/Asset.php` — **modify**. `ownerEmployee()` relation, `$fillable`, `heldByEmployee()`.
- `app/Http/Resources/Asset/AssetResource.php` — **modify**. Expose `owner_employee_id`, `owner_name`.
- `app/Services/Asset/AssetService.php` — **modify**. `transfer(array)`, `notifyRecipient` via FK, `markReceived` clears FK, write-off guard in `retire()` + `bulkSetStatus()`.
- `app/Http/Controllers/Api/Asset/AssetController.php` — **modify**. `transfer` mode validation, `mine`/`accept`/`requestReturn` key off FK, eager-load `ownerEmployee`.
- `tests/Feature/AssetApiTest.php` — **modify**. New transfer/guard tests + update existing tests to set the FK / new payload.

**Frontend**
- `resources/js/modules/asset/components/asset-transfer-dialog.tsx` — **create** (replaces `asset-transfer-drawer.tsx`).
- `resources/js/modules/asset/components/asset-transfer-drawer.tsx` — **delete** after the caller is switched.
- `resources/js/modules/asset/pages/index.tsx` — **modify**. Import + render the renamed component.
- `resources/js/modules/asset/api/assetApi.ts` — **modify**. New `transfer` payload.
- `resources/js/modules/asset/hooks/use-assets.ts` — **modify**. `transfer` mutation payload.
- `resources/js/shared/types/index.ts` — **modify**. `Asset` gains `owner_employee_id`, `owner_name`.
- `resources/js/lang/en/asset.ts`, `resources/js/lang/th/asset.ts` — **modify**. New keys.

---

## Task 1: Data foundation — FK column, model relation, resource fields

**Files:**
- Create: `database/migrations/2026_07_08_000000_add_owner_employee_id_to_assets_table.php`
- Modify: `app/Models/Asset/Asset.php:36-41` (fillable), `:100-111` (add relation near other BelongsTo), `:143-147` (add helper near `isDeployed`)
- Modify: `app/Http/Resources/Asset/AssetResource.php:34-35`
- Test: `tests/Feature/AssetApiTest.php`

**Interfaces:**
- Produces: migration column `assets.owner_employee_id` (nullable FK → `employees.id`, `nullOnDelete`); `Asset::ownerEmployee(): BelongsTo`; `Asset::heldByEmployee(): bool`; `AssetResource` keys `owner_employee_id` (int|null) and `owner_name` (string|null).

- [ ] **Step 1: Write the failing tests**

Add these tests to `tests/Feature/AssetApiTest.php` (before the final `}`):

```php
public function test_migration_backfills_owner_employee_id_from_owner_code(): void
{
    // Simulate legacy data: an asset whose owner string is an employee code but whose
    // FK was never populated. Insert directly so the model's transfer flow doesn't set it.
    $employee = Employee::create(['code' => 'EMP-3300', 'first_name' => 'Legacy', 'last_name' => 'Owner']);
    $asset = Asset::factory()->create(['owner' => 'EMP-3300']);
    Asset::whereKey($asset->id)->update(['owner_employee_id' => null]);

    // Re-run the exact backfill the migration performs (SQLite-safe correlated subquery).
    \Illuminate\Support\Facades\DB::statement(
        'UPDATE assets SET owner_employee_id = (SELECT id FROM employees WHERE employees.code = assets.owner) '
        .'WHERE owner_employee_id IS NULL AND owner IS NOT NULL'
    );

    $this->assertSame($employee->id, $asset->fresh()->owner_employee_id);
}

public function test_held_by_employee_reflects_the_fk(): void
{
    $held = Asset::factory()->create(['owner_employee_id' => Employee::create(['code' => 'EMP-3301', 'first_name' => 'A', 'last_name' => 'B'])->id]);
    $pool = Asset::factory()->create(['owner_employee_id' => null]);

    $this->assertTrue($held->heldByEmployee());
    $this->assertFalse($pool->heldByEmployee());
}

public function test_resource_exposes_owner_employee_id_and_owner_name(): void
{
    $this->actingAs($this->super());
    $employee = Employee::create(['code' => 'EMP-3302', 'first_name' => 'Han', 'last_name' => 'Solo']);
    $asset = Asset::factory()->create(['owner' => 'EMP-3302', 'owner_employee_id' => $employee->id]);

    $this->getJson("/api/assets/{$asset->id}")
        ->assertOk()
        ->assertJsonPath('data.owner_employee_id', $employee->id)
        ->assertJsonPath('data.owner_name', 'Han Solo');
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `php artisan test --compact --filter='test_migration_backfills_owner_employee_id_from_owner_code|test_held_by_employee_reflects_the_fk|test_resource_exposes_owner_employee_id_and_owner_name'`
Expected: FAIL — `owner_employee_id` column/attribute missing, `heldByEmployee()` undefined, `owner_name` path missing.

- [ ] **Step 3: Create the migration**

Create `database/migrations/2026_07_08_000000_add_owner_employee_id_to_assets_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add a real FK to the employee who holds an asset so "held by an employee" is a
     * reliable fact, not a string guess. The existing `owner` string stays as a display
     * label. Backfill matches any `owner` value equal to an `employees.code` (shared
     * labels won't match and keep a null FK).
     */
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('owner_employee_id')->nullable()->after('owner')
                ->constrained('employees')->nullOnDelete();
        });

        // SQLite-safe correlated subquery (same idiom as the location→FK migration).
        DB::statement(
            'UPDATE assets SET owner_employee_id = (SELECT id FROM employees WHERE employees.code = assets.owner) '
            .'WHERE owner IS NOT NULL'
        );
    }

    /** Drop the FK column; the `owner` string already carries the display label. */
    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('owner_employee_id');
        });
    }
};
```

- [ ] **Step 4: Update the Asset model**

In `app/Models/Asset/Asset.php`, add `'owner_employee_id'` to `$fillable` (put it right after `'owner'`):

```php
    protected $fillable = [
        'tag', 'nickname', 'category_id', 'brand_id', 'model_id', 'serial', 'source', 'status',
        'owner', 'owner_employee_id', 'initial_owner', 'department', 'location_id', 'warehouse_id', 'value', 'vendor_id',
        'purchase_date', 'warranty_end', 'warranty_lifetime', 'contract_id', 'lease_start', 'lease_end',
        'registered_date', 'owned_since', 'notes', 'last_reason',
    ];
```

Add the relation next to the other `BelongsTo` relations (e.g. after `location()`), plus the import for `Employee` at the top (`use App\Models\Employee\Employee;`):

```php
    /**
     * The employee who currently holds this asset (null for pooled or shared assets).
     * Named ownerEmployee, not owner, because the `owner` string column would shadow
     * an owner() relation.
     */
    public function ownerEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'owner_employee_id');
    }
```

Add the helper next to `isDeployed()`:

```php
    /** True when an employee currently holds this asset — blocks write-off until returned. */
    public function heldByEmployee(): bool
    {
        return $this->owner_employee_id !== null;
    }
```

- [ ] **Step 5: Update AssetResource**

In `app/Http/Resources/Asset/AssetResource.php`, add two keys right after the existing `'owner' => $this->owner,` line (line 34):

```php
            'owner' => $this->owner,
            'owner_employee_id' => $this->owner_employee_id,
            // Display name of the holder: the employee's full name in employee mode,
            // else the free-text shared label, else null (pool).
            'owner_name' => $this->owner_employee_id ? $this->ownerEmployee?->name : $this->owner,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `php artisan test --compact --filter='test_migration_backfills_owner_employee_id_from_owner_code|test_held_by_employee_reflects_the_fk|test_resource_exposes_owner_employee_id_and_owner_name'`
Expected: PASS (3 tests).

- [ ] **Step 7: Format + commit**

```bash
vendor/bin/pint --dirty --format agent
git add database/migrations/2026_07_08_000000_add_owner_employee_id_to_assets_table.php app/Models/Asset/Asset.php app/Http/Resources/Asset/AssetResource.php tests/Feature/AssetApiTest.php
git commit -m "feat(asset): add owner_employee_id FK, ownerEmployee relation, resource fields"
```

---

## Task 2: Two-mode transfer (Employee / Shared)

**Files:**
- Modify: `app/Services/Asset/AssetService.php:106-143` (`transfer` + `notifyRecipient`)
- Modify: `app/Http/Controllers/Api/Asset/AssetController.php:211-227` (`transfer`)
- Test: `tests/Feature/AssetApiTest.php`

**Interfaces:**
- Consumes: `Asset::ownerEmployee` (Task 1), `Asset::heldByEmployee()`.
- Produces: `AssetService::transfer(Asset $asset, array $data, ?string $performedBy = null): Asset` where `$data` = `['mode' => 'employee'|'shared', 'owner_employee_id' => int|null, 'owner_label' => string|null, 'location_id' => int, 'reason' => string|null]`. Employee mode → `status = PendingAcceptance`, `owner = employee.code`, FK set, recipient notified. Shared mode → `status = Deployed`, `owner = owner_label`, FK null, no notification.

- [ ] **Step 1: Write the failing tests**

Add to `tests/Feature/AssetApiTest.php`:

```php
public function test_transfer_employee_mode_sets_fk_and_pends_acceptance(): void
{
    $employee = Employee::create(['code' => 'EMP-4001', 'first_name' => 'New', 'last_name' => 'Hire']);
    $this->actingAs($this->super());
    $asset = Asset::factory()->create(['status' => 'ready', 'owner' => 'Pool — IT', 'owner_employee_id' => null]);
    $location = Location::create(['name' => 'HQ Floor 3']);

    $this->postJson("/api/assets/{$asset->id}/transfer", [
        'mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id, 'reason' => 'New hire',
    ])
        ->assertOk()
        ->assertJsonPath('data.status', 'pending_acceptance')
        ->assertJsonPath('data.owner', 'EMP-4001')
        ->assertJsonPath('data.owner_employee_id', $employee->id)
        ->assertJsonPath('data.location', 'HQ Floor 3');
}

public function test_transfer_shared_mode_deploys_without_an_employee(): void
{
    $this->actingAs($this->super());
    $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null]);
    $location = Location::create(['name' => 'Server Room']);

    $this->postJson("/api/assets/{$asset->id}/transfer", [
        'mode' => 'shared', 'owner_label' => 'Rack 2', 'location_id' => $location->id,
    ])
        ->assertOk()
        ->assertJsonPath('data.status', 'deployed')
        ->assertJsonPath('data.owner', 'Rack 2')
        ->assertJsonPath('data.owner_employee_id', null);
}

public function test_transfer_employee_mode_requires_owner_employee_id(): void
{
    $this->actingAs($this->super());
    $asset = Asset::factory()->create(['status' => 'ready']);
    $location = Location::create(['name' => 'HQ']);

    $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'employee', 'location_id' => $location->id])
        ->assertStatus(422)->assertJsonValidationErrors('owner_employee_id');
}

public function test_transfer_shared_mode_requires_owner_label(): void
{
    $this->actingAs($this->super());
    $asset = Asset::factory()->create(['status' => 'ready']);
    $location = Location::create(['name' => 'HQ']);

    $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'shared', 'location_id' => $location->id])
        ->assertStatus(422)->assertJsonValidationErrors('owner_label');
}
```

Update the existing `test_transfer_notifies_the_recipient_employee` (currently near line 320) to the new payload:

```php
public function test_transfer_notifies_the_recipient_employee(): void
{
    $employee = Employee::create(['code' => 'EMP-8001', 'first_name' => 'New', 'last_name' => 'Owner']);
    $recipient = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
    RolePermission::create(['role_id' => $recipient->role_id, 'permission' => 'assets.my', 'allowed' => true]);
    $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null, 'warehouse_id' => Warehouse::firstOrCreate(['name' => 'Central IT'])->id]);
    $location = Location::create(['name' => 'HQ']);

    $this->actingAs($this->super());
    $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id])->assertOk();

    $this->assertSame(1, $recipient->fresh()->notifications()->count());
    $this->assertSame('asset_assigned', $recipient->notifications()->first()->data['type']);
}
```

Update the existing `test_transfer_moves_asset_to_pending_acceptance`, `test_transfer_requires_a_location`, `test_cannot_transfer_a_deployed_asset`, and `test_transfer_is_recorded_in_the_transfer_log` to send the new payload. Replace them with:

```php
public function test_transfer_moves_asset_to_pending_acceptance(): void
{
    $employee = Employee::create(['code' => 'EMP-2000', 'first_name' => 'Trans', 'last_name' => 'Fer']);
    $this->actingAs($this->super());
    $asset = Asset::factory()->create(['status' => 'ready', 'owner' => 'Pool — IT', 'owner_employee_id' => null]);
    $location = Location::create(['name' => 'HQ Floor 3']);

    $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id, 'reason' => 'New hire'])
        ->assertOk()
        ->assertJsonPath('data.status', 'pending_acceptance')
        ->assertJsonPath('data.owner', 'EMP-2000')
        ->assertJsonPath('data.location', 'HQ Floor 3')
        ->assertJsonPath('data.location_id', $location->id);
}

public function test_transfer_requires_a_location(): void
{
    $employee = Employee::create(['code' => 'EMP-2000', 'first_name' => 'Trans', 'last_name' => 'Fer']);
    $this->actingAs($this->super());
    $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null, 'warehouse_id' => Warehouse::firstOrCreate(['name' => 'Central IT'])->id]);

    $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'employee', 'owner_employee_id' => $employee->id])
        ->assertStatus(422)->assertJsonValidationErrors('location_id');
}

public function test_cannot_transfer_a_deployed_asset(): void
{
    $employee = Employee::create(['code' => 'EMP-2000', 'first_name' => 'Trans', 'last_name' => 'Fer']);
    $this->actingAs($this->super());
    $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-1042']);
    $location = Location::create(['name' => 'HQ']);

    $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id])
        ->assertStatus(422);
}

public function test_transfer_is_recorded_in_the_transfer_log(): void
{
    $employee = Employee::create(['code' => 'EMP-2000', 'first_name' => 'Trans', 'last_name' => 'Fer']);
    $this->actingAs($this->super());
    $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null, 'warehouse_id' => Warehouse::firstOrCreate(['name' => 'Central IT'])->id]);
    $location = Location::create(['name' => 'HQ']);

    $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id, 'reason' => 'New hire'])->assertOk();

    $this->getJson('/api/assets/transfers')
        ->assertOk()
        ->assertJsonPath('data.0.to_owner', 'EMP-2000')
        ->assertJsonPath('data.0.from_owner', 'Central IT')
        ->assertJsonPath('data.0.reason', 'New hire');
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `php artisan test --compact --filter='test_transfer_'`
Expected: FAIL — controller still validates `owner` string; service signature mismatch.

- [ ] **Step 3: Rewrite the controller transfer action**

In `app/Http/Controllers/Api/Asset/AssetController.php`, replace the `transfer` method (lines 211-227):

```php
    /** Transfer an asset to a new owner — an employee (pending acceptance) or a shared label (deployed). */
    public function transfer(Request $request, Asset $asset): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.transfer'), 403);
        $data = $request->validate([
            'mode' => ['required', 'in:employee,shared'],
            // Employee mode: pick a real employee. Shared mode: a short free-text label.
            'owner_employee_id' => ['required_if:mode,employee', 'integer', 'exists:employees,id'],
            'owner_label' => ['required_if:mode,shared', 'string', 'max:200'],
            // IT must record where the asset will physically go when handed over.
            'location_id' => ['required', 'integer', 'exists:locations,id'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);
        abort_if($asset->isDeployed(), 422, 'Asset is deployed — mark it returned first.');

        $asset = $this->service->transfer($asset, $data, $request->user()?->name);
        AuditLog::record('Transferred asset', "{$asset->tag} → {$asset->owner}");

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }
```

- [ ] **Step 4: Rewrite the service transfer + notifyRecipient**

In `app/Services/Asset/AssetService.php`, replace `transfer` (lines 106-125) and `notifyRecipient` (lines 127-143):

```php
    /**
     * Hand an asset to a new owner. Employee mode assigns a real employee and enters
     * "pending acceptance" until they confirm; shared mode assigns a free-text label
     * (ของกลาง) and deploys immediately since there is no person to accept it.
     *
     * @param  array{mode: string, owner_employee_id?: int|null, owner_label?: string|null, location_id: int, reason?: string|null}  $data
     */
    public function transfer(Asset $asset, array $data, ?string $performedBy = null): Asset
    {
        // A pooled asset has no owner — it "leaves" its warehouse, so stamp that
        // warehouse as the custody-trail origin instead of a blank sender.
        $from = $asset->owner ?: $asset->warehouse?->name;
        $reason = $data['reason'] ?? null;

        if ($data['mode'] === 'employee') {
            $employee = Employee::findOrFail($data['owner_employee_id']);
            $asset->update([
                'owner' => $employee->code,
                'owner_employee_id' => $employee->id,
                'location_id' => $data['location_id'],
                'status' => AssetStatus::PendingAcceptance,
                'last_reason' => $reason,
            ]);
            $this->logTransfer($asset, $from, $employee->code, $reason, $performedBy);
            $this->notifyRecipient($asset->fresh('ownerEmployee'), $from);

            return $asset->fresh();
        }

        // Shared / common use: no person to accept, so it deploys straight away.
        $asset->update([
            'owner' => $data['owner_label'],
            'owner_employee_id' => null,
            'location_id' => $data['location_id'],
            'status' => AssetStatus::Deployed,
            'last_reason' => $reason,
        ]);
        $this->logTransfer($asset, $from, $data['owner_label'], $reason, $performedBy);

        return $asset->fresh();
    }

    /**
     * Bell alert to the recipient when an asset is handed over — resolved through the
     * owner_employee_id FK. Only fires if the employee has a login account that can use
     * My Assets (permission gates the bell).
     */
    private function notifyRecipient(Asset $asset, ?string $from): void
    {
        $employee = $asset->ownerEmployee;
        if (! $employee) {
            return;
        }

        $user = User::where('employee_id', $employee->id)->first();
        if ($user && $user->hasPermission('assets.my')) {
            $user->notify(new AssetAssignedNotification($asset, $from));
        }
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `php artisan test --compact --filter='test_transfer_'`
Expected: PASS (all transfer tests).

- [ ] **Step 6: Format + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/Asset/AssetService.php app/Http/Controllers/Api/Asset/AssetController.php tests/Feature/AssetApiTest.php
git commit -m "feat(asset): mode-aware transfer (employee/shared) keyed off owner_employee_id"
```

---

## Task 3: FK-based consumers (mine / accept / request-return / return-to-pool)

**Files:**
- Modify: `app/Http/Controllers/Api/Asset/AssetController.php:141-152` (`mine`), `:230-239` (`accept`), `:245-254` (`requestReturn`), `:63` `:149` `:186` (eager-load `ownerEmployee`)
- Modify: `app/Services/Asset/AssetService.php:179-195` (`markReceived` clears FK)
- Test: `tests/Feature/AssetApiTest.php`

**Interfaces:**
- Consumes: `Asset::ownerEmployee` / `owner_employee_id` (Task 1), `User::linkedEmployee()`.
- Produces: `mine` filters `where('owner_employee_id', $employee->id)`; `accept`/`requestReturn` authorize on `owner_employee_id === user's employee id`; `markReceived` sets `owner_employee_id = null`.

- [ ] **Step 1: Write / update the failing tests**

Update the existing `test_my_assets_returns_only_the_users_own_assets`, `test_only_the_recipient_employee_can_accept_a_handover`, `test_holder_can_request_return_of_their_asset`, `test_return_request_notifies_it_receivers`, and `test_mark_received_returns_asset_to_pool` to set the FK. Replace them with:

```php
public function test_my_assets_returns_only_the_users_own_assets(): void
{
    $employee = Employee::create(['code' => 'EMP-7001', 'first_name' => 'Me', 'last_name' => 'User']);
    $other = Employee::create(['code' => 'EMP-9999', 'first_name' => 'Not', 'last_name' => 'Me']);
    $user = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
    RolePermission::create(['role_id' => $user->role_id, 'permission' => 'assets.my', 'allowed' => true]);
    Asset::factory()->create(['owner' => 'EMP-7001', 'owner_employee_id' => $employee->id]);
    Asset::factory()->create(['owner' => 'EMP-7001', 'owner_employee_id' => $employee->id]);
    Asset::factory()->create(['owner' => 'EMP-9999', 'owner_employee_id' => $other->id]);

    $this->actingAs($user);
    $this->getJson('/api/assets/mine')->assertOk()->assertJsonCount(2, 'data');
}

public function test_only_the_recipient_employee_can_accept_a_handover(): void
{
    $employee = Employee::create(['code' => 'EMP-9001', 'first_name' => 'Rec', 'last_name' => 'Ipient']);
    $recipient = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
    $asset = Asset::factory()->create(['status' => 'pending_acceptance', 'owner' => 'EMP-9001', 'owner_employee_id' => $employee->id]);

    $this->actingAs($this->super());
    $this->postJson("/api/assets/{$asset->id}/accept")->assertForbidden();

    $this->actingAs($recipient);
    $this->postJson("/api/assets/{$asset->id}/accept")
        ->assertOk()
        ->assertJsonPath('data.status', 'deployed')
        ->assertJsonPath('data.owned_since', fn ($d) => is_string($d) && $d !== '');
}

public function test_holder_can_request_return_of_their_asset(): void
{
    $employee = Employee::create(['code' => 'EMP-6001', 'first_name' => 'Hold', 'last_name' => 'Er']);
    $holder = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
    $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-6001', 'owner_employee_id' => $employee->id]);

    $this->actingAs($this->super());
    $this->postJson("/api/assets/{$asset->id}/request-return")->assertForbidden();

    $this->actingAs($holder);
    $this->postJson("/api/assets/{$asset->id}/request-return")
        ->assertOk()
        ->assertJsonPath('data.status', 'pending_return')
        ->assertJsonPath('data.owner', 'EMP-6001');
}

public function test_return_request_notifies_it_receivers(): void
{
    $it = $this->super();
    $employee = Employee::create(['code' => 'EMP-6100', 'first_name' => 'H', 'last_name' => 'R']);
    $holder = User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);
    $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-6100', 'owner_employee_id' => $employee->id]);

    $this->actingAs($holder);
    $this->postJson("/api/assets/{$asset->id}/request-return")->assertOk();

    $this->assertSame(1, $it->fresh()->notifications()->count());
    $this->assertSame('asset_return_requested', $it->notifications()->first()->data['type']);
}

public function test_mark_received_returns_asset_to_pool(): void
{
    $employee = Employee::create(['code' => 'EMP-1500', 'first_name' => 'Ret', 'last_name' => 'Urn']);
    $this->actingAs($this->super());
    $asset = Asset::factory()->create(['status' => 'pending_return', 'owner' => 'EMP-1500', 'owner_employee_id' => $employee->id]);

    $this->postJson("/api/assets/{$asset->id}/receive", ['warehouse' => 'Central IT'])
        ->assertOk()
        ->assertJsonPath('data.status', 'ready')
        ->assertJsonPath('data.owner', null)
        ->assertJsonPath('data.owner_employee_id', null)
        ->assertJsonPath('data.owned_since', null);
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `php artisan test --compact --filter='test_my_assets_returns_only_the_users_own_assets|test_only_the_recipient_employee_can_accept_a_handover|test_holder_can_request_return_of_their_asset|test_return_request_notifies_it_receivers|test_mark_received_returns_asset_to_pool'`
Expected: FAIL — `mine`/`accept`/`requestReturn` still key off the `owner` string; `markReceived` doesn't clear the FK yet (the `owner_employee_id` assertion fails).

- [ ] **Step 3: Switch `mine` to the FK + eager-load `ownerEmployee`**

In `app/Http/Controllers/Api/Asset/AssetController.php`, replace the `mine` method body (lines 141-152):

```php
    public function mine(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.my'), 403);
        $employee = $request->user()?->linkedEmployee();
        if ($employee === null) {
            return response()->json(['data' => []]);
        }

        $assets = Asset::query()
            ->with(['contract', 'location', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee'])
            ->where('owner_employee_id', $employee->id)
            ->latest('id')
            ->get();

        return response()->json(['data' => AssetResource::collection($assets)]);
    }
```

Add `'ownerEmployee'` to the eager-loads in `index` (line 63) and `show` (line 186):

```php
// index (line 63):
$query = Asset::query()->with(['contract', 'location', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee'])->latest('id');

// show (line 186):
$asset->load(['contract', 'transfers', 'tickets.assignee', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee']);
```

- [ ] **Step 4: Switch `accept` + `requestReturn` authorization to the FK**

Replace the `accept` method (lines 230-239):

```php
    /** Recipient accepts a pending-acceptance asset (only the employee who holds it). */
    public function accept(Request $request, Asset $asset): JsonResponse
    {
        $employeeId = $request->user()?->linkedEmployee()?->id;
        abort_unless($employeeId !== null && $employeeId === $asset->owner_employee_id, 403);
        $asset = $this->service->accept($asset);
        AuditLog::record('Accepted asset', $asset->tag);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }
```

Replace the `requestReturn` method (lines 245-254):

```php
    /**
     * Holder requests to return an asset they currently hold: deployed → pending return.
     * Only the current holder (matched by owner_employee_id) may request it.
     */
    public function requestReturn(Request $request, Asset $asset): JsonResponse
    {
        $employeeId = $request->user()?->linkedEmployee()?->id;
        abort_unless($employeeId !== null && $employeeId === $asset->owner_employee_id && $asset->status === AssetStatus::Deployed, 403);
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);
        $asset = $this->service->requestReturn($asset, $data['reason'] ?? null);
        AuditLog::record('Requested asset return', $asset->tag);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }
```

- [ ] **Step 5: Clear the FK in `markReceived`**

In `app/Services/Asset/AssetService.php`, add `'owner_employee_id' => null,` to the `markReceived` update array (inside lines 185-191), right after `'owner' => null,`:

```php
        $asset->update([
            'status' => AssetStatus::Ready,
            'owner' => null,
            // Back in the pool → no employee holds it (clears the write-off block).
            'owner_employee_id' => null,
            // No holder in the pool → no possession date.
            'owned_since' => null,
            'warehouse_id' => Warehouse::resolveId($destName),
        ]);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `php artisan test --compact --filter='test_my_assets_returns_only_the_users_own_assets|test_only_the_recipient_employee_can_accept_a_handover|test_holder_can_request_return_of_their_asset|test_return_request_notifies_it_receivers|test_mark_received_returns_asset_to_pool'`
Expected: PASS.

- [ ] **Step 7: Format + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/Asset/AssetController.php app/Services/Asset/AssetService.php tests/Feature/AssetApiTest.php
git commit -m "feat(asset): my-assets/accept/return + return-to-pool key off owner_employee_id"
```

---

## Task 4: Write-off guard (an employee-held asset can't be written off)

**Files:**
- Modify: `app/Services/Asset/AssetService.php:197-220` (`retire` + `bulkSetStatus`)
- Test: `tests/Feature/AssetApiTest.php`

**Interfaces:**
- Consumes: `Asset::owner_employee_id` (Task 1).
- Produces: `bulkSetStatus(array $ids, AssetStatus $status, ?string $reason = null): int` aborts `422` (listing the offending tags) when writing off and any selected asset has `owner_employee_id !== null`; `retire()` guards the single asset the same way. Assets with a null FK (Ready / pool / shared / already returned) are allowed.

- [ ] **Step 1: Write the failing tests**

Add to `tests/Feature/AssetApiTest.php`:

```php
public function test_bulk_writeoff_blocked_while_an_asset_is_employee_held(): void
{
    $employee = Employee::create(['code' => 'EMP-5001', 'first_name' => 'Hol', 'last_name' => 'Der']);
    $this->actingAs($this->super());
    $held = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-5001', 'owner_employee_id' => $employee->id]);
    $free = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);

    $this->postJson('/api/assets/bulk', ['ids' => [$held->id, $free->id], 'op' => 'writeoff', 'reason' => 'EOL'])
        ->assertStatus(422);

    // No partial write-off — the whole batch is rejected.
    $this->assertSame('deployed', $held->fresh()->status->value);
    $this->assertSame('ready', $free->fresh()->status->value);
}

public function test_single_writeoff_blocked_while_employee_held(): void
{
    $employee = Employee::create(['code' => 'EMP-5002', 'first_name' => 'Hol', 'last_name' => 'Der']);
    $this->actingAs($this->super());
    $held = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-5002', 'owner_employee_id' => $employee->id]);

    $this->postJson('/api/assets/bulk', ['ids' => [$held->id], 'op' => 'writeoff'])
        ->assertStatus(422);

    $this->assertSame('deployed', $held->fresh()->status->value);
}

public function test_writeoff_allowed_for_shared_or_pooled_assets(): void
{
    $this->actingAs($this->super());
    $shared = Asset::factory()->create(['status' => 'deployed', 'owner' => 'Rack 2', 'owner_employee_id' => null]);
    $ready = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);

    $this->postJson('/api/assets/bulk', ['ids' => [$shared->id, $ready->id], 'op' => 'writeoff'])
        ->assertOk()
        ->assertJsonPath('updated', 2);

    $this->assertSame('writeoff', $shared->fresh()->status->value);
    $this->assertSame('writeoff', $ready->fresh()->status->value);
}
```

Also update the existing `test_bulk_writeoff_updates_many_assets` so its assets are explicitly not employee-held (the factory sets an `owner` string but leaves the FK null, so it already passes — make it explicit to document intent):

```php
public function test_bulk_writeoff_updates_many_assets(): void
{
    $this->actingAs($this->super());
    $a = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);
    $b = Asset::factory()->create(['status' => 'ready', 'owner_employee_id' => null]);

    $this->postJson('/api/assets/bulk', ['ids' => [$a->id, $b->id], 'op' => 'writeoff', 'reason' => 'EOL'])
        ->assertOk()
        ->assertJsonPath('updated', 2);

    $this->assertSame('writeoff', $a->fresh()->status->value);
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `php artisan test --compact --filter='test_bulk_writeoff_blocked_while_an_asset_is_employee_held|test_single_writeoff_blocked_while_employee_held|test_writeoff_allowed_for_shared_or_pooled_assets'`
Expected: FAIL — no guard yet; blocked cases currently write off (return 200 / change status).

- [ ] **Step 3: Add the guard to the service**

In `app/Services/Asset/AssetService.php`, replace `retire` (lines 197-206) and `bulkSetStatus` (lines 208-220). Add `use Illuminate\Support\Facades\Validator;` **is not needed** — use `abort()` for the 422, consistent with the controller's `abort_if`.

```php
    /** Retire / write off a single asset — blocked while an employee still holds it. */
    public function retire(Asset $asset, ?string $reason = null): Asset
    {
        abort_if($asset->heldByEmployee(), 422, "Return {$asset->tag} from the employee before writing it off.");

        $asset->update([
            'status' => AssetStatus::Writeoff,
            'last_reason' => $reason,
        ]);

        return $asset->fresh();
    }

    /**
     * Apply a single status to many assets at once (used by bulk Write-off).
     * When writing off, the whole batch is rejected if any selected asset is still
     * held by an employee — return it first. Returns the number of assets updated.
     *
     * @param  list<int>  $ids
     */
    public function bulkSetStatus(array $ids, AssetStatus $status, ?string $reason = null): int
    {
        if ($status === AssetStatus::Writeoff) {
            $held = Asset::whereIn('id', $ids)->whereNotNull('owner_employee_id')->pluck('tag');
            abort_if(
                $held->isNotEmpty(),
                422,
                'Return these from their employees before writing them off: '.$held->implode(', ').'.'
            );
        }

        return Asset::whereIn('id', $ids)->update([
            'status' => $status->value,
            'last_reason' => $reason,
        ]);
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `php artisan test --compact --filter='test_bulk_writeoff_blocked_while_an_asset_is_employee_held|test_single_writeoff_blocked_while_employee_held|test_writeoff_allowed_for_shared_or_pooled_assets|test_bulk_writeoff_updates_many_assets'`
Expected: PASS.

- [ ] **Step 5: Run the full asset suite to confirm no regressions**

Run: `php artisan test --compact --filter=AssetApiTest`
Expected: PASS (all AssetApiTest cases).

- [ ] **Step 6: Format + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/Asset/AssetService.php tests/Feature/AssetApiTest.php
git commit -m "feat(asset): block write-off of employee-held assets (single + bulk)"
```

---

## Task 5: Frontend — centered two-mode Transfer Dialog

**Files:**
- Create: `resources/js/modules/asset/components/asset-transfer-dialog.tsx`
- Delete: `resources/js/modules/asset/components/asset-transfer-drawer.tsx`
- Modify: `resources/js/modules/asset/pages/index.tsx:44` (import), `:877` (render)
- Modify: `resources/js/shared/types/index.ts:237` (Asset interface)
- Modify: `resources/js/modules/asset/api/assetApi.ts:60-61` (transfer)
- Modify: `resources/js/modules/asset/hooks/use-assets.ts:109-113` (transfer mutation)
- Modify: `resources/js/lang/en/asset.ts`, `resources/js/lang/th/asset.ts` (new keys)

**Interfaces:**
- Consumes: `Asset.owner_employee_id`, `Asset.owner_name` (Task 1 resource); `useEmployees()` and `useLocations()` from `@/modules/employee`; `Dialog`/`DialogContent`/`DialogTitle`/`DialogDescription` from `@/shared/ui/dialog`; `SearchableSelect` from `@/shared/components/searchable-select`.
- Produces: `AssetTransferDialog` component (default export named `AssetTransferDialog`); `assetApi.transfer(id, payload)` where `payload = { mode: 'employee'|'shared'; owner_employee_id?: number; owner_label?: string; location_id: number; reason?: string }`; `useAssetMutations().transfer` mutation accepting `{ id, payload }`.

- [ ] **Step 1: Extend the Asset type**

In `resources/js/shared/types/index.ts`, add two fields to the `Asset` interface right after `owner: string | null;` (line 237):

```ts
    owner: string | null;
    owner_employee_id: number | null;
    /** Display name of the holder: employee full name, shared label, or null (pool). */
    owner_name: string | null;
```

- [ ] **Step 2: Update the API + hook transfer payload**

In `resources/js/modules/asset/api/assetApi.ts`, add a payload type above `export const assetApi` and replace the `transfer` line (60-61):

```ts
export interface AssetTransferPayload {
    mode: 'employee' | 'shared';
    owner_employee_id?: number;
    owner_label?: string;
    location_id: number;
    reason?: string;
}
```

```ts
    transfer: (id: number, payload: AssetTransferPayload) => mutate<Asset>('post', `/assets/${id}/transfer`, payload),
```

In `resources/js/modules/asset/hooks/use-assets.ts`, add the import and replace the `transfer` mutation (lines 109-113):

```ts
import { assetApi, type AssetPayload, type AssetTransferPayload } from '../api/assetApi';
```

```ts
        transfer: useMutation({
            mutationFn: (v: { id: number; payload: AssetTransferPayload }) => assetApi.transfer(v.id, v.payload),
            onSuccess: invalidate,
        }),
```

Export the new type from the barrel — in `resources/js/modules/asset/index.ts` line 5, extend the api-type export:

```ts
export type { AssetPageMeta, AssetPageResponse, AssetPayload, AssetTransferPayload } from './api/assetApi';
```

- [ ] **Step 3: Add i18n keys (en + th)**

In `resources/js/lang/en/asset.ts`, add before the closing `};`:

```ts
    "asset_current_owner": "Current owner",
    "transfer_mode_employee": "Employee",
    "transfer_mode_shared": "Shared / common use",
    "transfer_pick_employee": "Select an employee",
    "transfer_shared_label": "Shared label",
    "transfer_shared_label_ph": "e.g. Rack 2, HR shared printer",
    "asset_transfer_failed": "Transfer failed",
```

In `resources/js/lang/th/asset.ts`, add the matching Thai keys before the closing `};`:

```ts
    "asset_current_owner": "ผู้ถือครองปัจจุบัน",
    "transfer_mode_employee": "พนักงาน",
    "transfer_mode_shared": "ของกลาง",
    "transfer_pick_employee": "เลือกพนักงาน",
    "transfer_shared_label": "ชื่อเรียกของกลาง",
    "transfer_shared_label_ph": "เช่น Rack 2, เครื่องพิมพ์ส่วนกลาง HR",
    "asset_transfer_failed": "โอนไม่สำเร็จ",
```

- [ ] **Step 4: Create the transfer dialog component**

Create `resources/js/modules/asset/components/asset-transfer-dialog.tsx`:

```tsx
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useAssetMutations } from '../hooks/use-assets';
import { useEmployees, useLocations } from '@/modules/employee';
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { Asset } from '@/shared/types';
import { Loader2, Share2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Mode = 'employee' | 'shared';

/** Hand an asset to a new owner — an employee (pending acceptance) or a shared label (deployed). */
export function AssetTransferDialog({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { transfer } = useAssetMutations();
    const { data: locations = [] } = useLocations();
    const { data: employees = [] } = useEmployees();

    const locationOptions = useMemo(
        () => locations.map((l) => ({ value: String(l.id), label: l.name, search: l.name })),
        [locations],
    );
    const employeeOptions = useMemo(
        () =>
            employees.map((e) => ({
                value: String(e.id),
                label: `${e.name} · ${e.code}${e.department ? ` · ${e.department}` : ''}`,
                search: `${e.name} ${e.code} ${e.department ?? ''}`,
            })),
        [employees],
    );

    const [mode, setMode] = useState<Mode>('employee');
    const [employeeId, setEmployeeId] = useState('');
    const [sharedLabel, setSharedLabel] = useState('');
    const [location, setLocation] = useState('');
    const [reason, setReason] = useState('');
    const [err, setErr] = useState<{ employee?: string; shared?: string; location?: string }>({});

    // Reset the form whenever a new asset opens the dialog.
    useEffect(() => {
        setMode('employee');
        setEmployeeId('');
        setSharedLabel('');
        setLocation('');
        setReason('');
        setErr({});
    }, [asset]);

    const submit = async () => {
        if (!asset) return;
        const required = lang === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
        const e: { employee?: string; shared?: string; location?: string } = {};
        if (mode === 'employee' && !employeeId) e.employee = required;
        if (mode === 'shared' && !sharedLabel.trim()) e.shared = required;
        if (!location) e.location = required;
        setErr(e);
        if (Object.keys(e).length) return;

        const payload =
            mode === 'employee'
                ? { mode, owner_employee_id: Number(employeeId), location_id: Number(location), reason: reason.trim() || undefined }
                : { mode, owner_label: sharedLabel.trim(), location_id: Number(location), reason: reason.trim() || undefined };

        try {
            await transfer.mutateAsync({ id: asset.id, payload });
            onClose();
        } catch {
            setErr({ location: t('asset_transfer_failed') });
        }
    };

    return (
        <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogTitle>{t('transfer_asset')}</DialogTitle>
                <DialogDescription>{asset ? `${asset.tag} — ${asset.model ?? ''}` : ''}</DialogDescription>

                <div className="mt-4 space-y-5">
                    <Field label={t('asset_current_owner')}>
                        <Input value={asset?.owner_name ?? asset?.owner ?? '—'} disabled className="opacity-70" />
                    </Field>

                    {/* Segmented toggle: Employee | Shared */}
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
                        {(['employee', 'shared'] as Mode[]).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setMode(m)}
                                className={cn(
                                    'flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                    mode === m ? 'bg-background text-brand shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {m === 'employee' ? <Users className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                                {m === 'employee' ? t('transfer_mode_employee') : t('transfer_mode_shared')}
                            </button>
                        ))}
                    </div>

                    {mode === 'employee' ? (
                        <Field label={t('transfer_mode_employee')} required error={err.employee}>
                            <SearchableSelect
                                value={employeeId}
                                onChange={setEmployeeId}
                                options={employeeOptions}
                                placeholder={t('transfer_pick_employee')}
                            />
                        </Field>
                    ) : (
                        <Field label={t('transfer_shared_label')} required error={err.shared}>
                            <Input value={sharedLabel} onChange={(ev) => setSharedLabel(ev.target.value)} placeholder={t('transfer_shared_label_ph')} autoFocus />
                        </Field>
                    )}

                    <Field label={t('asset_location')} required error={err.location}>
                        <SearchableSelect
                            value={location}
                            onChange={setLocation}
                            options={locationOptions}
                            placeholder={lang === 'th' ? 'เลือกที่ตั้งปลายทาง' : 'Select destination location'}
                        />
                    </Field>

                    <Field label={t('asset_transfer_reason')}>
                        <textarea
                            value={reason}
                            onChange={(ev) => setReason(ev.target.value)}
                            rows={3}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                            placeholder={lang === 'th' ? 'เช่น พนักงานใหม่' : 'e.g. New hire onboarding'}
                        />
                    </Field>
                </div>

                <div className="mt-6 flex flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" onClick={submit} disabled={transfer.isPending}>
                        {transfer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                        {t('transfer_asset')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 5: Switch the caller and delete the old drawer**

In `resources/js/modules/asset/pages/index.tsx`, change the import (line 44):

```tsx
import { AssetTransferDialog } from '../components/asset-transfer-dialog';
```

And the render (line 877):

```tsx
            <AssetTransferDialog asset={transferAsset} onClose={() => setTransferAsset(null)} />
```

Delete the old file:

```bash
git rm resources/js/modules/asset/components/asset-transfer-drawer.tsx
```

- [ ] **Step 6: Verify the frontend type-checks and builds**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors. If `Dialog` exports differ, open `resources/js/shared/ui/dialog.tsx` and match the exact exported names (this plan assumes `Dialog`, `DialogContent`, `DialogTitle`, `DialogDescription`, per `edit-employee-dialog.tsx`).

- [ ] **Step 7: Commit**

```bash
git add resources/js/modules/asset/components/asset-transfer-dialog.tsx resources/js/modules/asset/pages/index.tsx resources/js/modules/asset/api/assetApi.ts resources/js/modules/asset/hooks/use-assets.ts resources/js/modules/asset/index.ts resources/js/shared/types/index.ts resources/js/lang/en/asset.ts resources/js/lang/th/asset.ts
git commit -m "feat(asset-ui): two-mode centered Transfer dialog (employee/shared) on owner FK"
```

---

## Final verification

- [ ] **Run the full asset test suite**

Run: `php artisan test --compact --filter=AssetApiTest`
Expected: all pass.

- [ ] **Ask the user** whether to run the entire suite (`php artisan test --compact`) and to run the migration on the live DB (per Rollout).

---

## Self-Review

**1. Spec coverage**
- Transfer UI 2-mode centered Dialog → Task 5. ✅
- `assets.owner_employee_id` FK → Task 1 (migration + backfill). ✅
- Write-off guard (no employee holder) → Task 4. ✅
- Model `ownerEmployee` / fillable / `heldByEmployee` → Task 1. ✅
- Transfer validation (mode-exclusive) + service 2 modes + `from` label unchanged → Task 2. ✅
- Consumers switched to FK (`mine`, `accept`, `requestReturn`, `notifyRecipient`) + eager-load → Tasks 2 & 3. ✅
- `markReceived` clears FK (self-review note in spec) → Task 3, Step 5. ✅
- Resource `owner_employee_id` + `owner_name` + `owner` kept → Task 1. ✅
- Frontend types/api/hook → Task 5. ✅
- Tests (employee/shared/validation/accept/return/mine/write-off/backfill) → Tasks 1-4. ✅
- Search `orWhere('owner','like')` stays untouched (not modified in any task). ✅

**2. Placeholder scan:** none — every code step shows full code.

**3. Type consistency:** service `transfer(Asset, array, ?string)` matches the controller call in Task 2; `AssetTransferPayload` matches `assetApi.transfer` and the hook mutation `{ id, payload }` used by the dialog; `owner_name`/`owner_employee_id` resource keys match the `Asset` TS interface and the assertions in Task 1/3 tests; `bulkSetStatus` signature is unchanged (guard added internally), so the controller's existing call still compiles.

**Note on the single write-off path:** there is no single-asset write-off HTTP route (only `POST /assets/bulk`). Task 4 guards `retire()` defensively for safety, but the "single" test exercises the bulk endpoint with one id — the honest, routed path.
