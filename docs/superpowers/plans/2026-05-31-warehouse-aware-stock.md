# Warehouse-aware Stock (per-warehouse balances) + Transfer redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. During implementation, apply **debug-mantra** when fixing the transfer bug (Task 6) and **frontend-design** when (re)building the Transfer dialog (Task 10).

**Goal:** Track stock on-hand **per warehouse** (new `stock_balances` table), make Transfer move stock between warehouses correctly (stock- and cost-neutral, serial-aware), auto-number every movement (`RCV/ISS/RET/TRF-yyyy-xxx`), and surface real per-warehouse figures.

**Architecture:** Add `stock_balances` (SKU×warehouse×qty); keep `stock_items.current_stock` as a cached total (= SUM of balances) maintained transactionally. A focused `StockBalanceService` owns balance mutations (add/remove/move with a per-warehouse non-negative guard). `StockMovementController::record()` and `StockRequestController::fulfill()` call it. Transfer becomes stock-neutral and skips FIFO lots. A `DocNumber` helper assigns running document numbers. Frontend Transfer dialog is rebuilt to pick from/to warehouse + (serialized) pick serials / (qty) capped quantity.

**Tech Stack:** Laravel 12 (PHPUnit), React 19 + TS, React Query, Tailwind. MySQL — **live data, additive migrations only**.

**Spec:** `docs/superpowers/specs/2026-05-31-warehouse-aware-stock-design.md`

---

## Key facts (from codebase exploration)

- `stock_items`: single `warehouse` + `current_stock`. `StockItem::avgCost()`, `stockValue()` exist.
- `StockMovement::INBOUND = ['receive','return','adjust_up']`; `delta()` = `+qty`/`-qty`.
- `StockMovementController` (`record()`): movement endpoint accepts only `receive/return/transfer` (issue is via fulfill). Serials only handled on `receive`.
- `StockRequestController::fulfill()`: creates an `issue` movement with `from_label = $item->warehouse`, decrements `current_stock`, `lotService->consume()`, `serialService->issue()`.
- `StockLotService`: `addLot()`, `consume()`, `reconcile()`.
- `StockItemController::summary()` builds `by_warehouse` by `$items->groupBy('warehouse')` (lines ~79-84).
- `StockItemResource` exposes `current_stock`, `warehouse`, and (on show) `serials[]` (each with `warehouse`,`status`) and `lots[]`.
- 🔴 **Transfer bug:** transfer is outbound → reduces `current_stock` + consumes lots. **`StockFifoCostingTest::test_outbound_consumes_oldest_lot_first_fifo` uses `type=transfer` to test FIFO consumption** — it MUST be retargeted to an outbound path (issue via fulfill) when transfer becomes neutral.
- Frontend: `MovementDrawer` (receive/return/transfer), `RequestsTab` fulfill (serial picker), `stockApi`, `use-stock`, types (`StockItem`, `StockItemSerial` already has `warehouse`, `StockMovementType`).

---

## Conventions (read before starting)

- PHPUnit classes (`extends Tests\TestCase`, `use RefreshDatabase`, `test_*`). Run one file: `php artisan test --compact tests/Feature/X.php`.
- Stock items in tests are made with `StockItem::create([...])` (not a factory). Movements via `postJson('/api/stock-movements', [...])` acting as a super user. Serialized fulfill via `postJson("/api/stock-requests/{id}/fulfill", ['serial_ids'=>[...]])`.
- After editing PHP run `vendor/bin/pint --dirty --format agent`.
- Frontend: no JS unit runner — verify `npx tsc --noEmit` + `npx eslint <files>`. Build with `npm run build` to see UI.
- Live DB: additive migrations only; never `migrate:fresh` against real data.

---

## File Structure

**Backend — create:**
- `database/migrations/<ts>_create_stock_balances_table.php`
- `database/migrations/<ts>_backfill_stock_balances.php`
- `database/migrations/<ts>_add_doc_no_to_stock_movements.php`
- `app/Models/StockBalance.php`
- `app/Services/StockBalanceService.php` — add/remove/move + per-warehouse guard + `rebuildFor()`.
- `app/Support/DocNumber.php` — running document numbers.

**Backend — modify:**
- `app/Models/StockItem.php` — `balances()` relation.
- `app/Models/StockMovement.php` — `doc_no` fillable; `delta()` transfer = 0.
- `app/Http/Controllers/Api/StockMovementController.php` — balances + doc_no + transfer-neutral + transfer serials.
- `app/Http/Controllers/Api/StockRequestController.php` — fulfill deducts from a source warehouse + doc_no.
- `app/Http/Controllers/Api/StockItemController.php` — `summary().by_warehouse` from balances.
- `app/Http/Resources/StockItemResource.php` — expose `balances`.

**Backend — tests:**
- `tests/Feature/StockBalanceTest.php` (create), `tests/Feature/StockTransferTest.php` (create), `tests/Feature/DocNumberTest.php` (create).
- Modify: `tests/Feature/StockFifoCostingTest.php`, `tests/Feature/StockWorkflowTest.php`, `tests/Feature/StockSerialReceiveTest.php` (issue from-warehouse).

**Frontend — modify:**
- `resources/js/types/index.ts`, `resources/js/services/stockApi.ts`, `resources/js/hooks/use-stock.ts`,
  `resources/js/components/stock/movement-drawer.tsx`, `resources/js/pages/stock/index.tsx`.

---

## Task 1: `stock_balances` table + model + relation

**Files:** create migration + `app/Models/StockBalance.php`; modify `app/Models/StockItem.php`; test `tests/Feature/StockBalanceTest.php`.

- [ ] **Step 1: Failing test**

Create `tests/Feature/StockBalanceTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Models\StockBalance;
use App\Models\StockItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockBalanceTest extends TestCase
{
    use RefreshDatabase;

    private function item(int $stock = 0): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-BAL-'.fake()->unique()->numerify('###'),
            'name' => 'Balance item', 'unit' => 'unit', 'cost' => 0,
            'current_stock' => $stock, 'min_stock' => 0, 'max_stock' => 0, 'warehouse' => 'WH-A',
        ]);
    }

    public function test_item_has_many_balances(): void
    {
        $item = $this->item();
        StockBalance::create(['stock_item_id' => $item->id, 'warehouse' => 'WH-A', 'qty' => 5]);
        StockBalance::create(['stock_item_id' => $item->id, 'warehouse' => 'WH-B', 'qty' => 3]);

        $this->assertSame(8, (int) $item->balances()->sum('qty'));
        $this->assertCount(2, $item->balances);
    }
}
```

- [ ] **Step 2: Run — FAIL** (`StockBalance` missing): `php artisan test --compact tests/Feature/StockBalanceTest.php`

- [ ] **Step 3: Migration**
```bash
php artisan make:migration create_stock_balances_table --no-interaction
```
Body:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_balances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_item_id')->constrained()->cascadeOnDelete();
            $table->string('warehouse', 120);
            $table->integer('qty')->default(0);
            $table->timestamps();
            $table->unique(['stock_item_id', 'warehouse']);
            $table->index('stock_item_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_balances');
    }
};
```

- [ ] **Step 4: Model** — create `app/Models/StockBalance.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockBalance extends Model
{
    protected $fillable = ['stock_item_id', 'warehouse', 'qty'];

    protected function casts(): array
    {
        return ['qty' => 'integer'];
    }

    /** @return BelongsTo<StockItem, $this> */
    public function item(): BelongsTo
    {
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }
}
```

- [ ] **Step 5: Relation** — in `app/Models/StockItem.php` add (near other relations; import `HasMany`):
```php
    /** @return \Illuminate\Database\Eloquent\Relations\HasMany<StockBalance, $this> */
    public function balances(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(StockBalance::class);
    }
```

- [ ] **Step 6: Migrate + run — PASS**
```bash
php artisan migrate
php artisan test --compact tests/Feature/StockBalanceTest.php
```

- [ ] **Step 7: Pint + commit**
```bash
vendor/bin/pint --dirty --format agent
git add database/migrations/*_create_stock_balances_table.php app/Models/StockBalance.php app/Models/StockItem.php tests/Feature/StockBalanceTest.php
git commit -m "feat(stock): add stock_balances table (per-warehouse on-hand)"
```

---

## Task 2: `StockBalanceService` (add / remove / move + guard + rebuild)

**Files:** create `app/Services/StockBalanceService.php`; test in `tests/Feature/StockBalanceTest.php`.

- [ ] **Step 1: Add failing tests** to `StockBalanceTest`:
```php
    public function test_add_creates_and_increments_balance(): void
    {
        $svc = app(\App\Services\StockBalanceService::class);
        $item = $this->item();

        $svc->add($item, 'WH-A', 5);
        $svc->add($item, 'WH-A', 3);

        $this->assertSame(8, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-A'])->value('qty'));
    }

    public function test_remove_decrements_and_rejects_negative(): void
    {
        $svc = app(\App\Services\StockBalanceService::class);
        $item = $this->item();
        $svc->add($item, 'WH-A', 5);

        $svc->remove($item, 'WH-A', 2);
        $this->assertSame(3, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-A'])->value('qty'));

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $svc->remove($item, 'WH-A', 99);
    }

    public function test_move_transfers_between_warehouses(): void
    {
        $svc = app(\App\Services\StockBalanceService::class);
        $item = $this->item();
        $svc->add($item, 'WH-A', 10);

        $svc->move($item, 'WH-A', 'WH-B', 4);

        $this->assertSame(6, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-A'])->value('qty'));
        $this->assertSame(4, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-B'])->value('qty'));
    }

    public function test_move_rejects_same_warehouse(): void
    {
        $svc = app(\App\Services\StockBalanceService::class);
        $item = $this->item();
        $svc->add($item, 'WH-A', 10);

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $svc->move($item, 'WH-A', 'WH-A', 1);
    }

    public function test_rebuild_for_seeds_single_balance_from_current_stock(): void
    {
        $svc = app(\App\Services\StockBalanceService::class);
        $item = $this->item(12);

        $svc->rebuildFor($item);

        $this->assertSame(12, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-A'])->value('qty'));
    }
```

- [ ] **Step 2: Run — FAIL** (service missing).

- [ ] **Step 3: Create the service** `app/Services/StockBalanceService.php`:
```php
<?php

namespace App\Services;

use App\Models\StockBalance;
use App\Models\StockItem;
use Illuminate\Validation\ValidationException;

/**
 * Owns per-warehouse on-hand quantities (stock_balances). Callers run these inside
 * the movement transaction; current_stock (the cached total) is maintained by the
 * caller. Removals are guarded so a warehouse balance can never go negative.
 */
class StockBalanceService
{
    /** Increment (or create) the balance for a warehouse. */
    public function add(StockItem $item, string $warehouse, int $qty): void
    {
        if ($qty <= 0) {
            return;
        }
        $balance = StockBalance::lockForUpdate()->firstOrCreate(
            ['stock_item_id' => $item->id, 'warehouse' => $warehouse],
            ['qty' => 0],
        );
        $balance->qty += $qty;
        $balance->save();
    }

    /** Decrement the balance for a warehouse, rejecting an over-draw. */
    public function remove(StockItem $item, string $warehouse, int $qty): void
    {
        if ($qty <= 0) {
            return;
        }
        $balance = StockBalance::lockForUpdate()
            ->where(['stock_item_id' => $item->id, 'warehouse' => $warehouse])
            ->first();
        $available = (int) ($balance->qty ?? 0);
        if ($available < $qty) {
            throw ValidationException::withMessages([
                'qty' => "Not enough stock in {$warehouse}: {$available} available.",
            ]);
        }
        $balance->qty -= $qty;
        $balance->save();
    }

    /** Move qty between two warehouses for one item. */
    public function move(StockItem $item, string $from, string $to, int $qty): void
    {
        if ($from === $to) {
            throw ValidationException::withMessages(['to_label' => 'Source and destination warehouse must differ.']);
        }
        $this->remove($item, $from, $qty);
        $this->add($item, $to, $qty);
    }

    /** Backfill: collapse an item's current_stock into a single balance row (its home warehouse). */
    public function rebuildFor(StockItem $item): void
    {
        $warehouse = $item->warehouse ?: 'Unassigned';
        StockBalance::updateOrCreate(
            ['stock_item_id' => $item->id, 'warehouse' => $warehouse],
            ['qty' => $item->current_stock],
        );
    }
}
```

- [ ] **Step 4: Run — PASS** (`php artisan test --compact tests/Feature/StockBalanceTest.php`).

- [ ] **Step 5: Pint + commit**
```bash
vendor/bin/pint --dirty --format agent
git add app/Services/StockBalanceService.php tests/Feature/StockBalanceTest.php
git commit -m "feat(stock): StockBalanceService (add/remove/move/rebuild) with per-warehouse guard"
```

---

## Task 3: Backfill migration (one balance per existing item)

**Files:** create migration.

- [ ] **Step 1: Create the migration**
```bash
php artisan make:migration backfill_stock_balances --no-interaction
```
Body (uses the service so logic stays in one place):
```php
<?php

use App\Models\StockItem;
use App\Services\StockBalanceService;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /** Seed one balance row per existing item from its current_stock + home warehouse. */
    public function up(): void
    {
        $svc = app(StockBalanceService::class);
        StockItem::query()->chunkById(200, function ($items) use ($svc) {
            foreach ($items as $item) {
                $svc->rebuildFor($item);
            }
        });
    }

    public function down(): void
    {
        // Balances are dropped with the table migration; nothing to reverse here.
    }
};
```

- [ ] **Step 2: Run the migration** (against dev DB with existing data): `php artisan migrate`. Report how many items were processed (optional: `php artisan tinker --execute 'echo App\Models\StockBalance::count();'`).

- [ ] **Step 3: Commit**
```bash
git add database/migrations/*_backfill_stock_balances.php
git commit -m "chore(stock): backfill per-warehouse balances from current_stock (live-safe)"
```

---

## Task 4: `doc_no` column + `DocNumber` helper

**Files:** create migration + `app/Support/DocNumber.php`; modify `app/Models/StockMovement.php` (fillable); test `tests/Feature/DocNumberTest.php`.

- [ ] **Step 1: Failing test** — create `tests/Feature/DocNumberTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Support\DocNumber;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DocNumberTest extends TestCase
{
    use RefreshDatabase;

    public function test_generates_sequential_numbers_per_prefix_and_year(): void
    {
        $a = DocNumber::next('transfer', 2026);
        $b = DocNumber::next('transfer', 2026);
        $c = DocNumber::next('receive', 2026);

        $this->assertSame('TRF-2026-001', $a);
        $this->assertSame('TRF-2026-002', $b);
        $this->assertSame('RCV-2026-001', $c);
    }
}
```

- [ ] **Step 2: Run — FAIL** (`DocNumber` missing).

- [ ] **Step 3: Migration**
```bash
php artisan make:migration add_doc_no_to_stock_movements --no-interaction
```
Body:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->string('doc_no', 30)->nullable()->unique()->after('id');
        });
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropUnique(['doc_no']);
            $table->dropColumn('doc_no');
        });
    }
};
```

- [ ] **Step 4: Helper** — create `app/Support/DocNumber.php`:
```php
<?php

namespace App\Support;

use App\Models\StockMovement;
use Illuminate\Support\Facades\DB;

/**
 * Running document numbers for stock movements: <PREFIX>-<YEAR>-<NNN>, counted per
 * (prefix, year). Call inside the movement transaction so the row lock serialises
 * concurrent inserts and prevents duplicates.
 */
class DocNumber
{
    private const PREFIX = [
        'receive' => 'RCV',
        'issue' => 'ISS',
        'return' => 'RET',
        'transfer' => 'TRF',
        'adjust_up' => 'ADJ',
        'adjust_down' => 'ADJ',
    ];

    public static function next(string $type, int $year): string
    {
        $prefix = self::PREFIX[$type] ?? 'MOV';
        $like = "{$prefix}-{$year}-%";

        $last = StockMovement::where('doc_no', 'like', $like)
            ->orderByDesc('doc_no')
            ->lockForUpdate()
            ->value('doc_no');

        $seq = $last ? ((int) substr($last, -3)) + 1 : 1;

        return sprintf('%s-%d-%03d', $prefix, $year, $seq);
    }
}
```
> `DB` import kept for parity with sibling helpers even if unused; remove if Pint flags it.

- [ ] **Step 5: Fillable** — in `app/Models/StockMovement.php` add `'doc_no'` to `$fillable` (first element):
```php
    protected $fillable = [
        'doc_no', 'type', 'stock_item_id', 'qty', 'unit_cost', 'from_label', 'to_label',
        'reference', 'recorded_by', 'user_id', 'notes', 'moved_at',
    ];
```

- [ ] **Step 6: Migrate + run — PASS**
```bash
php artisan migrate
php artisan test --compact tests/Feature/DocNumberTest.php
```

- [ ] **Step 7: Pint + commit**
```bash
vendor/bin/pint --dirty --format agent
git add database/migrations/*_add_doc_no_to_stock_movements.php app/Support/DocNumber.php app/Models/StockMovement.php tests/Feature/DocNumberTest.php
git commit -m "feat(stock): movement doc_no column + DocNumber generator"
```

---

## Task 5: `StockMovement::delta()` transfer-neutral

**Files:** modify `app/Models/StockMovement.php`; covered by Task 6 tests.

- [ ] **Step 1: Make `delta()` return 0 for transfer** — replace the method:
```php
    /** Signed stock delta this movement applies to the SKU total. Transfer is neutral. */
    public function delta(): int
    {
        if ($this->type === 'transfer') {
            return 0;
        }

        return in_array($this->type, self::INBOUND, true) ? $this->qty : -$this->qty;
    }
```

- [ ] **Step 2: Commit** (behavioural assertions land in Task 6)
```bash
vendor/bin/pint --dirty --format agent
git add app/Models/StockMovement.php
git commit -m "feat(stock): transfer is stock-neutral in StockMovement::delta()"
```

---

## Task 6: Rewire `record()` — balances + doc_no + transfer-neutral + transfer serials

> Apply **debug-mantra** here: the transfer bug (consumes stock + FIFO lots) is the thing being fixed; verify with the reproduce-style test in Step 1 before changing code.

**Files:** modify `app/Http/Controllers/Api/StockMovementController.php`; create `tests/Feature/StockTransferTest.php`; modify `tests/Feature/StockFifoCostingTest.php`.

- [ ] **Step 1: Failing tests** — create `tests/Feature/StockTransferTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Models\StockBalance;
use App\Models\StockItem;
use App\Models\StockItemSerial;
use App\Models\StockLot;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockTransferTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function item(int $stock = 0, bool $serial = false): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-TR-'.fake()->unique()->numerify('###'),
            'name' => 'Transfer item', 'unit' => 'unit', 'cost' => 0,
            'current_stock' => $stock, 'min_stock' => 0, 'max_stock' => 0,
            'warehouse' => 'WH-A', 'track_serial' => $serial,
        ]);
    }

    public function test_transfer_is_stock_and_lot_neutral_and_moves_balance(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();

        // Receive 10 @100 into WH-A → balance WH-A = 10, one lot.
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 10, 'unit_cost' => 100, 'to_label' => 'WH-A',
        ])->assertCreated();

        // Transfer 4 from WH-A to WH-B.
        $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 4, 'from_label' => 'WH-A', 'to_label' => 'WH-B',
        ])->assertCreated()->assertJsonPath('data.type', 'transfer');

        $item->refresh();
        $this->assertSame(10, $item->current_stock, 'transfer must not change total');
        $this->assertSame(10, (int) StockLot::where('stock_item_id', $item->id)->sum('qty_remaining'), 'transfer must not consume lots');
        $this->assertSame(6, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-A'])->value('qty'));
        $this->assertSame(4, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-B'])->value('qty'));
    }

    public function test_transfer_rejects_over_source_balance(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 3, 'to_label' => 'WH-A'])->assertCreated();

        $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 5, 'from_label' => 'WH-A', 'to_label' => 'WH-B',
        ])->assertStatus(422);
    }

    public function test_transfer_assigns_doc_no(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 5, 'to_label' => 'WH-A'])->assertCreated();

        $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 2, 'from_label' => 'WH-A', 'to_label' => 'WH-B',
        ])->assertCreated()->assertJsonPath('data.doc_no', 'TRF-'.now()->year.'-001');
    }

    public function test_serialized_transfer_moves_selected_serials_warehouse(): void
    {
        $this->actingAs($this->super());
        $item = $this->item(0, true);
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SNT-1', 'SNT-2'], 'to_label' => 'WH-A',
        ])->assertCreated();

        $serialId = StockItemSerial::where('serial', 'SNT-1')->value('id');

        $this->postJson('/api/stock-movements', [
            'type' => 'transfer', 'stock_item_id' => $item->id, 'from_label' => 'WH-A', 'to_label' => 'WH-B',
            'serial_ids' => [$serialId],
        ])->assertCreated();

        $this->assertSame('WH-B', StockItemSerial::find($serialId)->warehouse);
        $this->assertSame('WH-A', StockItemSerial::where('serial', 'SNT-2')->value('warehouse'));
        $this->assertSame(1, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-B'])->value('qty'));
    }
}
```
> Note: `track_serial` must be a fillable/castable column on `StockItem` (it is — used in MovementDrawer/receive). If `StockItem` test creation rejects `track_serial`, add it to `$fillable` in the same task.

- [ ] **Step 2: Run — FAIL** (transfer still consumes stock/lots; no balances/doc_no/serial move).

- [ ] **Step 3: Rewire the controller.** Edit `app/Http/Controllers/Api/StockMovementController.php`:

(a) Constructor — inject the balance service:
```php
    public function __construct(
        private readonly StockLotService $lotService,
        private readonly \App\Services\StockBalanceService $balances,
    ) {}
```

(b) `store()` validation — allow `serial_ids` for transfer (after the existing rules, add):
```php
            'serial_ids' => ['array'],
            'serial_ids.*' => ['integer', 'exists:stock_item_serials,id'],
```

(c) Replace the body of `record()` from the `$movement = StockMovement::create([...])` block onward so balances + doc_no + transfer handling are applied. The full new `record()`:
```php
    public function record(array $data, ?string $recordedBy, ?int $userId = null, array $serials = []): StockMovement
    {
        return DB::transaction(function () use ($data, $recordedBy, $userId, $serials) {
            /** @var StockItem $item */
            $item = StockItem::lockForUpdate()->findOrFail($data['stock_item_id']);
            $type = $data['type'];
            $isTransfer = $type === 'transfer';
            $inbound = in_array($type, StockMovement::INBOUND, true);

            // Quantity: serialized receive → number of serials; serialized transfer → number of picked serials.
            $serialIds = $data['serial_ids'] ?? [];
            $qty = match (true) {
                $serials !== [] => count($serials),
                $isTransfer && $item->track_serial => count($serialIds),
                default => (int) ($data['qty'] ?? 0),
            };

            $fromWh = $data['from_label'] ?? null;
            $toWh = $data['to_label'] ?? null;

            // Outbound (non-transfer) needs enough total stock; transfer/issue per-warehouse
            // guard is enforced by the balance service below.
            if (! $inbound && ! $isTransfer && $item->current_stock < $qty) {
                throw ValidationException::withMessages(['qty' => "Not enough stock: {$item->current_stock} available."]);
            }

            $unitCost = $type === 'receive' && isset($data['unit_cost']) ? (float) $data['unit_cost'] : null;
            $movedAt = isset($data['moved_at']) ? \Illuminate\Support\Carbon::parse($data['moved_at']) : now();

            $movement = StockMovement::create([
                'doc_no' => \App\Support\DocNumber::next($type, (int) $movedAt->year),
                'type' => $type,
                'stock_item_id' => $item->id,
                'qty' => $qty,
                'unit_cost' => $unitCost,
                'from_label' => $fromWh,
                'to_label' => $toWh,
                'reference' => $data['reference'] ?? null,
                'recorded_by' => $recordedBy,
                'user_id' => $userId,
                'notes' => $data['notes'] ?? null,
                'moved_at' => $movedAt,
            ]);

            if ($isTransfer) {
                // Stock- and cost-neutral: only the per-warehouse balance (and serial location) move.
                $this->balances->move($item, (string) $fromWh, (string) $toWh, $qty);
                if ($item->track_serial && $serialIds !== []) {
                    StockItemSerial::whereIn('id', $serialIds)
                        ->where('stock_item_id', $item->id)
                        ->update(['warehouse' => $toWh]);
                }
                $item->last_move_at = $movement->moved_at->toDateString();
                $item->save();
            } else {
                $item->current_stock += $movement->delta();
                $item->last_move_at = $movement->moved_at->toDateString();
                $item->save();

                if ($inbound) {
                    $this->balances->add($item, (string) $toWh, $qty);
                    $this->lotService->addLot($item, $qty, $unitCost, $movement->id, $movement->moved_at);
                } else {
                    $this->balances->remove($item, (string) $fromWh, $qty);
                    $this->lotService->consume($item, $qty);
                }

                foreach ($serials as $serial) {
                    StockItemSerial::create([
                        'stock_item_id' => $item->id,
                        'stock_movement_id' => $movement->id,
                        'serial' => $serial,
                        'status' => 'in_stock',
                        'warehouse' => $toWh ?? $item->warehouse,
                        'reference' => $data['reference'] ?? null,
                        'received_at' => $movement->moved_at,
                    ]);
                }
            }

            AuditLog::record('Stock '.$type, "{$item->sku} ×{$qty}");

            return $movement;
        });
    }
```
Add imports at top if missing: `use App\Support\DocNumber;` is referenced fully-qualified above, so no new `use` needed; `Carbon` is referenced fully-qualified too. (Pint may shorten — that's fine.)

- [ ] **Step 4: Run new tests — PASS** (`php artisan test --compact tests/Feature/StockTransferTest.php`).

- [ ] **Step 5: Retarget the FIFO consumption test.** In `tests/Feature/StockFifoCostingTest.php`, `test_outbound_consumes_oldest_lot_first_fifo` currently consumes via `type=transfer`. Transfer is now neutral, so consume via an **issue** instead. Replace the transfer call + assertions with a fulfilled request that issues 12 units (helper pattern from `StockWorkflowTest`):
```php
        // Consume 12 via an issue (fulfilling a request) — transfer is now stock-neutral.
        $req = \App\Models\StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $this->super()->id,
            'requester_name' => 'Tester', 'qty' => 12, 'reason' => 'fifo', 'status' => 'approved',
        ]);
        $this->postJson("/api/stock-requests/{$req->id}/fulfill")->assertOk();
```
Keep the existing assertions (`current_stock === 8`, `stockValue() === 2000.0`, lot A `qty_remaining === 0`). Ensure the item was received into a warehouse so the issue has a balance to draw from — add `'to_label' => $item->warehouse` to the `receive()` helper calls in this file if they don't already pass a warehouse, OR have the test receive into `$item->warehouse`. (Issue deducts from `$item->warehouse` per Task 7.)

- [ ] **Step 6: Run FIFO test — PASS** (`php artisan test --compact tests/Feature/StockFifoCostingTest.php`).

- [ ] **Step 7: Pint + commit**
```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/StockMovementController.php tests/Feature/StockTransferTest.php tests/Feature/StockFifoCostingTest.php
git commit -m "feat(stock): warehouse-aware movements; transfer is stock/cost-neutral + serial-aware"
```

---

## Task 7: Fulfill (issue) deducts from a source warehouse + doc_no

**Files:** modify `app/Http/Controllers/Api/StockRequestController.php`; modify `tests/Feature/StockWorkflowTest.php` + `tests/Feature/StockSerialReceiveTest.php` as needed.

- [ ] **Step 1: Failing test** — add to `tests/Feature/StockWorkflowTest.php` (it already has item()/super()/request helpers; mirror them):
```php
    public function test_fulfill_deducts_from_chosen_source_warehouse(): void
    {
        $this->actingAs($this->super());
        $item = $this->item(0);
        // Receive 10 into WH-A and 5 into WH-B.
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 10, 'to_label' => 'WH-A'])->assertCreated();
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 5, 'to_label' => 'WH-B'])->assertCreated();

        $req = \App\Models\StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $this->super()->id,
            'requester_name' => 'Tester', 'qty' => 4, 'reason' => 'x', 'status' => 'approved',
        ]);

        $this->postJson("/api/stock-requests/{$req->id}/fulfill", ['from_warehouse' => 'WH-B'])->assertOk();

        $this->assertSame(11, $item->fresh()->current_stock);
        $this->assertSame(1, (int) \App\Models\StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-B'])->value('qty'));
        $this->assertSame(10, (int) \App\Models\StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-A'])->value('qty'));
    }
```

- [ ] **Step 2: Run — FAIL** (fulfill ignores `from_warehouse`, doesn't touch balances).

- [ ] **Step 3: Update `fulfill()`** in `StockRequestController.php`. Inject the balance service and use it. Constructor:
```php
    public function __construct(
        private readonly StockSerialService $serialService,
        private readonly StockLotService $lotService,
        private readonly \App\Services\StockBalanceService $balances,
    ) {}
```
Validation in `fulfill()` (extend):
```php
        $data = $request->validate([
            'serial_ids' => ['array'],
            'serial_ids.*' => ['integer'],
            'from_warehouse' => ['nullable', 'string', 'max:120'],
        ]);
```
Inside the transaction, after loading `$item`, resolve the source warehouse and deduct the balance; add a doc_no to the movement; keep lot/serial logic:
```php
            $fromWarehouse = $data['from_warehouse'] ?? ($item->warehouse ?: 'Unassigned');

            if ($item->current_stock < $stockRequest->qty) {
                throw ValidationException::withMessages(['qty' => "Not enough stock: {$item->current_stock} available."]);
            }

            $movement = StockMovement::create([
                'doc_no' => \App\Support\DocNumber::next('issue', (int) now()->year),
                'type' => 'issue',
                'stock_item_id' => $item->id,
                'qty' => $stockRequest->qty,
                'from_label' => $fromWarehouse,
                'to_label' => $stockRequest->requester_name,
                'reference' => "REQ-{$stockRequest->id}",
                'recorded_by' => $user->name,
                'user_id' => $user->id,
                'moved_at' => now(),
            ]);

            // Per-warehouse guard + total + FIFO + serials.
            $this->balances->remove($item, $fromWarehouse, $stockRequest->qty);
            $item->current_stock -= $stockRequest->qty;
            $item->last_move_at = now()->toDateString();
            $item->save();

            $this->lotService->consume($item, $stockRequest->qty);
            $this->serialService->issue($item, $data['serial_ids'] ?? [], $stockRequest->qty);
```
(Remove the old `StockMovement::create([...])` and the manual `current_stock -=` / `lotService->consume` lines that this block replaces.)

- [ ] **Step 4: Run — PASS** (`php artisan test --compact tests/Feature/StockWorkflowTest.php`).

- [ ] **Step 5: Fix any serial-receive fulfill tests.** Run `php artisan test --compact tests/Feature/StockSerialReceiveTest.php`. The serialized fulfill tests receive serials (into `$item->warehouse`) then fulfill with no `from_warehouse` → defaults to `$item->warehouse`, which now has a balance from the receive. If a test received serials without a `to_label`, the receive defaulted the balance to `$item->warehouse` (record() uses `$toWh ?? $item->warehouse` for the serial, and `add($item, (string)$toWh, ...)` — note: if `to_label` is null on a serialized receive, the BALANCE add uses `(string) null = ''`). **To avoid an empty-warehouse balance, the serialized-receive helpers must pass `'to_label' => $item->warehouse`.** Update `receiveSerials()`/receive helpers in that test file to include `'to_label' => $item->warehouse`. Re-run until green.

- [ ] **Step 6: Pint + commit**
```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/StockRequestController.php tests/Feature/StockWorkflowTest.php tests/Feature/StockSerialReceiveTest.php
git commit -m "feat(stock): fulfill issues from a chosen source warehouse + doc_no"
```

---

## Task 8: Dashboard `by_warehouse` from balances + expose balances on resource

**Files:** modify `app/Http/Controllers/Api/StockItemController.php`; modify `app/Http/Resources/StockItemResource.php`; test in `tests/Feature/StockBalanceTest.php`.

- [ ] **Step 1: Failing test** — add to `StockBalanceTest`:
```php
    public function test_summary_groups_units_by_balance_warehouse(): void
    {
        $user = \App\Models\User::factory()->create(['role' => 'super']);
        $item = $this->item(0);
        app(\App\Services\StockBalanceService::class)->add($item, 'WH-A', 7);
        app(\App\Services\StockBalanceService::class)->add($item, 'WH-B', 3);
        $item->update(['current_stock' => 10]);

        $res = $this->actingAs($user)->getJson('/api/stock-items/summary')->assertOk();
        $byWh = collect($res->json('data.by_warehouse'))->keyBy('warehouse');

        $this->assertSame(7, $byWh['WH-A']['units']);
        $this->assertSame(3, $byWh['WH-B']['units']);
    }
```
> Confirm the summary route is `/api/stock-items/summary` and the JSON path (`data.by_warehouse` or `by_warehouse`). Adjust the assertion path to match the existing summary response shape (check `StockItemController::summary()` return).

- [ ] **Step 2: Run — FAIL** (units still grouped by the item's single warehouse).

- [ ] **Step 3: Recompute `by_warehouse` from balances.** In `StockItemController::summary()` replace the `$byWarehouse = $items->groupBy('warehouse')...` block (lines ~79-84) with a balance-driven aggregation:
```php
        $byWarehouse = \App\Models\StockBalance::query()
            ->selectRaw('warehouse, COUNT(DISTINCT stock_item_id) as skus, SUM(qty) as units')
            ->groupBy('warehouse')
            ->get()
            ->map(fn ($row) => [
                'warehouse' => $row->warehouse ?: '—',
                'skus' => (int) $row->skus,
                'units' => (int) $row->units,
            ])
            ->values();
```
> The previous shape also included `value` (stock value). Per-warehouse cost is out of scope (FIFO is SKU-level); drop `value` from `by_warehouse` and ensure the frontend (`stock/index.tsx` by-warehouse list) no longer reads `.value` for that block — adjust in Task 11. If keeping the key is easier for the UI, set `'value' => 0` and note it.

- [ ] **Step 4: Expose balances on the item resource.** In `StockItemResource::toArray()`, where serials/lots are conditionally included (on show), add:
```php
            'balances' => $this->whenLoaded('balances', fn () => $this->balances->map(fn ($b) => [
                'warehouse' => $b->warehouse,
                'qty' => $b->qty,
            ])->values()),
```
And ensure `StockItem` detail (the `useStockItem`/show endpoint) eager-loads `balances` — in `StockItemController@show` add `->load('balances')` (or include in the existing `with(...)`).

- [ ] **Step 5: Run — PASS** (`php artisan test --compact tests/Feature/StockBalanceTest.php`).

- [ ] **Step 6: Pint + commit**
```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/StockItemController.php app/Http/Resources/StockItemResource.php tests/Feature/StockBalanceTest.php
git commit -m "feat(stock): per-warehouse dashboard totals + expose item balances"
```

---

## Task 9: Frontend plumbing — types, API, hooks

**Files:** modify `resources/js/types/index.ts`, `resources/js/services/stockApi.ts`, `resources/js/hooks/use-stock.ts`.

- [ ] **Step 1: Types** — in `resources/js/types/index.ts`:
  - Add a balance type and include it on `StockItem`:
```ts
export interface StockBalance {
    warehouse: string;
    qty: number;
}
```
  Add `balances?: StockBalance[];` to the `StockItem` interface (next to `serials?`).
  - On `StockMovement`, add `doc_no: string | null;`.

- [ ] **Step 2: API** — in `resources/js/services/stockApi.ts`, the movement create payload type: add optional `serial_ids?: number[]` and ensure `from_label`/`to_label` are present (they already are per the create signature). The fulfill call: add optional `from_warehouse?: string` to its body type. (Show the exact payload interface edit based on the file's current shape.)

- [ ] **Step 3: Hooks** — in `resources/js/hooks/use-stock.ts`, the `fulfill` mutation should pass `from_warehouse` through. Update its input type from `{ id; serialIds? }` to `{ id; serialIds?; fromWarehouse? }` and include `from_warehouse: fromWarehouse` in the request body.

- [ ] **Step 4: Verify** — `npx tsc --noEmit` (expect downstream errors only where the dialog will be updated in Tasks 10-11; if the type additions are purely additive/optional, tsc should stay clean). `npx eslint` the three files.

- [ ] **Step 5: Commit**
```bash
git add resources/js/types/index.ts resources/js/services/stockApi.ts resources/js/hooks/use-stock.ts
git commit -m "feat(stock-ui): types/api/hooks for balances, transfer serials, fulfill warehouse"
```

---

## Task 10: Transfer dialog rebuild (use frontend-design)

> Invoke **frontend-design** for this task: rebuild the transfer mode of `MovementDrawer` to the behaviour below, matching the existing drawer's visual language (it already has serial-row UI to reuse). Keep receive/return/issue modes working.

**Files:** modify `resources/js/components/stock/movement-drawer.tsx`.

- [ ] **Step 1: Behaviour spec to implement**
  - Transfer mode (`kind === 'transfer'`):
    - **Hide the Reference field** (keep it for receive/return). Show the auto doc number hint text "TRF-… (ออกอัตโนมัติ)".
    - **From warehouse** and **To warehouse**: both `SearchableSelect` backed by `useWarehouses()` (already imported). Default From = item's warehouse.
    - When the selected SKU is **qty-only**: show "คงเหลือที่ {From}" using the item's `balances` (fetch via `useStockItem(selected.id)` detail, or compute from a balances map) and a quantity input with `max` = that source balance.
    - When the selected SKU is **serialized**: list `in_stock` serials whose `warehouse === From` (from the item's `serials`) with checkboxes; selected count is the qty; submit `serial_ids` of the checked rows.
    - Disable submit when: `from === to`, qty `<= 0` or `> source balance`, or (serialized) no serial selected.
  - On submit for transfer send `{ type:'transfer', stock_item_id, qty, from_label:from, to_label:to, serial_ids? }` (no `reference`).

- [ ] **Step 2: Implement** following the existing component's patterns (reuse the serial-row list styling already present for receive). Keep changes scoped to the transfer branch; do not regress receive/return.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npx eslint resources/js/components/stock/movement-drawer.tsx` clean. Build (`npm run build`) and sanity-check the transfer dialog manually.

- [ ] **Step 4: Commit**
```bash
git add resources/js/components/stock/movement-drawer.tsx
git commit -m "feat(stock-ui): rebuild transfer dialog — from/to warehouse, serial pick, auto doc_no"
```

---

## Task 11: Fulfill source warehouse + dashboard by-warehouse UI

**Files:** modify `resources/js/pages/stock/index.tsx`.

- [ ] **Step 1: Fulfill dialog** — in the RequestsTab fulfill dialog, add a **source warehouse** `SearchableSelect` (backed by `useWarehouses()`), defaulting to the item's warehouse. For serialized items, scope the serial picker to serials whose `warehouse` matches the chosen source. Pass `fromWarehouse` into `fulfill.mutate({ id, serialIds?, fromWarehouse })`.

- [ ] **Step 2: Dashboard by-warehouse** — the `summary.by_warehouse` list now comes from balances and no longer carries `value` (per Task 8). Remove the `.value` usage from that block's rendering (or display units only). Keep the click-to-filter-by-warehouse behaviour.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npx eslint resources/js/pages/stock/index.tsx` clean.

- [ ] **Step 4: Commit**
```bash
git add resources/js/pages/stock/index.tsx
git commit -m "feat(stock-ui): fulfill source warehouse + balance-driven by-warehouse list"
```

---

## Task 12: Full verification + README

- [ ] **Step 1: Backend** — `php artisan test --compact` (all green; pay attention to StockFifoCostingTest, StockWorkflowTest, StockSerialReceiveTest, StockTransferTest, StockBalanceTest, DocNumberTest).
- [ ] **Step 2: Pint** — `vendor/bin/pint --dirty --format agent`.
- [ ] **Step 3: Frontend** — `npx tsc --noEmit` and `npx eslint resources/js` (no NEW errors vs the pre-existing baseline).
- [ ] **Step 4: Route/manual sanity** — receive into two warehouses, transfer between them (qty + serialized), fulfill from a chosen warehouse; confirm `current_stock` stays correct, balances move, lots untouched on transfer, doc numbers appear.
- [ ] **Step 5: README** — append a Stock-module section (per the README's per-module Thai cadence) summarizing: per-warehouse balances, transfer is stock/cost-neutral + serial-aware, auto doc numbers, fulfill source warehouse, dashboard by-warehouse, backfill migration.
- [ ] **Step 6: Commit**
```bash
git add Readme.md
git commit -m "docs(stock): warehouse-aware balances + transfer redesign"
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** balances table+model (T1), service (T2), backfill (T3), doc_no (T4), transfer-neutral (T5/T6), warehouse-aware movements + serial transfer (T6), fulfill source warehouse (T7), dashboard+resource (T8), frontend types/api/hooks (T9), transfer dialog (T10), fulfill UI + dashboard UI (T11), verify+README (T12). ✓
- **The transfer-bug breadcrumb:** `StockFifoCostingTest` retargeted from transfer→issue (T6 Step 5). ✓
- **Live-data safety:** all migrations additive; backfill via service (T3). ✓
- **current_stock stays cached total:** maintained in record()/fulfill alongside balances. ✓
- **Type consistency:** `StockBalanceService::add/remove/move/rebuildFor`, `DocNumber::next($type,$year)`, `StockBalance{warehouse,qty}`, movement `doc_no`, fulfill `from_warehouse` — names identical across backend + frontend tasks. ✓
- **Edge:** serialized receive must pass `to_label` so the balance/serial warehouse isn't empty (flagged in T7 Step 5 / T6 serial block). ✓
