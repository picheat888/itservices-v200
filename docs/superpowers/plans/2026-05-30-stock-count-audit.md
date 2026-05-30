# Stock Count / Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder Stock-count tab with a real count-session workflow that records counted quantities, shows variance, and commits stock adjustments through the movement ledger.

**Architecture:** Two tables (`stock_counts`, `stock_count_lines`). A `StockCountService` opens a draft (snapshotting `current_stock` per item), saves counted quantities, and on commit posts an `adjust_up`/`adjust_down` `StockMovement` per varied line and sets `current_stock` to the counted value (the count is ground truth). Gated by `stock.audit`. Frontend swaps the placeholder tab for a session list + new-count drawer + count sheet.

**Tech Stack:** Laravel 12 (PHP 8.2), PHPUnit; React 19 + TS, Tailwind, react-query. Run commands from project root: `Set-Location C:\xampp\htdocs\itservices-v200; <cmd>`.

---

## File Structure

- Create: `database/migrations/*_create_stock_counts_tables.php`
- Create: `app/Enums/StockCountStatus.php`
- Modify: `app/Models/StockMovement.php` (add adjust types)
- Create: `app/Models/StockCount.php`, `app/Models/StockCountLine.php`
- Create: `app/Services/StockCountService.php`
- Create: `app/Http/Controllers/Api/StockCountController.php`, `app/Http/Resources/StockCountResource.php`
- Modify: `routes/api.php`
- Create: `tests/Feature/StockCountTest.php`
- Modify (frontend): `resources/js/types/index.ts`, `resources/js/services/stockApi.ts`, `resources/js/hooks/use-stock.ts`, `resources/js/pages/stock/index.tsx`, `resources/js/lib/i18n.ts`

---

### Task 1: Tables

**Files:** Create `database/migrations/2026_05_30_140000_create_stock_counts_tables.php`

- [ ] **Step 1: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_counts', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();       // SC-####
            $table->string('warehouse')->nullable();     // filter the session was opened for
            $table->string('category')->nullable();
            $table->string('status')->default('draft');  // draft | committed | canceled
            $table->text('note')->nullable();
            $table->foreignId('counted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('committed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('stock_count_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_count_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stock_item_id')->constrained()->cascadeOnDelete();
            $table->integer('system_qty');               // snapshot of current_stock at open
            $table->integer('counted_qty')->nullable();  // entered while counting
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_count_lines');
        Schema::dropIfExists('stock_counts');
    }
};
```

- [ ] **Step 2: Migrate**

Run: `Set-Location C:\xampp\htdocs\itservices-v200; php artisan migrate --no-interaction --force`
Expected: both tables created.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/2026_05_30_140000_create_stock_counts_tables.php
git commit -m "feat(stock): stock_counts + stock_count_lines tables"
```

---

### Task 2: Enum + movement adjust types

**Files:** Create `app/Enums/StockCountStatus.php`; Modify `app/Models/StockMovement.php`

- [ ] **Step 1: Create the enum**

```php
<?php

namespace App\Enums;

/** Lifecycle of a stock-count session. */
enum StockCountStatus: string
{
    case Draft = 'draft';
    case Committed = 'committed';
    case Canceled = 'canceled';
}
```

- [ ] **Step 2: Add adjust types to StockMovement**

In `app/Models/StockMovement.php`, replace the `INBOUND` constant:

```php
    /** Movement types that increase on-hand stock; the rest decrease it. */
    public const INBOUND = ['receive', 'return', 'adjust_up'];
```

(`adjust_down` is outbound by omission. `delta()` already derives the sign from `INBOUND`.)

- [ ] **Step 3: Commit**

```bash
git add app/Enums/StockCountStatus.php app/Models/StockMovement.php
git commit -m "feat(stock): StockCountStatus enum + adjust_up/adjust_down movement types"
```

---

### Task 3: Models

**Files:** Create `app/Models/StockCount.php`, `app/Models/StockCountLine.php`

- [ ] **Step 1: StockCount model**

```php
<?php

namespace App\Models;

use App\Enums\StockCountStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockCount extends Model
{
    protected $fillable = ['reference', 'warehouse', 'category', 'status', 'note', 'counted_by', 'committed_at'];

    protected function casts(): array
    {
        return ['status' => StockCountStatus::class, 'committed_at' => 'datetime'];
    }

    /** Auto-assign SC-#### when no reference was supplied. */
    protected static function booted(): void
    {
        static::creating(function (StockCount $count) {
            if (blank($count->reference)) {
                $count->reference = 'SC-'.((static::max('id') ?? 1000) + 1);
            }
        });
    }

    /** @return HasMany<StockCountLine, $this> */
    public function lines(): HasMany
    {
        return $this->hasMany(StockCountLine::class);
    }

    public function countedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'counted_by');
    }
}
```

- [ ] **Step 2: StockCountLine model**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockCountLine extends Model
{
    protected $fillable = ['stock_count_id', 'stock_item_id', 'system_qty', 'counted_qty'];

    protected function casts(): array
    {
        return ['system_qty' => 'integer', 'counted_qty' => 'integer'];
    }

    /** Counted minus system; null until a count is entered. */
    public function variance(): ?int
    {
        return $this->counted_qty === null ? null : $this->counted_qty - $this->system_qty;
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }

    public function count(): BelongsTo
    {
        return $this->belongsTo(StockCount::class, 'stock_count_id');
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/Models/StockCount.php app/Models/StockCountLine.php
git commit -m "feat(stock): StockCount + StockCountLine models"
```

---

### Task 4: StockCountService

**Files:** Create `app/Services/StockCountService.php`

- [ ] **Step 1: Write the service**

```php
<?php

namespace App\Services;

use App\Enums\StockCountStatus;
use App\Models\AuditLog;
use App\Models\StockCount;
use App\Models\StockItem;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class StockCountService
{
    /**
     * Open a draft session, snapshotting current_stock for every item that matches
     * the optional warehouse / category filter.
     *
     * @param  array{warehouse?:?string, category?:?string, note?:?string}  $filters
     */
    public function open(array $filters, User $user): StockCount
    {
        return DB::transaction(function () use ($filters, $user) {
            $count = StockCount::create([
                'warehouse' => $filters['warehouse'] ?? null,
                'category' => $filters['category'] ?? null,
                'note' => $filters['note'] ?? null,
                'status' => StockCountStatus::Draft,
                'counted_by' => $user->id,
            ]);

            $items = StockItem::query()
                ->when($filters['warehouse'] ?? null, fn ($q, $w) => $q->where('warehouse', $w))
                ->when($filters['category'] ?? null, fn ($q, $c) => $q->where('category', $c))
                ->orderBy('sku')
                ->get(['id', 'current_stock']);

            foreach ($items as $item) {
                $count->lines()->create([
                    'stock_item_id' => $item->id,
                    'system_qty' => $item->current_stock,
                    'counted_qty' => null,
                ]);
            }

            AuditLog::record('Opened stock count', "{$count->reference} ({$count->lines()->count()} items)");

            return $count->load('lines');
        });
    }

    /**
     * Set counted quantities on a draft session's lines.
     *
     * @param  array<int, ?int>  $countedByLineId  line id => counted qty (null clears)
     */
    public function saveCounts(StockCount $count, array $countedByLineId): StockCount
    {
        abort_unless($count->status === StockCountStatus::Draft, 422, 'Count is not editable.');

        DB::transaction(function () use ($count, $countedByLineId) {
            foreach ($count->lines as $line) {
                if (array_key_exists($line->id, $countedByLineId)) {
                    $value = $countedByLineId[$line->id];
                    $line->update(['counted_qty' => $value === null ? null : max(0, (int) $value)]);
                }
            }
        });

        return $count->fresh('lines');
    }

    /**
     * Commit a draft: for every counted line whose count differs from system stock,
     * record an adjust_up/adjust_down movement and set the item's current_stock to
     * the counted value (the physical count is ground truth). Uncounted lines are
     * left untouched.
     */
    public function commit(StockCount $count, User $user): StockCount
    {
        abort_unless($count->status === StockCountStatus::Draft, 422, 'Count is already closed.');

        DB::transaction(function () use ($count, $user) {
            foreach ($count->lines()->with('item')->get() as $line) {
                $variance = $line->variance();
                if ($variance === null || $variance === 0 || $line->item === null) {
                    continue;
                }

                StockMovement::create([
                    'type' => $variance > 0 ? 'adjust_up' : 'adjust_down',
                    'stock_item_id' => $line->stock_item_id,
                    'qty' => abs($variance),
                    'reference' => $count->reference,
                    'recorded_by' => $user->name,
                    'user_id' => $user->id,
                    'notes' => 'Stock count adjustment',
                    'moved_at' => now(),
                ]);

                $line->item->update([
                    'current_stock' => $line->counted_qty,
                    'last_move_at' => now()->toDateString(),
                ]);
            }

            $count->update(['status' => StockCountStatus::Committed, 'committed_at' => now()]);
        });

        AuditLog::record('Committed stock count', $count->reference);

        return $count->fresh('lines');
    }

    /** Cancel a draft session without touching stock. */
    public function cancel(StockCount $count): StockCount
    {
        abort_unless($count->status === StockCountStatus::Draft, 422, 'Only a draft can be canceled.');
        $count->update(['status' => StockCountStatus::Canceled]);

        return $count;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/Services/StockCountService.php
git commit -m "feat(stock): StockCountService (open/save/commit/cancel)"
```

---

### Task 5: Resource + Controller + routes

**Files:** Create `app/Http/Resources/StockCountResource.php`, `app/Http/Controllers/Api/StockCountController.php`; Modify `routes/api.php`

- [ ] **Step 1: Resource**

```php
<?php

namespace App\Http\Resources;

use App\Models\StockCount;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin StockCount */
class StockCountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'warehouse' => $this->warehouse,
            'category' => $this->category,
            'status' => $this->status?->value,
            'note' => $this->note,
            'counted_by' => $this->whenLoaded('countedBy', fn () => $this->countedBy?->name),
            'committed_at' => $this->committed_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'lines' => $this->whenLoaded('lines', fn () => $this->lines->map(fn ($l) => [
                'id' => $l->id,
                'stock_item_id' => $l->stock_item_id,
                'sku' => $l->item?->sku,
                'name' => $l->item?->name,
                'system_qty' => $l->system_qty,
                'counted_qty' => $l->counted_qty,
                'variance' => $l->variance(),
            ])),
            'line_count' => $this->whenLoaded('lines', fn () => $this->lines->count()),
            'counted_lines' => $this->whenLoaded('lines', fn () => $this->lines->whereNotNull('counted_qty')->count()),
        ];
    }
}
```

- [ ] **Step 2: Controller**

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StockCountResource;
use App\Models\StockCount;
use App\Services\StockCountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StockCountController extends Controller
{
    public function __construct(private readonly StockCountService $service) {}

    private function gate(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.audit'), 403);
    }

    public function index(Request $request): JsonResponse
    {
        $this->gate($request);
        $counts = StockCount::with(['countedBy', 'lines'])->latest('id')->limit(100)->get();

        return response()->json(['data' => StockCountResource::collection($counts)]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->gate($request);
        $data = $request->validate([
            'warehouse' => ['nullable', 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $count = $this->service->open($data, $request->user());

        return (new StockCountResource($count->load(['countedBy', 'lines.item'])))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gate($request);

        return (new StockCountResource($stockCount->load(['countedBy', 'lines.item'])))->response();
    }

    public function update(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gate($request);
        $data = $request->validate([
            'counts' => ['required', 'array'],
            'counts.*' => ['nullable', 'integer', 'min:0'],
        ]);

        // keys arrive as strings from JSON; cast to int line ids.
        $byLineId = [];
        foreach ($data['counts'] as $lineId => $qty) {
            $byLineId[(int) $lineId] = $qty === null ? null : (int) $qty;
        }

        $count = $this->service->saveCounts($stockCount, $byLineId);

        return (new StockCountResource($count->load(['countedBy', 'lines.item'])))
            ->additional(['message' => 'success'])->response();
    }

    public function commit(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gate($request);
        $count = $this->service->commit($stockCount, $request->user());

        return (new StockCountResource($count->load(['countedBy', 'lines.item'])))
            ->additional(['message' => 'success'])->response();
    }

    public function destroy(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gate($request);
        $this->service->cancel($stockCount);

        return response()->json(['message' => 'success']);
    }
}
```

- [ ] **Step 3: Routes** — in `routes/api.php`, add the import near the other stock controllers:

```php
use App\Http\Controllers\Api\StockCountController;
```

and add these lines right after the `stock-requests/{stockRequest}/fulfill` route:

```php
    Route::post('stock-counts/{stockCount}/commit', [StockCountController::class, 'commit'])->name('api.stock-counts.commit');
    Route::apiResource('stock-counts', StockCountController::class)->except(['edit', 'create']);
```

- [ ] **Step 4: Verify routes + pint**

Run: `Set-Location C:\xampp\htdocs\itservices-v200; php artisan route:list --path=stock-counts; vendor/bin/pint --dirty --format agent`
Expected: 6 stock-counts routes listed; pint passed.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Resources/StockCountResource.php app/Http/Controllers/Api/StockCountController.php routes/api.php
git commit -m "feat(stock): StockCount controller + resource + routes (gated by stock.audit)"
```

---

### Task 6: Backend feature tests

**Files:** Create `tests/Feature/StockCountTest.php`

- [ ] **Step 1: Write the tests**

```php
<?php

namespace Tests\Feature;

use App\Models\RolePermission;
use App\Models\StockItem;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockCountTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function item(string $sku, int $stock, string $wh = 'Main'): StockItem
    {
        return StockItem::create(['sku' => $sku, 'name' => $sku, 'unit' => 'pcs', 'current_stock' => $stock, 'min_stock' => 1, 'max_stock' => 100, 'warehouse' => $wh]);
    }

    public function test_open_snapshots_a_line_per_matching_item(): void
    {
        $this->item('A-1', 10, 'Main');
        $this->item('B-1', 5, 'Other');
        $this->actingAs($this->super());

        $this->postJson('/api/stock-counts', ['warehouse' => 'Main'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonCount(1, 'data.lines')
            ->assertJsonPath('data.lines.0.system_qty', 10);
    }

    public function test_save_counts_then_commit_adjusts_stock_and_logs_movement(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());

        $count = $this->postJson('/api/stock-counts', [])->json('data');
        $lineId = $count['lines'][0]['id'];

        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 7]])
            ->assertOk()
            ->assertJsonPath('data.lines.0.variance', -3);

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertOk()
            ->assertJsonPath('data.status', 'committed');

        $this->assertSame(7, $item->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_down', 'qty' => 3]);
    }

    public function test_counted_up_records_adjust_up(): void
    {
        $item = $this->item('A-1', 4);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', [])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 9]])->assertOk();
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();

        $this->assertSame(9, $item->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_up', 'qty' => 5]);
    }

    public function test_uncounted_lines_are_untouched_and_recommit_blocked(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', [])->json('data');

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertOk();
        $this->assertSame(10, $item->fresh()->current_stock);
        $this->assertSame(0, StockMovement::count());

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])->assertStatus(422);
    }

    public function test_requires_stock_audit_permission(): void
    {
        $this->item('A-1', 10);
        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->postJson('/api/stock-counts', [])->assertForbidden();

        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'stock.audit', 'allowed' => true]);
        $this->actingAs($user)->postJson('/api/stock-counts', [])->assertCreated();
    }
}
```

- [ ] **Step 2: Run the tests**

Run: `Set-Location C:\xampp\htdocs\itservices-v200; php artisan test --compact tests/Feature/StockCountTest.php`
Expected: 5 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/Feature/StockCountTest.php
git commit -m "test(stock): StockCount feature tests (open/save/commit/RBAC)"
```

---

### Task 7: Frontend types + api + hooks

**Files:** Modify `resources/js/types/index.ts`, `resources/js/services/stockApi.ts`, `resources/js/hooks/use-stock.ts`

- [ ] **Step 1: Add types** — append to `resources/js/types/index.ts` (near the other stock types; if `StockMovementType` exists, add the two members to it):

```ts
export type StockCountStatus = 'draft' | 'committed' | 'canceled';

export interface StockCountLine {
    id: number;
    stock_item_id: number;
    sku: string | null;
    name: string | null;
    system_qty: number;
    counted_qty: number | null;
    variance: number | null;
}

export interface StockCount {
    id: number;
    reference: string;
    warehouse: string | null;
    category: string | null;
    status: StockCountStatus;
    note: string | null;
    counted_by?: string | null;
    committed_at: string | null;
    created_at: string | null;
    lines?: StockCountLine[];
    line_count?: number;
    counted_lines?: number;
}
```

Also find the `StockMovementType` union and add `'adjust_up' | 'adjust_down'` to it.

- [ ] **Step 2: Add api methods** — in `resources/js/services/stockApi.ts`, add to the exported api object (match the file's existing `http`/`mutate` helpers):

```ts
    listCounts: () => http.get<{ data: StockCount[] }>('/stock-counts').then((r) => r.data.data),
    getCount: (id: number) => http.get<ApiEnvelope<StockCount>>(`/stock-counts/${id}`).then((r) => r.data.data),
    openCount: (body: { warehouse?: string | null; category?: string | null; note?: string | null }) =>
        mutate<StockCount>('post', '/stock-counts', body),
    saveCounts: (id: number, counts: Record<number, number | null>) => mutate<StockCount>('put', `/stock-counts/${id}`, { counts }),
    commitCount: (id: number) => mutate<StockCount>('post', `/stock-counts/${id}/commit`, {}),
    cancelCount: (id: number) => mutate<void>('delete', `/stock-counts/${id}`),
```

Import `StockCount` (and `ApiEnvelope` if not already) at the top of the file.

- [ ] **Step 3: Add hooks** — in `resources/js/hooks/use-stock.ts`, add (match the file's `useQuery`/`useMutation` + invalidate pattern):

```ts
export const useStockCounts = (enabled = true) =>
    useQuery({ queryKey: ['stock-counts'], queryFn: stockApi.listCounts, enabled });

export function useStockCountMutations() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['stock-counts'] });
        qc.invalidateQueries({ queryKey: ['stock-items'] });
        qc.invalidateQueries({ queryKey: ['stock-movements'] });
        qc.invalidateQueries({ queryKey: ['stock-summary'] });
    };
    return {
        open: useMutation({ mutationFn: (b: { warehouse?: string | null; category?: string | null; note?: string | null }) => stockApi.openCount(b), onSuccess: invalidate }),
        save: useMutation({ mutationFn: (v: { id: number; counts: Record<number, number | null> }) => stockApi.saveCounts(v.id, v.counts), onSuccess: invalidate }),
        commit: useMutation({ mutationFn: (id: number) => stockApi.commitCount(id), onSuccess: invalidate }),
        cancel: useMutation({ mutationFn: (id: number) => stockApi.cancelCount(id), onSuccess: invalidate }),
    };
}
```

(Verify the exact query keys used elsewhere in this file and match them.)

- [ ] **Step 4: Typecheck + commit**

Run: `Set-Location C:\xampp\htdocs\itservices-v200; npx tsc --noEmit -p tsconfig.json`
Expected: clean.

```bash
git add resources/js/types/index.ts resources/js/services/stockApi.ts resources/js/hooks/use-stock.ts
git commit -m "feat(stock): stock-count types, api, hooks"
```

---

### Task 8: Audit tab UI + movement meta + i18n

**Files:** Modify `resources/js/pages/stock/index.tsx`, `resources/js/lib/i18n.ts`

- [ ] **Step 1: Movement meta** — in `resources/js/pages/stock/index.tsx`, extend `MV_META` so the new types render in the Movements list:

```tsx
    adjust_up: { tone: 'green', icon: ArrowDownToLine },
    adjust_down: { tone: 'amber', icon: ArrowUpFromLine },
```

(Add `adjust_up`/`adjust_down` keys to the `MV_META` object; reuse already-imported icons.)

- [ ] **Step 2: i18n** — add to both `en` and `th` dicts in `resources/js/lib/i18n.ts` (near the other `stock_*` keys):

```ts
    // en
    stock_new_count: 'New count',
    stock_count_ref: 'Reference',
    stock_count_system: 'System',
    stock_count_counted: 'Counted',
    stock_count_variance: 'Variance',
    stock_count_save: 'Save draft',
    stock_count_commit: 'Commit count',
    stock_count_committed: 'Committed',
    stock_count_draft: 'Draft',
    stock_count_canceled: 'Canceled',
    stock_count_none: 'No count sessions yet',
    stock_count_all_wh: 'All warehouses',
    stock_count_all_cat: 'All categories',
```

```ts
    // th
    stock_new_count: 'นับสต็อกใหม่',
    stock_count_ref: 'เลขที่',
    stock_count_system: 'ระบบ',
    stock_count_counted: 'นับได้',
    stock_count_variance: 'ส่วนต่าง',
    stock_count_save: 'บันทึกร่าง',
    stock_count_commit: 'ยืนยันการนับ',
    stock_count_committed: 'ยืนยันแล้ว',
    stock_count_draft: 'ร่าง',
    stock_count_canceled: 'ยกเลิก',
    stock_count_none: 'ยังไม่มีรอบนับ',
    stock_count_all_wh: 'ทุกคลัง',
    stock_count_all_cat: 'ทุกหมวด',
```

- [ ] **Step 3: Replace the placeholder audit tab** — in `resources/js/pages/stock/index.tsx`, swap the placeholder block (`{tab === 'audit' && ( … stock_phase_next … )}`) for an `<AuditTab can={can} />` element, and add the `AuditTab` component at the bottom of the file. The component:
  - `useStockCounts()` + `useStockCountMutations()` + `useWarehouses()`/categories already used in this file.
  - Renders a header with a **New count** button (`can('audit')`), opening a small form (warehouse + category selects, both optional) that calls `open.mutate(...)` and then selects the returned session.
  - When a session is selected and `status === 'draft'`: a table of `lines` with `system_qty`, a numeric `counted_qty` input bound to local state, and a live `variance` (counted − system) badge (green ≥0 / red <0); **Save draft** (`save.mutate({id, counts})`) and **Commit count** (`commit.mutate(id)`) buttons. Commit disabled until at least one line has a value.
  - When `committed`/`canceled`: read-only table with the stored variance.
  - A left list of recent sessions (reference, status badge, counted/line count) to switch between them.

Write it following the existing tab components in this file (`MovementsTab`, `RequestsTab`) for table/badge/drawer styling. Keep numeric inputs controlled via a `Record<number, string>` keyed by line id; convert to `Record<number, number|null>` on save/commit (empty string → null).

- [ ] **Step 4: Typecheck + build**

Run: `Set-Location C:\xampp\htdocs\itservices-v200; npx tsc --noEmit -p tsconfig.json; npm run build`
Expected: clean tsc; `✓ built`.

- [ ] **Step 5: Format + commit**

```bash
Set-Location C:\xampp\htdocs\itservices-v200; npx prettier --write "resources/js/pages/stock/index.tsx" "resources/js/lib/i18n.ts" "resources/js/types/index.ts" "resources/js/services/stockApi.ts" "resources/js/hooks/use-stock.ts"
git add resources/js/pages/stock/index.tsx resources/js/lib/i18n.ts
git commit -m "feat(stock): real Stock Count tab (session list + count sheet + commit)"
```

---

### Task 9: Full verification

- [ ] **Step 1: Run the suite + format**

Run: `Set-Location C:\xampp\htdocs\itservices-v200; vendor/bin/pint --dirty --format agent; php artisan test --compact`
Expected: pint passed; all tests green (179 prior + 5 new = 184).

- [ ] **Step 2: Seed a demo count (optional manual check)**

Log in as a user with `stock.audit`, open the Stock module → Count tab → New count → enter a few counts → Commit, and confirm the item stock changed and an adjust movement appears in the Movements tab.

---

## Self-Review

- **Spec coverage:** tables (T1) ✓; enum + adjust types (T2) ✓; models (T3) ✓; service open/save/commit/cancel (T4) ✓; controller + routes + resource gated by stock.audit (T5) ✓; tests incl. RBAC + uncounted + recommit-block (T6) ✓; frontend types/api/hooks (T7) ✓; audit tab UI + MV_META + i18n (T8) ✓; ground-truth `current_stock = counted_qty` (T4 commit) ✓; uncounted = no change (T4) ✓.
- **Placeholder scan:** backend tasks carry full code. T8 Step 3 describes the `AuditTab` structurally (the only prose-described unit) because it mirrors existing in-file tab components; all data contracts it uses are defined in T7. No "TBD"/"handle errors" placeholders.
- **Type consistency:** `StockCount`/`StockCountLine` fields match across migration, model, resource, TS types, and tests; service method names (`open`/`saveCounts`/`commit`/`cancel`) match the controller calls; movement types `adjust_up`/`adjust_down` consistent across model `INBOUND`, service, tests, and `MV_META`.
