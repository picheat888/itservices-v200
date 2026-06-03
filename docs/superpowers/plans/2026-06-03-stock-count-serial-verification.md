# Stock Count Serial Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Auto commit of a stock count, reconcile *which* serial units are missing for serialized items — the user ticks the not-found serials, those become `adjusted`, and stock drops to match. Manual mode is blocked when the session contains serialized items.

**Architecture:** The count `show` payload carries `track_serial` and the in-stock `serials` per line. The commit endpoint accepts `missing_serials` (item id → serial ids). `StockCountService::commit` validates and marks those serials `adjusted` before the usual quantity adjust. The frontend, after the confirm dialog, opens a serial-verification dialog when serialized lines are short, and disables Manual for serialized sessions.

**Tech Stack:** Laravel 12 (PHP 8.2), PHPUnit, React 19 + TypeScript, Tailwind v4, React Query, SweetAlert2.

**Spec:** `docs/superpowers/specs/2026-06-03-stock-count-serial-verification-design.md`
**Builds on:** the Auto/Manual adjust-mode work already in the working tree.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `app/Http/Resources/StockCountResource.php` | Emit `track_serial` + in-stock `serials` per line. |
| `app/Http/Controllers/Api/StockCountController.php` | `show` eager-loads in-stock serials; `commit` accepts/validates `missing_serials`. |
| `app/Services/StockCountService.php` | `commit()` reconciles serials; blocks Manual for serialized counts. |
| `tests/Feature/StockCountSerialTest.php` (new) | All serial-path tests. |
| `resources/js/types/index.ts` | `StockCountLine.track_serial` + `serials`. |
| `resources/js/services/stockApi.ts` | `commit(id, mode, missingSerials)`. |
| `resources/js/hooks/use-stock.ts` | `commit` mutation gains `missingSerials`. |
| `resources/js/lib/i18n.ts` | Serial-verify keys (en + th). |
| `resources/js/pages/stock/index.tsx` | Disable Manual for serialized sessions; serial-verify dialog + commit wiring. |

---

## Task 1: Count `show` exposes `track_serial` + in-stock serials

**Files:**
- Modify: `app/Http/Resources/StockCountResource.php`
- Modify: `app/Http/Controllers/Api/StockCountController.php`
- Test: `tests/Feature/StockCountSerialTest.php` (new)

- [ ] **Step 1: Create the test file with a serialized-item helper and the show test**

Create `tests/Feature/StockCountSerialTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\StockItem;
use App\Models\StockItemSerial;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockCountSerialTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** A serialized item with $stock in-stock serial units parked in $wh. */
    private function serialItem(string $sku, int $stock, string $wh = 'Main'): StockItem
    {
        $item = StockItem::create([
            'sku' => $sku, 'name' => $sku, 'unit' => 'pcs',
            'current_stock' => $stock, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        $item->balances()->create(['warehouse' => $wh, 'qty' => $stock]);
        for ($i = 1; $i <= $stock; $i++) {
            $item->serials()->create(['serial' => "{$sku}-SN{$i}", 'status' => 'in_stock', 'warehouse' => $wh]);
        }

        return $item;
    }

    public function test_show_returns_track_serial_and_in_stock_serials(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');

        $this->getJson("/api/stock-counts/{$count['id']}")
            ->assertOk()
            ->assertJsonPath('data.lines.0.track_serial', true)
            ->assertJsonCount(3, 'data.lines.0.serials')
            ->assertJsonPath('data.lines.0.serials.0.serial', 'UPS-1-SN1');
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php artisan test --compact --filter=StockCountSerialTest`
Expected: FAIL — `data.lines.0.track_serial` is missing (resource doesn't emit it yet).

- [ ] **Step 3: Emit `track_serial` + `serials` in the resource**

In `app/Http/Resources/StockCountResource.php`, replace the `lines` map entry block:

```php
            'lines' => $this->whenLoaded('lines', fn () => $this->lines->map(fn ($l) => [
                'id' => $l->id,
                'stock_item_id' => $l->stock_item_id,
                'sku' => $l->item?->sku,
                'name' => $l->item?->name,
                'system_qty' => $l->system_qty,
                'counted_qty' => $l->counted_qty,
                'variance' => $l->variance(),
            ])),
```

with:

```php
            'lines' => $this->whenLoaded('lines', fn () => $this->lines->map(fn ($l) => [
                'id' => $l->id,
                'stock_item_id' => $l->stock_item_id,
                'sku' => $l->item?->sku,
                'name' => $l->item?->name,
                'system_qty' => $l->system_qty,
                'counted_qty' => $l->counted_qty,
                'variance' => $l->variance(),
                'track_serial' => (bool) $l->item?->track_serial,
                // Only present once the in-stock serials are eager-loaded (the show endpoint).
                'serials' => $l->item && $l->item->relationLoaded('serials')
                    ? $l->item->serials->map(fn ($s) => ['id' => $s->id, 'serial' => $s->serial])->values()
                    : [],
            ])),
```

- [ ] **Step 4: Eager-load in-stock serials in `show`**

In `app/Http/Controllers/Api/StockCountController.php`, replace the `show` method body's `load(...)`:

```php
        return (new StockCountResource($stockCount->load(['countedBy', 'lines.item'])))->response();
```

with:

```php
        return (new StockCountResource($stockCount->load([
            'countedBy',
            'lines.item.serials' => fn ($q) => $q->where('status', 'in_stock'),
        ])))->response();
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `php artisan test --compact --filter=StockCountSerialTest`
Expected: PASS (1 passed).

- [ ] **Step 6: Format + commit**

```
vendor/bin/pint --dirty --format agent
```
```
git add app/Http/Resources/StockCountResource.php app/Http/Controllers/Api/StockCountController.php tests/Feature/StockCountSerialTest.php
git commit -m "feat(stock): expose track_serial + in-stock serials on count show"
```

---

## Task 2: Commit reconciles serials + validations (TDD)

**Files:**
- Test: `tests/Feature/StockCountSerialTest.php`
- Modify: `app/Http/Controllers/Api/StockCountController.php`
- Modify: `app/Services/StockCountService.php`

- [ ] **Step 1: Add the behaviour + validation tests**

In `tests/Feature/StockCountSerialTest.php`, add these methods before the closing brace:

```php
    public function test_auto_commit_marks_missing_serials_adjusted(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $serials = $item->serials()->orderBy('id')->get();
        $this->actingAs($this->super());

        $count = $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');
        $lineId = $count['lines'][0]['id'];
        // Counted 1 → short by 2; tick 2 serials as missing.
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 1]])->assertOk();

        $missing = [$serials[0]->id, $serials[1]->id];
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [
            'mode' => 'auto',
            'missing_serials' => [(string) $item->id => $missing],
        ])->assertOk()->assertJsonPath('data.status', 'committed');

        $this->assertSame(1, $item->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_down', 'qty' => 2]);
        $this->assertSame('adjusted', $serials[0]->fresh()->status);
        $this->assertSame('adjusted', $serials[1]->fresh()->status);
        $this->assertSame('in_stock', $serials[2]->fresh()->status);
    }

    public function test_manual_commit_blocked_when_serialized_item_present(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 1]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", ['mode' => 'manual'])->assertStatus(422);
        $this->assertSame(3, $item->fresh()->current_stock);
    }

    public function test_wrong_missing_count_is_rejected(): void
    {
        $item = $this->serialItem('UPS-1', 3);
        $serials = $item->serials()->orderBy('id')->get();
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 1]])->assertOk();

        // Short by 2 but only 1 serial ticked.
        $this->postJson("/api/stock-counts/{$count['id']}/commit", [
            'mode' => 'auto',
            'missing_serials' => [(string) $item->id => [$serials[0]->id]],
        ])->assertStatus(422);
        $this->assertSame(3, $item->fresh()->current_stock);
    }

    public function test_serial_from_another_item_is_rejected(): void
    {
        $item = $this->serialItem('UPS-1', 2);
        $other = $this->serialItem('UPS-2', 2);
        $otherSerial = $other->serials()->first();
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 1]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [
            'mode' => 'auto',
            'missing_serials' => [(string) $item->id => [$otherSerial->id]],
        ])->assertStatus(422);
    }

    public function test_positive_variance_on_serialized_item_is_rejected(): void
    {
        $item = $this->serialItem('UPS-1', 2);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', ['stock_item_ids' => [$item->id]])->json('data');
        $lineId = $count['lines'][0]['id'];
        // Counted 5 > system 2.
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 5]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [
            'mode' => 'auto',
            'missing_serials' => [(string) $item->id => []],
        ])->assertStatus(422);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `php artisan test --compact --filter=StockCountSerialTest`
Expected: the new tests FAIL — `missing_serials` is ignored, serials never change status, Manual isn't blocked.

- [ ] **Step 3: Accept + normalise `missing_serials` in the controller**

In `app/Http/Controllers/Api/StockCountController.php`, replace the `commit` method with:

```php
    public function commit(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gate($request);
        $data = $request->validate([
            'mode' => ['nullable', 'in:auto,manual'],
            'missing_serials' => ['array'],
            'missing_serials.*' => ['array'],
            'missing_serials.*.*' => ['integer'],
        ]);
        $mode = StockCountAdjustMode::from($data['mode'] ?? 'auto');

        // keys arrive as strings (stock-item ids) from JSON; cast to int.
        $missing = [];
        foreach ($data['missing_serials'] ?? [] as $itemId => $ids) {
            $missing[(int) $itemId] = array_map('intval', $ids);
        }

        $count = $this->service->commit($stockCount, $request->user(), $mode, $missing);

        return (new StockCountResource($count->load(['countedBy', 'lines.item'])))
            ->additional(['message' => 'success'])->response();
    }
```

- [ ] **Step 4: Add serial handling to the service**

In `app/Services/StockCountService.php`, add the import near the other `use App\Models\...` lines:

```php
use App\Models\StockItemSerial;
```

Replace the entire `commit` method with:

```php
    /**
     * Commit a draft. In Auto mode, every counted line whose count differs from system
     * stock records an adjust movement, sets current_stock to the counted value, and
     * reconciles FIFO lots. Serialized lines additionally mark the supplied missing
     * serials as 'adjusted'. In Manual mode the session is closed as a report only —
     * stock is untouched — and serialized counts are rejected.
     *
     * @param  array<int, array<int>>  $missingSerials  stock-item id => serial ids ticked as not found
     */
    public function commit(StockCount $count, User $user, StockCountAdjustMode $mode = StockCountAdjustMode::Auto, array $missingSerials = []): StockCount
    {
        abort_unless($count->status === StockCountStatus::Draft, 422, 'Count is already closed.');

        $lines = $count->lines()->with('item')->get();

        // Manual is report-only; it can't reconcile the per-unit serials a serialized count needs.
        if ($mode === StockCountAdjustMode::Manual && $lines->contains(fn ($l) => (bool) $l->item?->track_serial)) {
            abort(422, 'Serialized counts must be committed with Auto.');
        }

        DB::transaction(function () use ($count, $user, $mode, $lines, $missingSerials) {
            if ($mode === StockCountAdjustMode::Auto) {
                foreach ($lines as $line) {
                    $variance = $line->variance();
                    if ($variance === null || $variance === 0 || $line->item === null) {
                        continue;
                    }

                    if ($line->item->track_serial) {
                        $this->reconcileSerials($line->item, $variance, $missingSerials[$line->stock_item_id] ?? [], $count->reference);
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

                    // Realign FIFO lots with the counted quantity.
                    $this->lotService->reconcile($line->item, $line->counted_qty);
                }
            }

            $count->update([
                'status' => StockCountStatus::Committed,
                'committed_at' => now(),
                'adjust_mode' => $mode,
            ]);
        });

        AuditLog::record(
            'Committed stock count',
            $count->reference.($mode === StockCountAdjustMode::Manual ? ' (manual — report only)' : ' (auto — stock adjusted)')
        );

        return $count->fresh('lines');
    }

    /**
     * Mark the ticked-missing serials of a serialized line as 'adjusted'. Only shortages
     * are supported: exactly |variance| in-stock serials belonging to the item must be
     * supplied; a positive variance (counted exceeds recorded serials) is rejected.
     *
     * @param  array<int>  $serialIds
     */
    private function reconcileSerials(StockItem $item, int $variance, array $serialIds, string $reference): void
    {
        abort_if($variance > 0, 422, "Counted exceeds recorded serials for {$item->sku}.");

        $need = abs($variance);
        $ids = array_values(array_unique(array_map('intval', $serialIds)));

        $serials = StockItemSerial::where('stock_item_id', $item->id)
            ->where('status', 'in_stock')
            ->whereIn('id', $ids)
            ->get();

        abort_if(
            count($ids) !== $need || $serials->count() !== $need,
            422,
            "Select exactly {$need} missing serial(s) for {$item->sku}."
        );

        StockItemSerial::whereIn('id', $serials->pluck('id'))
            ->update(['status' => 'adjusted', 'reference' => $reference]);
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `php artisan test --compact --filter=StockCountSerialTest`
Expected: all PASS (6 passed).

- [ ] **Step 6: Run the existing count suite (no regressions)**

Run: `php artisan test --compact --filter=StockCountTest`
Expected: PASS (10 passed) — non-serialized commits behave exactly as before.

- [ ] **Step 7: Format + commit**

```
vendor/bin/pint --dirty --format agent
```
```
git add app/Services/StockCountService.php app/Http/Controllers/Api/StockCountController.php tests/Feature/StockCountSerialTest.php
git commit -m "feat(stock): Auto commit reconciles missing serials; Manual blocked for serialized"
```

---

## Task 3: Frontend types, API, hook

**Files:**
- Modify: `resources/js/types/index.ts`
- Modify: `resources/js/services/stockApi.ts`
- Modify: `resources/js/hooks/use-stock.ts`

- [ ] **Step 1: Extend the line type**

In `resources/js/types/index.ts`, replace the `StockCountLine` interface:

```ts
export interface StockCountLine {
    id: number;
    stock_item_id: number;
    sku: string | null;
    name: string | null;
    system_qty: number;
    counted_qty: number | null;
    variance: number | null;
    track_serial: boolean;
    serials?: { id: number; serial: string }[];
}
```

- [ ] **Step 2: Pass `missing_serials` from the API call**

In `resources/js/services/stockApi.ts`, replace the `commit` line in `stockCountApi`:

```ts
    commit: (id: number, mode: StockCountAdjustMode = 'auto', missingSerials?: Record<number, number[]>) =>
        mutate<StockCount>('post', `/stock-counts/${id}/commit`, { mode, missing_serials: missingSerials ?? {} }),
```

- [ ] **Step 3: Thread `missingSerials` through the mutation hook**

In `resources/js/hooks/use-stock.ts`, replace the `commit` mutation line:

```ts
        commit: useMutation({
            mutationFn: (v: { id: number; mode: StockCountAdjustMode; missingSerials?: Record<number, number[]> }) =>
                stockCountApi.commit(v.id, v.mode, v.missingSerials),
            onSuccess: inv,
        }),
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0 (callers passing `{ id, mode }` still type-check; `missingSerials` is optional).

- [ ] **Step 5: Commit**

```
git add resources/js/types/index.ts resources/js/services/stockApi.ts resources/js/hooks/use-stock.ts
git commit -m "feat(stock-ui): types/api/hook for missing-serial commit"
```

---

## Task 4: i18n keys

**Files:**
- Modify: `resources/js/lib/i18n.ts`

- [ ] **Step 1: Add English keys**

In `resources/js/lib/i18n.ts`, after the English `stock_count_commit_confirm` line, add:

```ts
    stock_count_serial_only_auto: 'Serialized — Auto only',
    stock_count_serial_verify_title: 'Verify serials',
    stock_count_serial_verify_hint: 'Tick the serials that are NOT physically present.',
    stock_count_serial_tick_n: 'Tick {n} not found',
```

- [ ] **Step 2: Add Thai keys**

In `resources/js/lib/i18n.ts`, after the Thai `stock_count_commit_confirm` line, add:

```ts
    stock_count_serial_only_auto: 'มี serial — ใช้ Auto เท่านั้น',
    stock_count_serial_verify_title: 'ตรวจสอบ serial',
    stock_count_serial_verify_hint: 'ติ๊ก serial ที่ไม่มีอยู่จริง (หาย)',
    stock_count_serial_tick_n: 'ติ๊กที่หาย {n} ตัว',
```

- [ ] **Step 3: Typecheck (key-shape parity)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0 (en/th key sets stay matched).

- [ ] **Step 4: Commit**

```
git add resources/js/lib/i18n.ts
git commit -m "feat(stock-ui): i18n for serial verification"
```

---

## Task 5: Disable Manual for serialized sessions

**Files:**
- Modify: `resources/js/pages/stock/index.tsx`

- [ ] **Step 1: Compute `hasSerial` and force Auto**

In `AuditTab`, just after the `countSummary` block (right before `// Columns mirror...`), add:

```tsx
    // A session with any serialized line must commit with Auto (Manual can't reconcile serials).
    const hasSerial = (session?.lines ?? []).some((l) => l.track_serial);
    useEffect(() => {
        if (hasSerial) setMode('auto');
    }, [hasSerial]);
```

- [ ] **Step 2: Disable the Manual option in the selector**

In the commit-mode selector, replace the `.map` callback that renders the two mode buttons:

```tsx
                                            {(['auto', 'manual'] as const).map((m) => {
                                                const active = mode === m;
                                                const Icon = m === 'auto' ? Zap : FileText;
                                                return (
                                                    <button
                                                        key={m}
                                                        type="button"
                                                        onClick={() => setMode(m)}
                                                        aria-pressed={active}
                                                        className={cn(
                                                            'flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition',
                                                            active
                                                                ? m === 'manual'
                                                                    ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-400'
                                                                    : 'border-primary bg-primary/10 text-primary'
                                                                : 'border-border text-muted-foreground hover:bg-muted/50',
                                                        )}
                                                    >
                                                        <Icon className="h-4 w-4" />
                                                        {t(m === 'auto' ? 'stock_count_mode_auto_name' : 'stock_count_mode_manual_name')}
                                                    </button>
                                                );
                                            })}
```

with (adds the `disabled` branch for Manual when `hasSerial`):

```tsx
                                            {(['auto', 'manual'] as const).map((m) => {
                                                const active = mode === m;
                                                const disabled = m === 'manual' && hasSerial;
                                                const Icon = m === 'auto' ? Zap : FileText;
                                                return (
                                                    <button
                                                        key={m}
                                                        type="button"
                                                        disabled={disabled}
                                                        onClick={() => !disabled && setMode(m)}
                                                        aria-pressed={active}
                                                        className={cn(
                                                            'flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition',
                                                            disabled
                                                                ? 'border-border text-muted-foreground/40 cursor-not-allowed'
                                                                : active
                                                                  ? m === 'manual'
                                                                      ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-400'
                                                                      : 'border-primary bg-primary/10 text-primary'
                                                                  : 'border-border text-muted-foreground hover:bg-muted/50',
                                                        )}
                                                    >
                                                        <Icon className="h-4 w-4" />
                                                        {t(m === 'auto' ? 'stock_count_mode_auto_name' : 'stock_count_mode_manual_name')}
                                                    </button>
                                                );
                                            })}
```

- [ ] **Step 3: Show the Auto-only note**

Immediately after the closing `</div>` of the two-button grid (before the hint line that shows `stock_count_mode_auto_hint`/`_manual_warn`), add:

```tsx
                                        {hasSerial && (
                                            <div className="text-muted-foreground text-[11px]">{t('stock_count_serial_only_auto')}</div>
                                        )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0.

- [ ] **Step 5: Commit**

```
git add resources/js/pages/stock/index.tsx
git commit -m "feat(stock-ui): force Auto for serialized count sessions"
```

---

## Task 6: Serial verification dialog + commit wiring

**Files:**
- Modify: `resources/js/pages/stock/index.tsx`

- [ ] **Step 1: Add serial-check state**

In `AuditTab`, just after the `committedFlash` state line, add:

```tsx
    // Serial verification (Auto): items short on serialized stock that need their missing units ticked.
    type SerialCheckItem = { stock_item_id: number; sku: string | null; name: string | null; need: number; serials: { id: number; serial: string }[] };
    const [serialCheck, setSerialCheck] = useState<SerialCheckItem[] | null>(null);
    const [missingByItem, setMissingByItem] = useState<Record<number, number[]>>({});

    const toggleSerial = (itemId: number, serialId: number) =>
        setMissingByItem((prev) => {
            const cur = prev[itemId] ?? [];
            return { ...prev, [itemId]: cur.includes(serialId) ? cur.filter((x) => x !== serialId) : [...cur, serialId] };
        });

    const serialCheckOk = (serialCheck ?? []).every((it) => (missingByItem[it.stock_item_id] ?? []).length === it.need);
```

- [ ] **Step 2: Extract a `runCommit` helper and gate it through serial verification**

Replace the Commit `<Button ... onClick={async () => { ... }}>` handler (the one that runs the Swal confirm then save/commit) with the version below. This keeps the confirm, then either commits directly or opens the serial dialog:

```tsx
                                        <Button
                                            disabled={!anyCounted || savingDraft || committing || committedFlash}
                                            onClick={async () => {
                                                // Confirm once more — message reflects the chosen mode's effect on stock.
                                                const res = await Swal.fire({
                                                    title: t('stock_count_commit_confirm'),
                                                    text: `${session.reference} — ${mode === 'manual' ? t('stock_count_mode_manual_warn') : t('stock_count_mode_auto_hint')}`,
                                                    icon: mode === 'manual' ? 'warning' : 'question',
                                                    showCancelButton: true,
                                                    confirmButtonText: t('stock_count_commit'),
                                                    cancelButtonText: t('stock_count_back'),
                                                    confirmButtonColor: mode === 'manual' ? '#d97706' : '#16a34a',
                                                    cancelButtonColor: '#6b7280',
                                                    reverseButtons: true,
                                                    customClass: {
                                                        popup: '!rounded-xl !shadow-xl',
                                                        confirmButton: '!rounded-lg !font-medium',
                                                        cancelButton: '!rounded-lg !font-medium',
                                                    },
                                                    // Re-enable pointer events blocked by the parent Radix dialog.
                                                    didOpen: () => {
                                                        const container = Swal.getContainer();
                                                        if (container) {
                                                            container.style.pointerEvents = 'auto';
                                                        }
                                                    },
                                                });
                                                if (!res.isConfirmed) {
                                                    return;
                                                }

                                                // Serialized lines that came up short must have their missing units ticked first.
                                                const shorts: SerialCheckItem[] = (session.lines ?? [])
                                                    .filter((l) => l.track_serial)
                                                    .map((l) => {
                                                        const entered = entries[l.id] ?? '';
                                                        const variance = entered.trim() === '' ? 0 : (parseInt(entered, 10) || 0) - l.system_qty;
                                                        return { l, variance };
                                                    })
                                                    .filter((x) => x.variance < 0)
                                                    .map((x) => ({
                                                        stock_item_id: x.l.stock_item_id,
                                                        sku: x.l.sku,
                                                        name: x.l.name,
                                                        need: -x.variance,
                                                        serials: x.l.serials ?? [],
                                                    }));

                                                if (shorts.length === 0) {
                                                    await runCommit({});
                                                    return;
                                                }
                                                setMissingByItem({});
                                                setSerialCheck(shorts);
                                            }}
                                        >
                                            {committing ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : committedFlash ? (
                                                <Check className="h-3.5 w-3.5" />
                                            ) : null}
                                            {committedFlash ? t('stock_count_committed') : t('stock_count_commit')}
                                        </Button>
```

Then add the `runCommit` helper next to `toggleSerial` (Step 1 block):

```tsx
    const runCommit = async (missing: Record<number, number[]>) => {
        if (!session) return;
        setCommitting(true);
        try {
            await save.mutateAsync({ id: session.id, counts: countsPayload() });
            await commit.mutateAsync({ id: session.id, mode, missingSerials: missing });
            setCommittedFlash(true);
            window.setTimeout(() => setCommittedFlash(false), 1200);
        } catch (e) {
            onError(e);
        } finally {
            setCommitting(false);
            setSerialCheck(null);
        }
    };
```

- [ ] **Step 3: Render the serial verification dialog**

Immediately after the count-sheet `</Dialog>` (the one opened by `selectedId`), add a sibling dialog:

```tsx
            {/* Serial verification — tick the not-found units before an Auto commit adjusts stock. */}
            <Dialog open={serialCheck !== null} onOpenChange={(o) => !o && setSerialCheck(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t('stock_count_serial_verify_title')}</DialogTitle>
                    </DialogHeader>
                    <div className="text-muted-foreground text-xs">{t('stock_count_serial_verify_hint')}</div>
                    <div className="max-h-[60vh] space-y-3 overflow-auto">
                        {(serialCheck ?? []).map((it) => {
                            const ticked = missingByItem[it.stock_item_id] ?? [];
                            const ok = ticked.length === it.need;
                            return (
                                <div key={it.stock_item_id} className="border-border rounded-lg border p-3">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-mono text-xs font-medium">{it.sku}</div>
                                            <div className="text-muted-foreground truncate text-xs">{it.name}</div>
                                        </div>
                                        <span className={cn('shrink-0 text-[11px] font-semibold', ok ? 'text-emerald-600' : 'text-amber-600')}>
                                            {t('stock_count_serial_tick_n').replace('{n}', String(it.need))} ({ticked.length}/{it.need})
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {it.serials.map((s) => {
                                            const checked = ticked.includes(s.id);
                                            return (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => toggleSerial(it.stock_item_id, s.id)}
                                                    className={cn(
                                                        'flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition',
                                                        checked
                                                            ? 'border-destructive bg-red-50 dark:bg-red-950/20'
                                                            : 'border-border hover:bg-muted/40',
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                                            checked ? 'bg-destructive border-destructive text-white' : 'border-input',
                                                        )}
                                                    >
                                                        {checked && <Check className="h-3 w-3" />}
                                                    </span>
                                                    <span className="font-mono">{s.serial}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSerialCheck(null)}>
                            {t('stock_count_back')}
                        </Button>
                        <Button disabled={!serialCheckOk || committing} onClick={() => runCommit(missingByItem)}>
                            {committing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            {t('stock_count_commit')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0.

- [ ] **Step 5: Commit**

```
git add resources/js/pages/stock/index.tsx
git commit -m "feat(stock-ui): serial verification dialog on Auto commit"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0.

- [ ] **Step 2: Lint the changed file**

Run: `npx eslint resources/js/pages/stock/index.tsx resources/js/lib/i18n.ts resources/js/types/index.ts resources/js/services/stockApi.ts resources/js/hooks/use-stock.ts`
Expected: 0 errors (pre-existing exhaustive-deps warnings on unrelated hooks are acceptable).

- [ ] **Step 3: Run both count test files**

Run: `php artisan test --compact --filter=StockCount`
Expected: all PASS (StockCountTest 10 + StockCountSerialTest 6 = 16).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual smoke (ask the user to run the app)**

Create a count for a serialized item → enter a count short by N → Commit (Auto, Manual is disabled) → confirm → serial dialog lists in-stock serials → tick N → Commit. Verify: those serials become `adjusted`, current_stock drops, an `adjust_down` movement appears. Re-open: the count shows committed.

---

## Self-Review Notes

- **Spec coverage:** show payload `track_serial`+`serials` (Task 1); commit `missing_serials` validation + service reconcile + Manual block + positive-variance block (Task 2); types/api/hook (Task 3); i18n (Task 4); Manual disabled for serialized (Task 5); serial-verify dialog (Task 6); all six test scenarios (Task 2) + non-serial regression (Task 2 Step 6). All spec sections mapped.
- **Out of scope** honoured: no add-unknown-serials, no scanner, no Manual serial path.
- **Type/signature consistency:** service `commit($count, $user, $mode, $missingSerials = [])` matches controller call; `stockCountApi.commit(id, mode, missingSerials)` matches hook `{ id, mode, missingSerials }` and both call sites (`runCommit({})` and `runCommit(missingByItem)`); `missing_serials` request key ↔ `$data['missing_serials']`; `StockCountLine.serials` `{id, serial}` ↔ resource emit ↔ `SerialCheckItem.serials`.
```
