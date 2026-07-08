# Master Data → FK Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link master data (locations, brands, models, categories, vendors, units, warranty types, warehouses) by foreign-key id instead of copied name strings, so editing a master record propagates everywhere and never leaves stale/mismatched data.

**Architecture:** Referencing tables get a `*_id` FK column. A single migration per column does it all: create any master rows missing for existing names → add the nullable FK → backfill the id by matching name → drop the old name string column. API resources keep returning the human name (resolved through the Eloquent relation, under the same JSON key) **plus** the new `*_id`, so display code is untouched and auto-reflects renames, while forms/filters switch to the id. Deleting a master that is still referenced is blocked at the application layer (409) as well as by the DB FK.

**Tech Stack:** Laravel 12 (PHP 8.2), Eloquent, PHPUnit; React 19 + TypeScript, TanStack Query, TanStack-style SearchableSelect; MariaDB (prod) / SQLite in-memory (tests).

## Global Constraints

- Migrations run on both MariaDB (prod/live) and SQLite (test suite via RefreshDatabase). Never use `UPDATE ... JOIN` (SQLite unsupported) — use a correlated subquery: `UPDATE t SET t.x = (SELECT ... WHERE m.name = t.name)`.
- Delete-when-in-use is guarded at the **application layer** (controller returns HTTP 409), not only by the DB FK — SQLite does not reliably enforce `restrictOnDelete` in tests. Keep `restrictOnDelete` on the FK too, as defense-in-depth for direct DB access.
- Backfill strategy: **create missing master rows** from distinct referenced names (no data loss). Match on the trimmed name.
- API JSON shape: a resource that had `"<col>": "<name>"` keeps that key (now resolved via relation) **and** adds `"<col>_id": <id>`. Forms submit `<col>_id`.
- Run `vendor/bin/pint --dirty --format agent` before every commit that touches PHP. Run `npx tsc --noEmit -p tsconfig.json` and `npm run build` before every commit that touches TS/TSX.
- Live data: back up the DB before running these migrations in production. `down()` re-adds the string column and best-effort backfills the name from the relation.
- Thai/English UI strings go through `useT()` (keys in `resources/js/lang/<locale>/…`). Never hardcode UI strings.

---

## Scope (all phases)

| Master table | Referencing column(s) → new FK |
|---|---|
| `locations` | `assets.location` → `assets.location_id` |
| `units` | `stock_items.unit` → `stock_items.unit_id` |
| `warranty_types` | `stock_items.warranty` → `stock_items.warranty_type_id` |
| `brands` | `assets.brand`, `stock_items.brand` → `*.brand_id` |
| `asset_models` | `assets.model`, `stock_items.model` → `*.model_id` |
| `categories` | `assets.type`, `stock_items.category` → `*.category_id` |
| `vendors` | `assets.supplier`, `contracts.vendor` → `*.vendor_id` |
| `warehouses` | `assets.warehouse`, `stock_items.warehouse`, `stock_item_serials.warehouse`, `stock_counts.warehouse`, `stock_balances.warehouse` (+ its `unique(stock_item_id, warehouse)`), `stock_item_serial_events.warehouse` → `*.warehouse_id` |

**This plan document fully specifies Phase 1 (Locations).** Phases 2–6 are listed in the Roadmap at the end and each gets its own plan document (same proven pattern) after the previous phase ships.

---

# PHASE 1 — Locations FK (`assets.location` → `assets.location_id`)

Locations is the smallest reference (assets only) and the newest code, making it the pilot that proves the migration + resource + form + delete-guard pattern.

**Current state (verified):**
- `locations` table: `(id, name)`. Managed at Settings → Master Data → Locations (`LocationsList`), CRUD hooks live in `@/modules/employee` (`useLocations`, `useLocationMutations`).
- `assets.location` is a nullable `string` (added in `…add_warehouse_to_assets_table` era; base column `string('location')->nullable()`).
- `App\Models\Asset\Asset`: `$fillable` includes `'location'`; no cast.
- `AssetResource`: `'location' => $this->location`.
- `StoreAssetRequest`: `'location' => ['nullable', 'string', 'max:200']`.
- Transfer sets location: `AssetController::transfer` validates `'location' => ['required','string','max:200']` → `AssetService::transfer($asset, $owner, $location, $reason, $performedBy)` sets `'location' => $location`.
- Frontend: the **register form has no location field** (removed earlier). Only the **transfer drawer** (`asset-transfer-drawer.tsx`) sets location — a `SearchableSelect` whose options are `useLocations()` names, storing the **name**. `assetApi.transfer(id, owner, location, reason)`; hook `transfer: {id, owner, location, reason?}`.
- Display: `asset-detail-drawer.tsx` shows `a.location`; My Assets / list do not show location.
- `LocationController::destroy` deletes unconditionally.

## File Structure (Phase 1)

- Create: `database/migrations/2026_07_06_XXXXXX_convert_assets_location_to_fk.php` — the location_id migration.
- Modify: `app/Models/Asset/Asset.php` — `$fillable` (swap `location`→`location_id`), add `location()` relation.
- Modify: `app/Http/Resources/Asset/AssetResource.php` — return `location` (via relation) + `location_id`.
- Modify: `app/Http/Requests/Asset/StoreAssetRequest.php` — `location_id` rule.
- Modify: `app/Http/Controllers/Api/Asset/AssetController.php` — `transfer()` validates `location_id`.
- Modify: `app/Services/Asset/AssetService.php` — `transfer()` signature `$locationId`.
- Modify: `app/Http/Controllers/Api/Settings/LocationController.php` — `destroy()` blocks when referenced (409).
- Modify: `resources/js/shared/types/index.ts` — `Asset.location_id`.
- Modify: `resources/js/modules/asset/api/assetApi.ts` — `transfer(id, owner, locationId, reason)`.
- Modify: `resources/js/modules/asset/hooks/use-assets.ts` — transfer mutation `location_id`.
- Modify: `resources/js/modules/asset/components/asset-transfer-drawer.tsx` — SearchableSelect value = location id.
- Test: `tests/Feature/AssetApiTest.php` — update transfer tests; add rename-propagation + delete-restrict tests.

---

### Task 1: Backend — `assets.location_id` FK end-to-end

**Files:**
- Create: `database/migrations/2026_07_06_XXXXXX_convert_assets_location_to_fk.php`
- Modify: `app/Models/Asset/Asset.php`
- Modify: `app/Http/Resources/Asset/AssetResource.php`
- Modify: `app/Http/Requests/Asset/StoreAssetRequest.php`
- Modify: `app/Http/Controllers/Api/Asset/AssetController.php:transfer`
- Modify: `app/Services/Asset/AssetService.php:transfer`
- Modify: `app/Http/Controllers/Api/Settings/LocationController.php:destroy`
- Test: `tests/Feature/AssetApiTest.php`

**Interfaces:**
- Produces: `AssetService::transfer(Asset $asset, string $newOwner, ?int $locationId = null, ?string $reason = null, ?string $performedBy = null): Asset`
- Produces: `Asset::location(): BelongsTo` → `App\Models\Settings\Location`
- Produces: API `data.location` (string name, via relation) + `data.location_id` (int|null)
- Produces: transfer endpoint body `{ owner: string, location_id: int, reason?: string }`
- Consumes: `App\Models\Settings\Location` (existing `{id, name}` model)

- [ ] **Step 1: Update existing transfer tests + write the new failing tests**

In `tests/Feature/AssetApiTest.php`, add `use App\Models\Settings\Location;` if missing.

Update the three transfer tests that currently pass `'location' => 'HQ'` (or `'HQ Floor 3'`) to create a `Location` and pass its id. Replace their transfer payloads:

```php
// test_transfer_moves_asset_to_pending_acceptance
$location = Location::create(['name' => 'HQ Floor 3']);
$this->postJson("/api/assets/{$asset->id}/transfer", ['owner' => 'EMP-2000', 'location_id' => $location->id, 'reason' => 'New hire'])
    ->assertOk()
    ->assertJsonPath('data.status', 'pending_acceptance')
    ->assertJsonPath('data.owner', 'EMP-2000')
    ->assertJsonPath('data.location', 'HQ Floor 3')
    ->assertJsonPath('data.location_id', $location->id);
```

Replace `test_transfer_requires_a_location` to require `location_id`:

```php
public function test_transfer_requires_a_location(): void
{
    $this->actingAs($this->super());
    $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'warehouse' => 'Central IT']);

    $this->postJson("/api/assets/{$asset->id}/transfer", ['owner' => 'EMP-2000'])
        ->assertStatus(422)->assertJsonValidationErrors('location_id');
}
```

In `test_transfer_notifies_the_recipient_employee`, `test_cannot_transfer_a_deployed_asset`, and `test_transfer_is_recorded_in_the_transfer_log`, add `$location = Location::create(['name' => 'HQ']);` and change `'location' => 'HQ'` → `'location_id' => $location->id`.

Add two new tests:

```php
public function test_renaming_a_location_propagates_to_assets(): void
{
    $this->actingAs($this->super());
    $location = Location::create(['name' => 'Old Wing']);
    $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-1', 'location_id' => $location->id]);

    $location->update(['name' => 'New Wing']);

    $this->getJson("/api/assets/{$asset->id}")
        ->assertOk()
        ->assertJsonPath('data.location', 'New Wing');
}

public function test_location_in_use_cannot_be_deleted(): void
{
    $this->actingAs($this->super());
    $location = Location::create(['name' => 'In Use']);
    Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-1', 'location_id' => $location->id]);

    $this->deleteJson("/api/locations/{$location->id}")->assertStatus(409);
    $this->assertDatabaseHas('locations', ['id' => $location->id]);
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `php artisan test --compact tests/Feature/AssetApiTest.php`
Expected: FAIL — `location_id` column/relation/validation not present; delete returns 200 not 409.

- [ ] **Step 3: Write the migration**

Create `database/migrations/2026_07_06_XXXXXX_convert_assets_location_to_fk.php`:

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
        // 1. Create any location master rows missing for names already on assets.
        DB::table('assets')
            ->whereNotNull('location')
            ->where('location', '!=', '')
            ->distinct()
            ->pluck('location')
            ->each(function (string $name) {
                DB::table('locations')->updateOrInsert(['name' => trim($name)], []);
            });

        // 2. Add the FK column (nullable; block deleting a referenced location at the DB layer too).
        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('location_id')->nullable()->after('location')->constrained('locations')->restrictOnDelete();
        });

        // 3. Backfill the id by matching the trimmed name (correlated subquery — SQLite-safe).
        DB::statement('UPDATE assets SET location_id = (SELECT id FROM locations WHERE locations.name = TRIM(assets.location)) WHERE location IS NOT NULL AND location != ""');

        // 4. Drop the old name column.
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn('location');
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->string('location')->nullable()->after('serial');
        });
        DB::statement('UPDATE assets SET location = (SELECT name FROM locations WHERE locations.id = assets.location_id) WHERE location_id IS NOT NULL');
        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('location_id');
        });
    }
};
```

- [ ] **Step 4: Update the Asset model**

In `app/Models/Asset/Asset.php`, swap `location` for `location_id` in `$fillable`:

```php
'owner', 'initial_owner', 'department', 'location_id', 'warehouse', 'value', 'supplier',
```

Add the relation (near the `contract()` relation), and import `use App\Models\Settings\Location;`:

```php
/** Physical location a deployed asset sits at (Master Data). */
public function location(): BelongsTo
{
    return $this->belongsTo(Location::class);
}
```

- [ ] **Step 5: Update AssetResource**

In `app/Http/Resources/Asset/AssetResource.php`, replace the `location` line:

```php
'location' => $this->location?->name,
'location_id' => $this->location_id,
```

- [ ] **Step 6: Update StoreAssetRequest**

In `app/Http/Requests/Asset/StoreAssetRequest.php`, replace the `location` rule:

```php
'location_id' => ['nullable', 'integer', 'exists:locations,id'],
```

- [ ] **Step 7: Update transfer controller + service**

In `app/Http/Controllers/Api/Asset/AssetController.php` `transfer()`, change the validation and the service call:

```php
$data = $request->validate([
    'owner' => ['required', 'string', 'max:200'],
    'location_id' => ['required', 'integer', 'exists:locations,id'],
    'reason' => ['nullable', 'string', 'max:500'],
]);
abort_if($asset->isDeployed(), 422, 'Asset is deployed — mark it returned first.');

$asset = $this->service->transfer($asset, $data['owner'], $data['location_id'], $data['reason'] ?? null, $request->user()?->name);
```

In `app/Services/Asset/AssetService.php`, change the `transfer()` signature and the update:

```php
public function transfer(Asset $asset, string $newOwner, ?int $locationId = null, ?string $reason = null, ?string $performedBy = null): Asset
{
    $from = $asset->owner ?: $asset->warehouse;
    $asset->update([
        'owner' => $newOwner,
        'location_id' => $locationId,
        'status' => AssetStatus::PendingAcceptance,
        'last_reason' => $reason,
    ]);
    $this->logTransfer($asset, $from, $newOwner, $reason, $performedBy);
    $this->notifyRecipient($asset, $newOwner, $from);

    return $asset->fresh();
}
```

- [ ] **Step 8: Block deleting a location that is in use**

In `app/Http/Controllers/Api/Settings/LocationController.php`, import `use App\Models\Asset\Asset;` and guard `destroy()`:

```php
public function destroy(Location $location): JsonResponse
{
    if (Asset::where('location_id', $location->id)->exists()) {
        return response()->json(['message' => 'in_use'], 409);
    }
    AuditLog::record('Deleted location', $location->name);
    $location->delete();

    return response()->json(['message' => 'success']);
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `php artisan test --compact tests/Feature/AssetApiTest.php`
Expected: PASS (all asset tests, including the new rename-propagation and delete-restrict).

- [ ] **Step 10: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/ database/migrations/ tests/Feature/AssetApiTest.php
git commit -m "feat(asset): link location by FK id (Master Data phase 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Frontend — transfer drawer submits `location_id`

**Files:**
- Modify: `resources/js/shared/types/index.ts`
- Modify: `resources/js/modules/asset/api/assetApi.ts`
- Modify: `resources/js/modules/asset/hooks/use-assets.ts`
- Modify: `resources/js/modules/asset/components/asset-transfer-drawer.tsx`

**Interfaces:**
- Consumes: transfer endpoint body `{ owner, location_id, reason? }` (from Task 1)
- Consumes: `useLocations()` from `@/modules/employee` → `LocationItem[]` (`{id, name}`)
- Produces: `assetApi.transfer(id: number, owner: string, locationId: number, reason?: string)`

- [ ] **Step 1: Add `location_id` to the Asset type**

In `resources/js/shared/types/index.ts`, in `interface Asset`, keep `location` (display name) and add below it:

```ts
    location: string | null;
    location_id: number | null;
```

- [ ] **Step 2: Update the API + hook**

In `resources/js/modules/asset/api/assetApi.ts`:

```ts
transfer: (id: number, owner: string, locationId: number, reason?: string) =>
    mutate<Asset>('post', `/assets/${id}/transfer`, { owner, location_id: locationId, reason }),
```

In `resources/js/modules/asset/hooks/use-assets.ts`, the transfer mutation:

```ts
transfer: useMutation({
    mutationFn: (v: { id: number; owner: string; locationId: number; reason?: string }) =>
        assetApi.transfer(v.id, v.owner, v.locationId, v.reason),
    onSuccess: invalidate,
}),
```

- [ ] **Step 3: Update the transfer drawer to store the location id**

In `resources/js/modules/asset/components/asset-transfer-drawer.tsx`:
- Options carry the id: `locations.map((l) => ({ value: String(l.id), label: l.name, search: l.name }))`
- The `location` state now holds the id string.
- On submit: `transfer.mutateAsync({ id: asset.id, owner: owner.trim(), locationId: Number(location), reason: reason.trim() || undefined })`
- Validation stays `if (!location) e.location = required;`

Full replacement of the two changed lines:

```tsx
const locationOptions = useMemo(() => locations.map((l) => ({ value: String(l.id), label: l.name, search: l.name })), [locations]);
```
```tsx
await transfer.mutateAsync({ id: asset.id, owner: owner.trim(), locationId: Number(location), reason: reason.trim() || undefined });
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit -p tsconfig.json` → Expected: exit 0
Run: `npm run build` → Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add resources/js/
git commit -m "feat(asset): transfer drawer selects location by id (Master Data phase 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Verify the full suite + manual check

- [ ] **Step 1: Run the whole backend suite**

Run: `php artisan test --compact`
Expected: all green (no other test referenced `assets.location` as a string; confirm).

- [ ] **Step 2: Manual verification (dev app running)**
- Transfer an asset → pick a location from the dropdown → View Details shows that location name.
- Settings → Master Data → Locations → rename that location → reopen the asset → the new name shows.
- Try deleting a location that is assigned to an asset → blocked (409 / friendly error). *(If the delete UI does not yet surface the 409, note it — a small toast/confirm-error hookup may be added here.)*

- [ ] **Step 3: (if any fix needed) commit**

---

## Phase 1 Self-Review

- **Spec coverage:** `assets.location` → `location_id` (Task 1 migration + model + resource + request + service + controller). Rename propagation (Task 1 test). Delete-restrict app-level (Task 1 Step 8 + test). Create-missing backfill (Task 1 Step 3). Frontend id submit (Task 2). ✓
- **Placeholder scan:** none — all code shown. The only conditional note is Task 3 Step 2 (409 UI surfacing) flagged as observe-and-maybe-fix, not a silent TODO.
- **Type consistency:** `location_id` (int) used in migration, model fillable, resource, request, service param `$locationId`, endpoint body `location_id`, TS `location_id`, api `locationId`. `Asset::location()` relation name matches `$this->location?->name`. ✓

---

# Roadmap — remaining phases (each gets its own plan doc when reached)

Same pattern as Phase 1 (create-missing → add FK → backfill → drop name; resource returns name+id; forms/filters use id; app-level delete-restrict; correlated-subquery backfill).

- **Phase 2 — Units + Warranty Types** (`stock_items.unit`→`unit_id`, `stock_items.warranty`→`warranty_type_id`). Consumers: `stock-item-modal.tsx` only. Confirm `units`/`warranty_types` master columns first.
- **Phase 3 — Brands + Asset Models** (`assets.brand`,`stock_items.brand`→`brand_id`; `assets.model`,`stock_items.model`→`model_id`). Model select is scoped to brand (`asset_models.brand_id`) — keep that cascade in the forms.
- **Phase 4 — Categories** (`assets.type`→`category_id`, `stock_items.category`→`category_id`). Also switch `AssetTypeIcon` to read the icon from the `category` relation instead of matching the type name; update asset list/detail/filter to use `category_id`.
- **Phase 5 — Vendors** (`assets.supplier`→`vendor_id`, `contracts.vendor`→`vendor_id`). Shared master across two modules.
- **Phase 6 — Warehouses** (largest): `assets.warehouse`, `stock_items.warehouse`, `stock_item_serials.warehouse`, `stock_counts.warehouse`, `stock_balances.warehouse` (+ change its `unique(stock_item_id, warehouse)` → `unique(stock_item_id, warehouse_id)`), `stock_item_serial_events.warehouse`. Audit stock movement create/transfer/return flows that read/write warehouse names.
