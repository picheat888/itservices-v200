# Stock Return (คืนเข้าคลัง) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing `return` movement type fully handle serialized items — bring previously-issued serials back into stock at their original cost — while keeping qty-only returns working at average cost.

**Architecture:** Extend `StockMovementController` (validation + the inbound branch of `record()`) and add a `returnSerials()` helper that flips `issued` serials to `in_stock`, reopens FIFO lots at each unit's original receive cost, and logs a `returned` event. Extend `MovementDrawer` so a serialized return shows a checkbox pick-list of issued serials (mirroring the existing transfer pick-list) instead of a quantity box.

**Tech Stack:** Laravel 12 (PHPUnit feature tests), React 19 + TypeScript, existing `StockLotService`/`StockBalanceService`.

---

## File Structure

- Modify: `app/Http/Controllers/Api/StockMovementController.php`
  - `store()` — call a new `validateReturnSerials()`
  - new private `validateReturnSerials()` — reject bad serial selections (422)
  - `record()` — qty `match` gains a serialized-return arm; inbound branch routes serialized returns to a new helper
  - new private `returnSerials()` — flip serials, reopen lots at original cost, log `returned`
- Create: `tests/Feature/StockReturnTest.php` — happy path, validation, qty-only, permission
- Modify: `resources/js/components/stock/movement-drawer.tsx` — serialized-return pick list + submit branch
- Modify: `resources/js/lib/i18n.ts` — new keys for the return pick list (EN + TH)

No migration is needed: `stock_item_serial_events.event` is a free string, and `SerialEvent['event']` in `resources/js/types/index.ts` already includes `'returned'`.

---

## Task 1: Backend — serialized return brings issued serials back at original cost

**Files:**
- Test: `tests/Feature/StockReturnTest.php` (create)
- Modify: `app/Http/Controllers/Api/StockMovementController.php`

- [ ] **Step 1: Write the failing happy-path test**

Create `tests/Feature/StockReturnTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\StockItem;
use App\Models\StockItemSerial;
use App\Models\StockLot;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockReturnTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** Serialized item received (with cost), then one unit issued via a request. */
    private function serializedWithOneIssued(): StockItem
    {
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'UPS-1', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        // Receive 2 serials at unit cost 250 (into "Main").
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id,
            'serials' => ['SN-A', 'SN-B'], 'to_label' => 'Main', 'unit_cost' => 250,
        ])->assertCreated();

        // Issue SN-A out via an approved request.
        $req = \App\Models\StockRequest::create([
            'stock_item_id' => $item->id, 'requester_name' => 'Wichai', 'qty' => 1, 'reason' => 'use', 'status' => 'approved',
        ]);
        $snA = StockItemSerial::where('serial', 'SN-A')->value('id');
        $this->postJson("/api/stock-requests/{$req->id}/fulfill", ['serial_ids' => [$snA]])->assertOk();

        return $item->fresh();
    }

    public function test_serialized_return_brings_issued_serial_back_in_stock(): void
    {
        $this->actingAs($this->super());
        $item = $this->serializedWithOneIssued();
        $snA = StockItemSerial::where('serial', 'SN-A')->value('id');

        // current_stock is 1 (SN-B in stock, SN-A issued).
        $this->assertSame(1, $item->current_stock);

        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id,
            'from_label' => 'Wichai', 'to_label' => 'Main', 'serial_ids' => [$snA],
        ])->assertCreated();

        // SN-A is back in stock, in "Main".
        $this->assertDatabaseHas('stock_item_serials', ['id' => $snA, 'status' => 'in_stock', 'warehouse' => 'Main']);
        // On-hand incremented back to 2.
        $this->assertSame(2, $item->fresh()->current_stock);
        // A 'returned' event linked to the return movement exists.
        $returnId = StockMovement::where('type', 'return')->value('id');
        $this->assertDatabaseHas('stock_item_serial_events', [
            'event' => 'returned', 'stock_movement_id' => $returnId, 'stock_item_serial_id' => $snA,
        ]);
        // A FIFO lot was reopened at the original receive cost (250), not 0.
        $this->assertTrue(
            StockLot::where('stock_item_id', $item->id)->where('stock_movement_id', $returnId)->where('unit_cost', 250)->exists()
        );
    }
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `php artisan test --compact --filter=test_serialized_return_brings_issued_serial_back_in_stock`
Expected: FAIL — SN-A stays `issued` (serialized return not handled), no `returned` event, no cost-250 lot tied to the return.

- [ ] **Step 3: Add the qty arm for serialized returns in `record()`**

In `app/Http/Controllers/Api/StockMovementController.php`, the `$qty = match (true) { ... }` block, add the return arm:

```php
            $qty = match (true) {
                $serials !== [] => count($serials),
                $isTransfer && $item->track_serial => count($serialIds),
                $type === 'return' && $item->track_serial && $serialIds !== [] => count($serialIds),
                default => (int) ($data['qty'] ?? 0),
            };
```

- [ ] **Step 4: Route serialized returns to a helper in the inbound branch**

Replace the inbound branch inside `record()`:

```php
                if ($inbound) {
                    // Resolve the destination warehouse once; default to 'Unassigned'
                    // (never '') when the caller didn't pick one, so balances and serials agree.
                    $inboundWarehouse = $toWh ?: 'Unassigned';
                    $this->balances->add($item, $inboundWarehouse, $qty);
                    $this->lotService->addLot($item, $qty, $unitCost, $movement->id, $movement->moved_at);
                } else {
```

with:

```php
                if ($inbound) {
                    // Resolve the destination warehouse once; default to 'Unassigned'
                    // (never '') when the caller didn't pick one, so balances and serials agree.
                    $inboundWarehouse = $toWh ?: 'Unassigned';
                    $this->balances->add($item, $inboundWarehouse, $qty);

                    if ($type === 'return' && $item->track_serial && $serialIds !== []) {
                        $this->returnSerials($item, $serialIds, $inboundWarehouse, $movement, $recordedBy, $userId, $fromWh);
                    } else {
                        $this->lotService->addLot($item, $qty, $unitCost, $movement->id, $movement->moved_at);
                    }
                } else {
```

- [ ] **Step 5: Add the `returnSerials()` helper**

Add this private method to `StockMovementController` (e.g. directly after `record()`):

```php
    /**
     * Bring previously-issued serials back into stock: flip them to in_stock in the
     * destination warehouse, reopen FIFO lots at each unit's original receive cost
     * (null cost falls back to average cost inside addLot), and log a 'returned' event
     * per serial linked to the return movement.
     *
     * @param  array<int>  $serialIds
     */
    private function returnSerials(StockItem $item, array $serialIds, string $warehouse, StockMovement $movement, ?string $recordedBy, ?int $userId, ?string $fromLabel): void
    {
        $serials = StockItemSerial::with('movement')
            ->whereIn('id', $serialIds)
            ->where('stock_item_id', $item->id)
            ->where('status', 'issued')
            ->get();

        StockItemSerial::whereIn('id', $serials->pluck('id'))->update([
            'status' => 'in_stock',
            'warehouse' => $warehouse,
        ]);

        // Reopen one FIFO lot per distinct original receive cost. The serial's
        // stock_movement_id still points at its receive movement (transfers never change it).
        $serials->groupBy(fn (StockItemSerial $s) => $s->movement?->unit_cost)
            ->each(function ($group) use ($item, $movement) {
                $cost = $group->first()->movement?->unit_cost;
                $this->lotService->addLot($item, $group->count(), $cost !== null ? (float) $cost : null, $movement->id, $movement->moved_at);
            });

        foreach ($serials as $row) {
            StockItemSerialEvent::log($row, 'returned', [
                'stock_movement_id' => $movement->id,
                'reference' => $movement->reference,
                'warehouse' => $warehouse,
                'from_label' => $fromLabel,
                'user_id' => $userId,
                'recorded_by' => $recordedBy,
                'occurred_at' => $movement->moved_at,
            ]);
        }
    }
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `php artisan test --compact --filter=test_serialized_return_brings_issued_serial_back_in_stock`
Expected: PASS.

- [ ] **Step 7: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/StockMovementController.php tests/Feature/StockReturnTest.php
git commit -m "feat(stock): serialized return restores issued serials at original cost"
```

---

## Task 2: Backend — reject invalid serialized returns; require permission

**Files:**
- Modify: `app/Http/Controllers/Api/StockMovementController.php` (`store()` + new `validateReturnSerials()`)
- Test: `tests/Feature/StockReturnTest.php`

- [ ] **Step 1: Write failing validation + permission tests**

Append to `tests/Feature/StockReturnTest.php`:

```php
    public function test_return_rejects_a_serial_that_is_not_issued(): void
    {
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'UPS-2', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        // SN-X is received and still in_stock (never issued) → cannot be "returned".
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-X'], 'to_label' => 'Main',
        ])->assertCreated();
        $snX = StockItemSerial::where('serial', 'SN-X')->value('id');

        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'to_label' => 'Main', 'serial_ids' => [$snX],
        ])->assertStatus(422)->assertJsonValidationErrors('serial_ids');
    }

    public function test_return_requires_stock_return_permission(): void
    {
        $item = $this->serializedWithOneIssued(); // set up as super inside helper
        $snA = StockItemSerial::where('serial', 'SN-A')->value('id');

        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'to_label' => 'Main', 'serial_ids' => [$snA],
        ])->assertForbidden();
    }
```

- [ ] **Step 2: Run them to confirm the validation test fails**

Run: `php artisan test --compact --filter=StockReturnTest`
Expected: `test_return_rejects_a_serial_that_is_not_issued` FAILS (a non-issued serial is currently accepted, returning 201). The permission test already passes (the permission gate exists).

- [ ] **Step 3: Add `validateReturnSerials()` and call it in `store()`**

In `store()`, right after `$serials = $this->validateSerials($data, $item);`, add:

```php
        $this->validateReturnSerials($data, $item);
```

Add the method:

```php
    /**
     * For a serialized return, every chosen serial must belong to the item and be
     * currently issued (you can only return what is out). No-op otherwise.
     *
     * @param  array<string, mixed>  $data
     */
    private function validateReturnSerials(array $data, StockItem $item): void
    {
        if ($data['type'] !== 'return' || ! $item->track_serial) {
            return;
        }

        $ids = array_values(array_unique(array_map('intval', $data['serial_ids'] ?? [])));
        if ($ids === []) {
            throw ValidationException::withMessages([
                'serial_ids' => 'This item is serialized — select the issued serial(s) to return.',
            ]);
        }

        $issued = StockItemSerial::whereIn('id', $ids)
            ->where('stock_item_id', $item->id)
            ->where('status', 'issued')
            ->count();

        if ($issued !== count($ids)) {
            throw ValidationException::withMessages([
                'serial_ids' => 'Each selected serial must belong to this item and be currently issued.',
            ]);
        }
    }
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `php artisan test --compact --filter=StockReturnTest`
Expected: PASS (all three so far).

- [ ] **Step 5: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/StockMovementController.php tests/Feature/StockReturnTest.php
git commit -m "feat(stock): validate that returned serials are issued and belong to the item"
```

---

## Task 3: Backend — qty-only return values at average cost (regression lock)

**Files:**
- Test: `tests/Feature/StockReturnTest.php`

- [ ] **Step 1: Write the qty-only return test**

Append to `tests/Feature/StockReturnTest.php`:

```php
    public function test_qty_only_return_adds_stock_at_average_cost(): void
    {
        $this->actingAs($this->super());
        $item = StockItem::create([
            'sku' => 'CBL-1', 'name' => 'Cable', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => false,
        ]);
        // Receive 10 @ 30 → avg cost 30.
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 10, 'unit_cost' => 30, 'to_label' => 'Main',
        ])->assertCreated();

        // Return 2 back into stock (qty-only).
        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'qty' => 2, 'to_label' => 'Main', 'from_label' => 'Somchai',
        ])->assertCreated();

        $this->assertSame(12, $item->fresh()->current_stock);
        // The return opened a lot at the average cost (30), not 0.
        $returnId = \App\Models\StockMovement::where('type', 'return')->value('id');
        $this->assertTrue(
            \App\Models\StockLot::where('stock_item_id', $item->id)->where('stock_movement_id', $returnId)->where('unit_cost', 30)->exists()
        );
    }
```

- [ ] **Step 2: Run it**

Run: `php artisan test --compact --filter=test_qty_only_return_adds_stock_at_average_cost`
Expected: PASS immediately (existing `addLot(..., null, ...)` already falls back to `avgCost()`). If it fails, do NOT change behaviour — investigate whether `avgCost()` returns the expected value first.

- [ ] **Step 3: Commit**

```bash
git add tests/Feature/StockReturnTest.php
git commit -m "test(stock): lock qty-only return valuing at average cost"
```

---

## Task 4: Frontend — serialized return pick list in MovementDrawer

**Files:**
- Modify: `resources/js/components/stock/movement-drawer.tsx`
- Modify: `resources/js/lib/i18n.ts`

This component has no automated test runner in this project; verify with the TypeScript diagnostics and a manual run. The backend tests above cover the API contract.

- [ ] **Step 1: Add i18n keys (EN + TH)**

In `resources/js/lib/i18n.ts`, in the English block near the other `stock_` keys (e.g. after `stock_captured_serials`), add:

```ts
    stock_return_pick: 'Select serials to return',
    stock_return_none: 'No issued serials to return',
    stock_return_select_all: 'Select all',
    stock_return_select_none: 'Clear all',
```

In the Thai block at the matching location, add:

```ts
    stock_return_pick: 'เลือก Serial ที่จะคืน',
    stock_return_none: 'ไม่มี Serial ที่จ่ายออกให้คืน',
    stock_return_select_all: 'เลือกทั้งหมด',
    stock_return_select_none: 'ยกเลิกทั้งหมด',
```

- [ ] **Step 2: Add return state + derived values**

In `movement-drawer.tsx`, after the transfer state declaration:

```tsx
    // Transfer-specific state: selected serial ids (for serialized SKUs).
    const [transferSerialIds, setTransferSerialIds] = useState<Set<number>>(new Set());
```

add:

```tsx
    // Return-specific state: selected issued-serial ids (for serialized SKUs).
    const [returnSerialIds, setReturnSerialIds] = useState<Set<number>>(new Set());
```

After the transfer detail fetch (`const { data: transferItemDetail } = useStockItem(transferItemId);`), add:

```tsx
    const isReturn = kind === 'return';
    const returnIsSerial = isReturn && !!selected?.track_serial;
    // Item detail (serials) for a serialized return — to list the units currently issued.
    const returnItemId = returnIsSerial && sku ? Number(sku) : null;
    const { data: returnItemDetail } = useStockItem(returnItemId);
    const availableReturnSerials = useMemo(
        () => (returnItemDetail?.serials ?? []).filter((s) => s.status === 'issued'),
        [returnItemDetail],
    );
```

- [ ] **Step 3: Reset return selection on (re)open and SKU change**

In the reset `useEffect` (the block that runs when the drawer opens), next to `setTransferSerialIds(new Set());`, add:

```tsx
        setReturnSerialIds(new Set());
```

In `onSkuChange`, next to `setTransferSerialIds(new Set());`, add:

```tsx
        setReturnSerialIds(new Set());
```

- [ ] **Step 4: Extend validation + action label**

Replace the `canSubmit` line:

```tsx
    const canSubmit = isTransfer ? canSubmitTransfer : !!selected && (isSerial ? serialValid : qty >= 1);
```

with:

```tsx
    const returnSerialValid = returnIsSerial && returnSerialIds.size > 0 && !!to;
    const canSubmit = isTransfer
        ? canSubmitTransfer
        : returnIsSerial
          ? returnSerialValid
          : !!selected && (isSerial ? serialValid : qty >= 1);
```

In the `actionLabel` IIFE, before the final `return kind ? ...` line, add:

```tsx
        if (returnIsSerial) {
            return returnSerialIds.size > 0 ? `${t('stock_mv_return')} (${returnSerialIds.size})` : t('stock_mv_return');
        }
```

- [ ] **Step 5: Add the submit branch for serialized return**

In `submit()`, immediately after the `if (isTransfer) { ... return; }` block, add:

```tsx
        // Serialized return: send the chosen issued serials (qty derived from them).
        if (returnIsSerial) {
            try {
                await record.mutateAsync({
                    type: 'return',
                    stock_item_id: selected.id,
                    qty: returnSerialIds.size,
                    from_label: from.trim() || undefined,
                    to_label: to.trim() || undefined,
                    reference: reference.trim() || undefined,
                    notes: notes.trim() || undefined,
                    serial_ids: [...returnSerialIds],
                });
                setTimeout(onClose, CLOSE_DELAY_MS);
            } catch (e) {
                const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                Swal.fire({ icon: 'error', title: 'Error', text: msg ?? 'Something went wrong.' });
            }
            return;
        }
```

- [ ] **Step 6: Hide the qty box and add the pick list for serialized return**

Find the quantity-only capture block:

```tsx
                    {/* Quantity-only capture — receive/return/issue only */}
                    {selected && !isSerial && !isTransfer && (
```

change its condition to also exclude a serialized return:

```tsx
                    {/* Quantity-only capture — receive/return/issue only */}
                    {selected && !isSerial && !isTransfer && !returnIsSerial && (
```

Then, immediately after that quantity-only `<Field>...</Field>` block closes, add the pick list:

```tsx
                    {/* Serialized return — pick the issued serials coming back into stock */}
                    {returnIsSerial && selected && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{t('stock_return_pick')}</span>
                                {availableReturnSerials.length > 0 && (
                                    <button
                                        type="button"
                                        className="text-brand hover:text-brand/80 text-xs font-medium transition-colors"
                                        onClick={() => {
                                            if (returnSerialIds.size === availableReturnSerials.length) {
                                                setReturnSerialIds(new Set());
                                            } else {
                                                setReturnSerialIds(new Set(availableReturnSerials.map((s) => s.id)));
                                            }
                                        }}
                                    >
                                        {returnSerialIds.size === availableReturnSerials.length ? t('stock_return_select_none') : t('stock_return_select_all')}
                                    </button>
                                )}
                            </div>

                            {availableReturnSerials.length > 0 ? (
                                <div className="max-h-52 space-y-1 overflow-y-auto">
                                    {availableReturnSerials.map((s) => {
                                        const checked = returnSerialIds.has(s.id);
                                        return (
                                            <label
                                                key={s.id}
                                                className={cn(
                                                    'flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
                                                    checked ? 'border-brand/40 bg-brand/5' : 'border-border hover:bg-muted/50',
                                                )}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="accent-brand h-4 w-4 shrink-0 rounded"
                                                    checked={checked}
                                                    onChange={() => {
                                                        setReturnSerialIds((prev) => {
                                                            const next = new Set(prev);
                                                            if (next.has(s.id)) {
                                                                next.delete(s.id);
                                                            } else {
                                                                next.add(s.id);
                                                            }
                                                            return next;
                                                        });
                                                    }}
                                                />
                                                <span className="font-mono text-sm">{s.serial}</span>
                                                {checked && <Check className="text-brand ml-auto h-3.5 w-3.5" />}
                                            </label>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-muted-foreground rounded-md border border-dashed py-5 text-center text-xs">
                                    {t('stock_return_none')}
                                </div>
                            )}
                        </div>
                    )}
```

(`Check` and `cn` are already imported in this file.)

- [ ] **Step 7: Verify types compile**

Run: `npx tsc --noEmit` (or check editor diagnostics for `movement-drawer.tsx` and `i18n.ts`).
Expected: no errors.

- [ ] **Step 8: Manual verification**

Run the app (`npm run dev` if not running). Stock → "Return" action:
- Pick a serialized SKU that has issued units → the issued serials appear as a checkbox list (no quantity box); pick a destination warehouse (To); submit. The serials return to `in_stock` and appear in the SKU's stock; the Movement Events detail for the return lists them.
- Pick a qty-only SKU → the quantity box still shows and works.

- [ ] **Step 9: Commit**

```bash
git add resources/js/components/stock/movement-drawer.tsx resources/js/lib/i18n.ts
git commit -m "feat(stock): serialized return picker in the movement drawer"
```

---

## Final verification

- [ ] Run the stock suite: `php artisan test --compact --filter=Stock`
- [ ] Expected: all green, including the new `StockReturnTest`.

---

## Self-Review notes (author)

- **Spec coverage:** serialized return flip + original-cost lots + `returned` event (Task 1); validation that serials are issued/belong + permission (Task 2); qty-only avg-cost (Task 3); frontend pick list + qty-only fallback (Task 4). All spec sections covered.
- **No `text-overflow`/migration needed:** `returned` is a free-string event; `SerialEvent['event']` already includes `'returned'`.
- **Type consistency:** helper named `returnSerials()` and `validateReturnSerials()` used consistently; frontend state `returnSerialIds` / `availableReturnSerials` / `returnIsSerial` used consistently across steps.
