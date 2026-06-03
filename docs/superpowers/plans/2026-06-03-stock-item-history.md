# Stock Item SKU History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone, print-friendly SKU history page (opened in a new tab) showing a unified movement timeline plus a per-serial timeline, backed by a new `stock_item_serial_events` audit table.

**Architecture:** A new `stock_item_serial_events` table records every serial status change (received/issued/adjusted/transferred). Events are written at the existing receive/transfer/issue/adjust write points. A `GET /api/stock-items/{id}/history` endpoint aggregates movements + lots + serials(+events). A React route outside the app shell renders the history page; a History button in the detail modal opens it in a new tab.

**Tech Stack:** Laravel 12 (PHP 8.2), PHPUnit, React 19 + TypeScript, React Router, Tailwind v4, React Query.

**Spec:** `docs/superpowers/specs/2026-06-03-stock-item-history-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `database/migrations/<ts>_create_stock_item_serial_events_table.php` (new) | Table + backfill. |
| `app/Models/StockItemSerialEvent.php` (new) | Event model + `log()` helper. |
| `app/Models/StockItemSerial.php` | `events()` relation. |
| `app/Http/Controllers/Api/StockMovementController.php` | Log `received` / `transferred`. |
| `app/Services/StockSerialService.php` | `issue()` logs `issued`. |
| `app/Http/Controllers/Api/StockRequestController.php` | Pass user/ref into `issue()`. |
| `app/Services/StockCountService.php` | `reconcileSerials()` logs `adjusted`. |
| `app/Http/Controllers/Api/StockItemController.php` | `history()` endpoint. |
| `routes/api.php` | History route. |
| `tests/Feature/StockItemHistoryTest.php` (new) | All backend tests. |
| `resources/js/types/index.ts` | History + event types. |
| `resources/js/services/stockApi.ts` | `history(id)`. |
| `resources/js/hooks/use-stock.ts` | `useStockItemHistory`. |
| `resources/js/app.tsx` | Standalone route. |
| `resources/js/pages/stock/item-history.tsx` (new) | The page. |
| `resources/js/components/stock/stock-item-detail-modal.tsx` | History button. |
| `resources/js/lib/i18n.ts` | Page labels. |

---

## Task 1: `stock_item_serial_events` table + model + backfill

**Files:**
- Create: `database/migrations/<ts>_create_stock_item_serial_events_table.php`
- Create: `app/Models/StockItemSerialEvent.php`
- Modify: `app/Models/StockItemSerial.php`

- [ ] **Step 1: Generate the migration**

Run: `php artisan make:migration create_stock_item_serial_events_table --no-interaction`

- [ ] **Step 2: Fill the migration (table + backfill)**

Replace the generated file body with:

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
        Schema::create('stock_item_serial_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_item_serial_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stock_item_id')->constrained()->cascadeOnDelete();
            $table->string('event', 20); // received|issued|adjusted|transferred|returned
            $table->foreignId('stock_movement_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reference', 60)->nullable();
            $table->string('warehouse', 120)->nullable();
            $table->string('from_label', 120)->nullable();
            $table->string('to_label', 120)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('recorded_by', 120)->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();
            $table->index(['stock_item_id', 'occurred_at']);
        });

        // Backfill: every existing serial gets a 'received' event; non-in_stock serials
        // additionally get a best-effort exit event (movement link unknown for legacy rows).
        foreach (DB::table('stock_item_serials')->orderBy('id')->get() as $s) {
            DB::table('stock_item_serial_events')->insert([
                'stock_item_serial_id' => $s->id,
                'stock_item_id' => $s->stock_item_id,
                'event' => 'received',
                'stock_movement_id' => $s->stock_movement_id,
                'reference' => $s->reference,
                'warehouse' => $s->warehouse,
                'occurred_at' => $s->received_at ?? $s->created_at ?? now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if ($s->status !== 'in_stock') {
                DB::table('stock_item_serial_events')->insert([
                    'stock_item_serial_id' => $s->id,
                    'stock_item_id' => $s->stock_item_id,
                    'event' => $s->status, // 'issued' or 'adjusted'
                    'reference' => $s->reference,
                    'warehouse' => $s->warehouse,
                    'occurred_at' => $s->updated_at ?? now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_item_serial_events');
    }
};
```

- [ ] **Step 3: Run the migration**

Run: `php artisan migrate --no-interaction`
Expected: `create_stock_item_serial_events_table ... DONE`.

- [ ] **Step 4: Create the model with a `log()` helper**

Create `app/Models/StockItemSerialEvent.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockItemSerialEvent extends Model
{
    protected $fillable = [
        'stock_item_serial_id', 'stock_item_id', 'event', 'stock_movement_id',
        'reference', 'warehouse', 'from_label', 'to_label', 'user_id', 'recorded_by', 'occurred_at',
    ];

    protected function casts(): array
    {
        return ['occurred_at' => 'datetime'];
    }

    /**
     * Append a lifecycle event for a serial. Fills stock_item_id from the serial and
     * defaults occurred_at to now().
     *
     * @param  array<string, mixed>  $attrs
     */
    public static function log(StockItemSerial $serial, string $event, array $attrs = []): self
    {
        return static::create(array_merge([
            'stock_item_serial_id' => $serial->id,
            'stock_item_id' => $serial->stock_item_id,
            'event' => $event,
            'occurred_at' => now(),
        ], $attrs));
    }

    /** @return BelongsTo<StockItemSerial, $this> */
    public function serial(): BelongsTo
    {
        return $this->belongsTo(StockItemSerial::class, 'stock_item_serial_id');
    }
}
```

- [ ] **Step 5: Add the relation on `StockItemSerial`**

In `app/Models/StockItemSerial.php`, add `HasMany` to the imports:

```php
use Illuminate\Database\Eloquent\Relations\HasMany;
```

Add this relation method inside the class:

```php
    /** @return HasMany<StockItemSerialEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(StockItemSerialEvent::class)->orderBy('occurred_at');
    }
```

- [ ] **Step 6: Format + commit**

```
vendor/bin/pint --dirty --format agent
```
```
git add app/Models/StockItemSerialEvent.php app/Models/StockItemSerial.php database/migrations/*_create_stock_item_serial_events_table.php
git commit -m "feat(stock): add stock_item_serial_events table + model"
```

---

## Task 2: Log `received` + `transferred` events (TDD)

**Files:**
- Test: `tests/Feature/StockItemHistoryTest.php` (new)
- Modify: `app/Http/Controllers/Api/StockMovementController.php`

- [ ] **Step 1: Create the test file and a receive test**

Create `tests/Feature/StockItemHistoryTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\RolePermission;
use App\Models\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockItemHistoryTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function serialItem(string $sku): StockItem
    {
        return StockItem::create([
            'sku' => $sku, 'name' => $sku, 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
    }

    public function test_receiving_serials_logs_received_events(): void
    {
        $item = $this->serialItem('UPS-1');
        $this->actingAs($this->super())
            ->postJson('/api/stock-movements', [
                'type' => 'receive', 'stock_item_id' => $item->id,
                'serials' => ['SN-A', 'SN-B'], 'to_warehouse' => 'Main',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('stock_item_serial_events', [
            'stock_item_id' => $item->id, 'event' => 'received', 'warehouse' => 'Main',
        ]);
        $this->assertSame(2, \App\Models\StockItemSerialEvent::where('event', 'received')->count());
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `php artisan test --compact --filter=StockItemHistoryTest`
Expected: FAIL — no `received` events are written yet (count is 0).

- [ ] **Step 3: Log a `received` event when each serial is created**

In `app/Http/Controllers/Api/StockMovementController.php`, find the receive loop that creates serials and capture the created serial, then log the event. Replace:

```php
                // Register each received unit's serial against the SKU.
                foreach ($serials as $serial) {
                    StockItemSerial::create([
                        'stock_item_id' => $item->id,
                        'stock_movement_id' => $movement->id,
                        'serial' => $serial,
                        'status' => 'in_stock',
                        'warehouse' => $inboundWarehouse,
                        'reference' => $data['reference'] ?? null,
                        'received_at' => $movement->moved_at,
                    ]);
                }
```

with:

```php
                // Register each received unit's serial against the SKU + log a history event.
                foreach ($serials as $serial) {
                    $row = StockItemSerial::create([
                        'stock_item_id' => $item->id,
                        'stock_movement_id' => $movement->id,
                        'serial' => $serial,
                        'status' => 'in_stock',
                        'warehouse' => $inboundWarehouse,
                        'reference' => $data['reference'] ?? null,
                        'received_at' => $movement->moved_at,
                    ]);
                    StockItemSerialEvent::log($row, 'received', [
                        'stock_movement_id' => $movement->id,
                        'reference' => $data['reference'] ?? null,
                        'warehouse' => $inboundWarehouse,
                        'user_id' => $userId,
                        'recorded_by' => $recordedBy,
                        'occurred_at' => $movement->moved_at,
                    ]);
                }
```

Add the import at the top, next to `use App\Models\StockItemSerial;`:

```php
use App\Models\StockItemSerialEvent;
```

- [ ] **Step 4: Add a transfer test**

In `tests/Feature/StockItemHistoryTest.php`, add before the closing brace:

```php
    public function test_transferring_serials_logs_transferred_events(): void
    {
        $item = $this->serialItem('UPS-1');
        $super = $this->super();
        $this->actingAs($super)->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A'], 'to_warehouse' => 'Main',
        ])->assertCreated();

        $serialId = $item->serials()->value('id');

        $this->actingAs($super)->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id,
            'from_warehouse' => 'Main', 'to_warehouse' => 'HQ', 'serial_ids' => [$serialId],
        ])->assertCreated();

        $this->assertDatabaseHas('stock_item_serial_events', [
            'stock_item_serial_id' => $serialId, 'event' => 'transferred', 'from_label' => 'Main', 'to_label' => 'HQ',
        ]);
    }
```

- [ ] **Step 5: Run to verify the transfer test fails**

Run: `php artisan test --compact --filter=StockItemHistoryTest`
Expected: `test_transferring_serials_logs_transferred_events` FAILS (no transferred event).

- [ ] **Step 6: Log `transferred` events in the transfer branch**

In `app/Http/Controllers/Api/StockMovementController.php`, replace the transfer serial-move block:

```php
                if ($item->track_serial && $serialIds !== []) {
                    StockItemSerial::whereIn('id', $serialIds)
                        ->where('stock_item_id', $item->id)
                        ->update(['warehouse' => $toWh]);
                }
```

with:

```php
                if ($item->track_serial && $serialIds !== []) {
                    $moved = StockItemSerial::whereIn('id', $serialIds)->where('stock_item_id', $item->id)->get();
                    StockItemSerial::whereIn('id', $moved->pluck('id'))->update(['warehouse' => $toWh]);
                    foreach ($moved as $row) {
                        StockItemSerialEvent::log($row, 'transferred', [
                            'stock_movement_id' => $movement->id,
                            'from_label' => (string) $fromWh,
                            'to_label' => (string) $toWh,
                            'user_id' => $userId,
                            'recorded_by' => $recordedBy,
                            'occurred_at' => $movement->moved_at,
                        ]);
                    }
                }
```

- [ ] **Step 7: Run to verify both pass**

Run: `php artisan test --compact --filter=StockItemHistoryTest`
Expected: PASS (2 passed).

- [ ] **Step 8: Format + commit**

```
vendor/bin/pint --dirty --format agent
```
```
git add app/Http/Controllers/Api/StockMovementController.php tests/Feature/StockItemHistoryTest.php
git commit -m "feat(stock): log received + transferred serial events"
```

---

## Task 3: Log `issued` + `adjusted` events (TDD)

**Files:**
- Test: `tests/Feature/StockItemHistoryTest.php`
- Modify: `app/Services/StockSerialService.php`
- Modify: `app/Http/Controllers/Api/StockRequestController.php`
- Modify: `app/Services/StockCountService.php`

- [ ] **Step 1: Add issue + adjust event tests**

In `tests/Feature/StockItemHistoryTest.php`, add before the closing brace:

```php
    public function test_issuing_serials_logs_issued_events(): void
    {
        $item = $this->serialItem('UPS-1');
        $super = $this->super();
        $this->actingAs($super)->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A', 'SN-B'], 'to_warehouse' => 'Main',
        ])->assertCreated();

        $requester = User::factory()->create(['role' => 'user']);
        RolePermission::updateOrCreate(['role_id' => $requester->role_id, 'permission' => 'stock.request'], ['allowed' => true]);
        $reqId = $this->actingAs($requester)->postJson('/api/stock-requests', [
            'stock_item_id' => $item->id, 'qty' => 1, 'reason' => 'x',
        ])->assertCreated()->json('data.id');

        $this->actingAs($super)->postJson("/api/stock-requests/{$reqId}/approve")->assertOk();
        $serialId = $item->serials()->where('status', 'in_stock')->value('id');
        $this->actingAs($super)->postJson("/api/stock-requests/{$reqId}/fulfill", [
            'from_warehouse' => 'Main', 'serial_ids' => [$serialId],
        ])->assertOk();

        $this->assertDatabaseHas('stock_item_serial_events', ['stock_item_serial_id' => $serialId, 'event' => 'issued']);
    }

    public function test_adjusting_serials_in_count_logs_adjusted_events(): void
    {
        $item = $this->serialItem('UPS-1');
        $super = $this->super();
        $this->actingAs($super)->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A', 'SN-B'], 'to_warehouse' => 'Main',
        ])->assertCreated();

        $count = $this->actingAs($super)->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->actingAs($super)->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 1]])->assertOk();
        $missingId = $item->serials()->where('status', 'in_stock')->orderBy('id')->value('id');
        $this->actingAs($super)->postJson("/api/stock-counts/{$count['id']}/commit", [
            'mode' => 'auto', 'missing_serials' => [(string) $item->id => [$missingId]],
        ])->assertOk();

        $this->assertDatabaseHas('stock_item_serial_events', ['stock_item_serial_id' => $missingId, 'event' => 'adjusted']);
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `php artisan test --compact --filter=StockItemHistoryTest`
Expected: the two new tests FAIL (no issued/adjusted events).

- [ ] **Step 3: `issue()` logs `issued` events**

In `app/Services/StockSerialService.php`, add imports near the top:

```php
use App\Models\StockItemSerialEvent;
use App\Models\User;
```

Replace the `issue` method signature and the status-update line. Change the signature:

```php
    public function issue(StockItem $item, array $serialIds, int $qty): array
```

to:

```php
    public function issue(StockItem $item, array $serialIds, int $qty, ?User $user = null, ?string $reference = null): array
```

Then replace the final update + return:

```php
        StockItemSerial::whereIn('id', $serials->pluck('id'))->update(['status' => 'issued']);

        return $serials->pluck('serial')->all();
```

with:

```php
        StockItemSerial::whereIn('id', $serials->pluck('id'))->update(['status' => 'issued']);

        foreach ($serials as $row) {
            StockItemSerialEvent::log($row, 'issued', [
                'reference' => $reference,
                'warehouse' => $row->warehouse,
                'to_label' => $reference,
                'user_id' => $user?->id,
                'recorded_by' => $user?->name,
            ]);
        }

        return $serials->pluck('serial')->all();
```

- [ ] **Step 4: Pass the user + reference from fulfill**

In `app/Http/Controllers/Api/StockRequestController.php`, replace:

```php
            $this->serialService->issue($item, $data['serial_ids'] ?? [], $stockRequest->qty);
```

with:

```php
            $this->serialService->issue($item, $data['serial_ids'] ?? [], $stockRequest->qty, $user, $stockRequest->reference);
```

- [ ] **Step 5: `reconcileSerials()` logs `adjusted` events**

In `app/Services/StockCountService.php`, add the import near the others:

```php
use App\Models\StockItemSerialEvent;
```

Change the commit loop call to pass the user. Replace:

```php
                    if ($line->item->track_serial) {
                        $this->reconcileSerials($line->item, $variance, $missingSerials[$line->stock_item_id] ?? [], $count->reference);
                    }
```

with:

```php
                    if ($line->item->track_serial) {
                        $this->reconcileSerials($line->item, $variance, $missingSerials[$line->stock_item_id] ?? [], $count->reference, $user);
                    }
```

Replace the `reconcileSerials` signature:

```php
    private function reconcileSerials(StockItem $item, int $variance, array $serialIds, string $reference): void
```

with:

```php
    private function reconcileSerials(StockItem $item, int $variance, array $serialIds, string $reference, User $user): void
```

Replace the final update in `reconcileSerials`:

```php
        StockItemSerial::whereIn('id', $serials->pluck('id'))
            ->update(['status' => 'adjusted', 'reference' => $reference]);
```

with:

```php
        StockItemSerial::whereIn('id', $serials->pluck('id'))
            ->update(['status' => 'adjusted', 'reference' => $reference]);

        foreach ($serials as $row) {
            StockItemSerialEvent::log($row, 'adjusted', [
                'reference' => $reference,
                'warehouse' => $row->warehouse,
                'user_id' => $user->id,
                'recorded_by' => $user->name,
            ]);
        }
```

- [ ] **Step 6: Run to verify all pass**

Run: `php artisan test --compact --filter=StockItemHistoryTest`
Expected: PASS (4 passed).

- [ ] **Step 7: Regression — serial + workflow suites**

Run: `php artisan test --compact --filter="StockCountSerialTest|StockWorkflowTest"`
Expected: PASS (existing serial-issue / count-adjust behaviour intact).

- [ ] **Step 8: Format + commit**

```
vendor/bin/pint --dirty --format agent
```
```
git add app/Services/StockSerialService.php app/Http/Controllers/Api/StockRequestController.php app/Services/StockCountService.php tests/Feature/StockItemHistoryTest.php
git commit -m "feat(stock): log issued + adjusted serial events"
```

---

## Task 4: History endpoint (TDD)

**Files:**
- Test: `tests/Feature/StockItemHistoryTest.php`
- Modify: `app/Http/Controllers/Api/StockItemController.php`
- Modify: `routes/api.php`

- [ ] **Step 1: Add endpoint tests**

In `tests/Feature/StockItemHistoryTest.php`, add before the closing brace:

```php
    public function test_history_endpoint_returns_movements_lots_and_serials(): void
    {
        $item = $this->serialItem('UPS-1');
        $this->actingAs($this->super())->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A', 'SN-B'], 'to_warehouse' => 'Main',
        ])->assertCreated();

        $res = $this->actingAs($this->super())->getJson("/api/stock-items/{$item->id}/history")->assertOk();
        $res->assertJsonPath('data.item.sku', 'UPS-1');
        $res->assertJsonCount(1, 'data.movements');
        $res->assertJsonCount(2, 'data.serials');
        $res->assertJsonPath('data.serials.0.events.0.event', 'received');
    }

    public function test_history_requires_stock_view_permission(): void
    {
        $item = $this->serialItem('UPS-1');
        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->getJson("/api/stock-items/{$item->id}/history")->assertForbidden();
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `php artisan test --compact --filter=StockItemHistoryTest`
Expected: FAIL — route `/stock-items/{id}/history` not defined (404/405).

- [ ] **Step 3: Add the route**

In `routes/api.php`, find the stock-items routes and add the history route just before the `Route::apiResource`/`Route::get('stock-items'...)` group. Add this line within the `auth:sanctum` group, next to the other `stock-items` routes:

```php
Route::get('stock-items/{stockItem}/history', [StockItemController::class, 'history'])->name('api.stock-items.history');
```

(Place it **before** any `Route::apiResource('stock-items', ...)` so the `{stockItem}/history` path is matched; if stock-items uses explicit routes, order doesn't matter.)

- [ ] **Step 4: Implement `history()` on the controller**

In `app/Http/Controllers/Api/StockItemController.php`, add the method (and ensure `StockItem` is route-model-bound as `{stockItem}`). Add near the other actions:

```php
    /** Full audit history for one SKU: movement timeline + lots + per-serial event timelines. */
    public function history(Request $request, StockItem $stockItem): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view'), 403);

        $stockItem->load([
            'movements',
            'lots' => fn ($q) => $q->latest('received_at'),
            'lots.movement',
            'serials.events',
        ]);

        $lotSerials = $stockItem->serials->groupBy('stock_movement_id');

        return response()->json(['data' => [
            'item' => [
                'id' => $stockItem->id,
                'sku' => $stockItem->sku,
                'name' => $stockItem->name,
                'current_stock' => $stockItem->current_stock,
                'track_serial' => (bool) $stockItem->track_serial,
            ],
            'movements' => $stockItem->movements->map(fn ($m) => [
                'id' => $m->id,
                'doc_no' => $m->doc_no,
                'type' => $m->type,
                'qty' => $m->qty,
                'unit_cost' => $m->unit_cost,
                'from_label' => $m->from_label,
                'to_label' => $m->to_label,
                'reference' => $m->reference,
                'recorded_by' => $m->recorded_by,
                'notes' => $m->notes,
                'moved_at' => $m->moved_at?->toIso8601String(),
            ])->values(),
            'lots' => $stockItem->lots->map(fn ($l) => [
                'unit_cost' => $l->unit_cost,
                'qty_received' => $l->qty_received,
                'qty_remaining' => $l->qty_remaining,
                'received_at' => $l->received_at?->toIso8601String(),
                'doc_no' => $l->movement?->doc_no,
                'serials' => ($lotSerials[$l->stock_movement_id] ?? collect())->pluck('serial')->values(),
            ])->values(),
            'serials' => $stockItem->serials->map(fn ($s) => [
                'serial' => $s->serial,
                'status' => $s->status,
                'warehouse' => $s->warehouse,
                'events' => $s->events->map(fn ($e) => [
                    'event' => $e->event,
                    'occurred_at' => $e->occurred_at?->toIso8601String(),
                    'doc_no' => $e->movement?->doc_no,
                    'reference' => $e->reference,
                    'recorded_by' => $e->recorded_by,
                    'from_label' => $e->from_label,
                    'to_label' => $e->to_label,
                ])->values(),
            ])->values(),
        ]]);
    }
```

Add the event→movement relation used above. In `app/Models/StockItemSerialEvent.php`, add:

```php
    /** @return BelongsTo<StockMovement, $this> */
    public function movement(): BelongsTo
    {
        return $this->belongsTo(StockMovement::class, 'stock_movement_id');
    }
```

and eager-load it in the controller by changing `'serials.events'` to `'serials.events.movement'` in the `load([...])` call.

Ensure `Request` and `JsonResponse` are imported in the controller (they already are for other actions).

- [ ] **Step 5: Run to verify they pass**

Run: `php artisan test --compact --filter=StockItemHistoryTest`
Expected: PASS (6 passed).

- [ ] **Step 6: Format + commit**

```
vendor/bin/pint --dirty --format agent
```
```
git add app/Http/Controllers/Api/StockItemController.php app/Models/StockItemSerialEvent.php routes/api.php tests/Feature/StockItemHistoryTest.php
git commit -m "feat(stock): GET stock-items/{id}/history endpoint"
```

---

## Task 5: Frontend types, API, hook

**Files:**
- Modify: `resources/js/types/index.ts`, `resources/js/services/stockApi.ts`, `resources/js/hooks/use-stock.ts`

- [ ] **Step 1: Add types**

In `resources/js/types/index.ts`, add:

```ts
export interface SerialEvent {
    event: 'received' | 'issued' | 'adjusted' | 'transferred' | 'returned';
    occurred_at: string | null;
    doc_no: string | null;
    reference: string | null;
    recorded_by: string | null;
    from_label: string | null;
    to_label: string | null;
}

export interface StockItemHistory {
    item: { id: number; sku: string; name: string; current_stock: number; track_serial: boolean };
    movements: {
        id: number;
        doc_no: string | null;
        type: StockMovementType;
        qty: number;
        unit_cost: number | null;
        from_label: string | null;
        to_label: string | null;
        reference: string | null;
        recorded_by: string | null;
        notes: string | null;
        moved_at: string | null;
    }[];
    lots: { unit_cost: number; qty_received: number; qty_remaining: number; received_at: string | null; doc_no: string | null; serials: string[] }[];
    serials: { serial: string; status: StockSerialStatus; warehouse: string | null; events: SerialEvent[] }[];
}
```

(`StockMovementType` and `StockSerialStatus` already exist in this file.)

- [ ] **Step 2: Add the API call**

In `resources/js/services/stockApi.ts`, add `StockItemHistory` to the type import from `@/types`, then add to `stockItemApi`:

```ts
    history: (id: number) => http.get<ApiEnvelope<StockItemHistory>>(`/stock-items/${id}/history`).then((r) => r.data.data),
```

- [ ] **Step 3: Add the hook**

In `resources/js/hooks/use-stock.ts`, add (near the other stock-item hooks):

```ts
export const useStockItemHistory = (id: number | null) =>
    useQuery({ queryKey: ['stock-item-history', id], queryFn: () => stockItemApi.history(id as number), enabled: id !== null });
```

Ensure `stockItemApi` is imported in this file (it is used by other hooks here).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0.

- [ ] **Step 5: Commit**

```
git add resources/js/types/index.ts resources/js/services/stockApi.ts resources/js/hooks/use-stock.ts
git commit -m "feat(stock-ui): types/api/hook for SKU history"
```

---

## Task 6: i18n keys

**Files:**
- Modify: `resources/js/lib/i18n.ts`

- [ ] **Step 1: Add English keys**

In `resources/js/lib/i18n.ts`, after the English `stock_serial_list` key (search for `stock_serial_list:`), add:

```ts
    stock_history: 'History',
    stock_history_title: 'SKU history',
    stock_history_movements: 'Movement timeline',
    stock_history_serials: 'Serial history',
    stock_history_print: 'Print',
    stock_history_no_events: 'No events',
    stock_ev_received: 'Received',
    stock_ev_issued: 'Issued',
    stock_ev_adjusted: 'Adjusted',
    stock_ev_transferred: 'Transferred',
    stock_ev_returned: 'Returned',
```

- [ ] **Step 2: Add Thai keys**

After the Thai `stock_serial_list:` key, add:

```ts
    stock_history: 'ประวัติ',
    stock_history_title: 'ประวัติ SKU',
    stock_history_movements: 'ไทม์ไลน์การเคลื่อนไหว',
    stock_history_serials: 'ประวัติ serial',
    stock_history_print: 'พิมพ์',
    stock_history_no_events: 'ไม่มีประวัติ',
    stock_ev_received: 'รับเข้า',
    stock_ev_issued: 'จ่ายออก',
    stock_ev_adjusted: 'ปรับ',
    stock_ev_transferred: 'โอนย้าย',
    stock_ev_returned: 'คืน',
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.json` (expected EXIT 0)
```
git add resources/js/lib/i18n.ts
git commit -m "feat(stock-ui): i18n for SKU history"
```

---

## Task 7: Standalone history page + route + History button

**Files:**
- Create: `resources/js/pages/stock/item-history.tsx`
- Modify: `resources/js/app.tsx`
- Modify: `resources/js/components/stock/stock-item-detail-modal.tsx`

- [ ] **Step 1: Create the page**

Create `resources/js/pages/stock/item-history.tsx`:

```tsx
import { StatusBadge } from '@/components/shared/status-badge';
import { useStockItemHistory } from '@/hooks/use-stock';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { SerialEvent } from '@/types';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Printer, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useParams } from 'react-router-dom';

/** Icon + accent colour per movement/event type. */
const EVENT_META: Record<SerialEvent['event'], { icon: typeof ArrowDownToLine; tone: string }> = {
    received: { icon: ArrowDownToLine, tone: 'text-emerald-600' },
    issued: { icon: ArrowUpFromLine, tone: 'text-destructive' },
    adjusted: { icon: SlidersHorizontal, tone: 'text-amber-600' },
    transferred: { icon: ArrowLeftRight, tone: 'text-blue-600' },
    returned: { icon: RotateCcw, tone: 'text-slate-500' },
};

/** Standalone, print-friendly full history for one SKU (opened in its own tab). */
export default function ItemHistoryPage() {
    const t = useT();
    const { id } = useParams();
    const { data, isLoading } = useStockItemHistory(id ? Number(id) : null);

    if (isLoading || !data) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="border-muted-foreground/30 border-t-primary h-7 w-7 animate-spin rounded-full border-2" />
            </div>
        );
    }

    const evLabel = (e: SerialEvent['event']) =>
        t(`stock_ev_${e}` as Parameters<typeof t>[0]);

    return (
        <div className="bg-background mx-auto min-h-screen max-w-4xl px-6 py-8">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-lg font-semibold">{t('stock_history_title')}</h1>
                    <div className="text-muted-foreground mt-1 font-mono text-sm">
                        {data.item.sku} · {data.item.name}
                    </div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                        {t('stock_current')}: <span className="font-mono">{data.item.current_stock}</span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="border-border hover:bg-muted/50 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium print:hidden"
                >
                    <Printer className="h-4 w-4" />
                    {t('stock_history_print')}
                </button>
            </div>

            {/* Movement timeline */}
            <section className="mb-8">
                <h2 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wide uppercase">{t('stock_history_movements')}</h2>
                <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
                    {data.movements.map((m) => {
                        const meta = EVENT_META[(m.type in EVENT_META ? m.type : 'transferred') as SerialEvent['event']] ?? EVENT_META.transferred;
                        const Icon = meta.icon;
                        return (
                            <div key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                <Icon className={cn('h-4 w-4 shrink-0', meta.tone)} />
                                <span className="w-28 shrink-0 font-mono text-xs">{m.doc_no ?? m.reference ?? '—'}</span>
                                <span className="text-muted-foreground w-36 shrink-0 text-xs">{m.moved_at?.slice(0, 16).replace('T', ' ')}</span>
                                <span className="w-20 shrink-0 text-right font-mono">{m.type === 'receive' ? `+${m.qty}` : m.type}</span>
                                <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                                    {[m.from_label, m.to_label].filter(Boolean).join(' → ')} · {m.recorded_by ?? '—'}
                                </span>
                            </div>
                        );
                    })}
                    {data.movements.length === 0 && <div className="text-muted-foreground px-3 py-6 text-center text-xs">{t('stock_history_no_events')}</div>}
                </div>
            </section>

            {/* Serial history */}
            {data.item.track_serial && (
                <section>
                    <h2 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wide uppercase">
                        {t('stock_history_serials')} · {data.serials.length}
                    </h2>
                    <div className="space-y-2">
                        {data.serials.map((s) => (
                            <div key={s.serial} className="border-border rounded-lg border p-3">
                                <div className="mb-2 flex items-center gap-2">
                                    <span className="font-mono text-xs font-semibold">{s.serial}</span>
                                    <StatusBadge tone={s.status === 'in_stock' ? 'green' : s.status === 'issued' ? 'blue' : 'gray'}>
                                        {t(`stock_sn_${s.status}` as Parameters<typeof t>[0])}
                                    </StatusBadge>
                                </div>
                                <ol className="space-y-1">
                                    {s.events.map((e, i) => {
                                        const meta = EVENT_META[e.event];
                                        const Icon = meta.icon;
                                        return (
                                            <li key={i} className="text-muted-foreground flex items-center gap-2 text-xs">
                                                <Icon className={cn('h-3.5 w-3.5 shrink-0', meta.tone)} />
                                                <span className="w-20 shrink-0 font-medium">{evLabel(e.event)}</span>
                                                <span className="w-32 shrink-0">{e.occurred_at?.slice(0, 16).replace('T', ' ')}</span>
                                                <span className="min-w-0 flex-1 truncate font-mono">
                                                    {e.doc_no ?? e.reference ?? ''} {e.recorded_by ? `· ${e.recorded_by}` : ''}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ol>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Register the standalone route**

In `resources/js/app.tsx`, import the page at the top with the other page imports:

```tsx
import ItemHistoryPage from '@/pages/stock/item-history';
```

Add the route **inside `<Route element={<ProtectedRoute />}>` but outside `<Route element={<AppShell />}>`** — place it right after the closing `</Route>` of the AppShell block (before the `<Route path="*" ...>`):

```tsx
                    <Route
                        path="stock/items/:id/history"
                        element={
                            <RequirePermission anyOf={['stock.view']}>
                                <ItemHistoryPage />
                            </RequirePermission>
                        }
                    />
```

- [ ] **Step 3: Add the History button to the detail modal**

In `resources/js/components/stock/stock-item-detail-modal.tsx`, add `History` to the `lucide-react` import. Then in the header's right-hand `<div className="flex shrink-0 items-center gap-2">` (the one holding the status + serialized badges), add as the first child:

```tsx
                                <button
                                    type="button"
                                    onClick={() => window.open(`/stock/items/${item.id}/history`, '_blank')}
                                    title={t('stock_history')}
                                    className="border-border hover:bg-muted/50 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium"
                                >
                                    <History className="h-3 w-3" />
                                    {t('stock_history')}
                                </button>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0.

- [ ] **Step 5: Commit**

```
git add resources/js/pages/stock/item-history.tsx resources/js/app.tsx resources/js/components/stock/stock-item-detail-modal.tsx
git commit -m "feat(stock-ui): standalone SKU history page + History button"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0.

- [ ] **Step 2: Lint changed files**

Run: `npx eslint resources/js/pages/stock/item-history.tsx resources/js/app.tsx resources/js/components/stock/stock-item-detail-modal.tsx resources/js/services/stockApi.ts resources/js/hooks/use-stock.ts resources/js/types/index.ts resources/js/lib/i18n.ts`
Expected: 0 errors.

- [ ] **Step 3: Backend suite**

Run: `php artisan test --compact`
Expected: all PASS (existing 264 + new StockItemHistoryTest 6).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual smoke (ask the user)**

Open a serialized SKU's detail → click **History** → a new tab opens at `/stock/items/{id}/history` showing the movement timeline and, per serial, its received → issued/adjusted/transferred events with who/when. Receive, then issue/adjust, and confirm new events appear.

---

## Self-Review Notes

- **Spec coverage:** events table + model + relation (Task 1); receive/transfer events (Task 2); issue/adjust events (Task 3); backfill (Task 1 migration); history endpoint with item/movements/lots/serials+events (Task 4); types/api/hook (Task 5); i18n (Task 6); standalone page + route + History button (Task 7); tests for receive/issue/adjust/endpoint/permission (Tasks 2–4). All spec sections mapped.
- **Out of scope** honoured: no edit/export; returns log nothing extra (no serial handling in return flow); print via browser.
- **Type/signature consistency:** `StockItemSerialEvent::log($serial, $event, $attrs)` used identically at all four write sites; `issue(item, ids, qty, ?User, ?ref)` matches the fulfill caller; `reconcileSerials(item, variance, ids, reference, User)` matches the commit caller; endpoint payload keys (`item/movements/lots/serials[].events[]`) match the TS `StockItemHistory`/`SerialEvent` types and the page's field reads; `useStockItemHistory(id)` ↔ `stockItemApi.history(id)`.
```
