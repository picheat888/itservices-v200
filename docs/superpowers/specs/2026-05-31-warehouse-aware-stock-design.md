# Design: Warehouse-aware Stock (per-warehouse balances) + Transfer redesign

**Date:** 2026-05-31
**Status:** Approved (subject to spec review)
**Module:** Stock Management (#6)

## Goal

Make stock genuinely warehouse-aware: track on-hand quantity **per warehouse** (not just
one nominal warehouse per SKU), so a **Transfer** moves stock between warehouses correctly,
issuing/receiving/returning update the right warehouse balance, and the dashboard shows real
per-warehouse figures. Also auto-number every movement and fix a bug where Transfer currently
destroys stock.

## Approved Decisions

1. **Per-warehouse balances** — add a `stock_balances` table (SKU × warehouse × qty). Chosen
   over "whole-SKU relocation" and "hybrid" so partial transfers (5 of 20) are tracked.
2. **One spec** — covers balances + receive/issue/return + Transfer + dashboard + serial +
   auto-number together (not phased).
3. **Auto doc number on ALL movement types** — `RCV/ISS/RET/TRF-yyyy-xxx` in a new `doc_no`
   column. Transfer no longer needs a manual reference; `reference` stays an optional free-text
   field for external refs (e.g. PO on receive).
4. **`current_stock` stays as a cached total** (= SUM of balances), maintained transactionally,
   to avoid rewriting existing readers (FIFO lots, min/max reorder, dashboard KPIs, serial counts).

## Current State (baseline) & the bug

- `stock_items`: single `warehouse` (nominal home) + single `current_stock` integer. **No
  per-warehouse quantity.** (migration `2026_05_27_145800_create_stock_items_table.php`)
- `stock_item_serials`: has `warehouse` + `status` (in_stock|issued|returned|retired); rows
  created only on receive. (migration `2026_05_30_125216`)
- `StockMovement::INBOUND = ['receive','return','adjust_up']`; `delta()` = `+qty` if inbound
  else `-qty`. (`app/Models/StockMovement.php`)
- `StockMovementController::record()` does `current_stock += delta()` then, for non-inbound,
  `lotService->consume()`. (`app/Http/Controllers/Api/StockMovementController.php:137-198`)
- 🔴 **Bug:** `transfer` is not in `INBOUND`, so `delta()` returns `-qty` → a transfer
  **subtracts qty from `current_stock` and consumes FIFO lots**, as if the goods left the
  company. A warehouse-to-warehouse move must be stock- and cost-neutral. It also never updates
  `item.warehouse` or `serial.warehouse`, so the move isn't actually recorded anywhere useful.
- Transfer movement permission is `stock.transfer`; issuing happens via
  `StockRequestController` fulfill (not the movement endpoint). The shared `MovementDrawer`
  (`resources/js/components/stock/movement-drawer.tsx`) handles receive/return/transfer and
  shows a `Reference` field with a misleading `PO-… / REQ-…` placeholder for all kinds.

## Design

### 1. Data model

**New table `stock_balances`** — per-warehouse on-hand:
```
id
stock_item_id  (FK → stock_items, cascade on delete)
warehouse      (string, 120)
qty            (int, default 0)
timestamps
unique(stock_item_id, warehouse)
index(stock_item_id)
```

- `stock_items.current_stock` remains the **authoritative cached total** and must always equal
  `SUM(stock_balances.qty)` for that item. Both are updated inside the same DB transaction.
- `stock_movements`: add `doc_no` (string, 30, **nullable**, unique). Nullable so historical
  movements (pre-migration) stay valid without backfill.
- `stock_item_serials.warehouse` (existing) is the per-unit location. Transfer updates it for
  the moved units.
- **FIFO lots** (`stock_lots`) are SKU-level cost layers, not warehouse-scoped. Transfer leaves
  them untouched.

### 2. Movement engine

Refactor the balance/lot logic out of the fat `record()` into a focused **`StockBalanceService`**
(`app/Services/StockBalanceService.php`) with intent-revealing methods, so `record()` stays
readable and the balance rules are unit-testable in isolation:
- `add(StockItem $item, string $warehouse, int $qty): void` — upsert balance += qty.
- `remove(StockItem $item, string $warehouse, int $qty): void` — balance -= qty; throws a
  `ValidationException` if the warehouse balance would go negative (per-warehouse guard).
- `move(StockItem $item, string $from, string $to, int $qty): void` — remove(from)+add(to) in
  one go; throws if `from === to` or insufficient at `from`.

`record()` applies, by type, inside its existing transaction (after computing `$qty`):

| Type | Balance effect | `current_stock` | FIFO lot |
|------|----------------|-----------------|----------|
| receive | `add(to_warehouse, qty)` | `+qty` | `addLot` (unchanged) |
| return | `add(to_warehouse, qty)` | `+qty` | `addLot` (unchanged) |
| issue | `remove(from_warehouse, qty)` | `-qty` | `consume` (unchanged) |
| transfer | `move(from_warehouse, to_warehouse, qty)` | **unchanged** | **untouched** |
| adjust_up | `add(warehouse, qty)` | `+qty` | `addLot` (unchanged) |
| adjust_down | `remove(warehouse, qty)` | `-qty` | `consume` (unchanged) |

- **Transfer fix:** treat transfer as stock-neutral — `current_stock` not changed and no lot
  add/consume. Implement by special-casing transfer in `record()` (skip the
  `current_stock += delta()` and the lot branch; call `balances->move()` instead). Keep
  `StockMovement::delta()` returning 0 for transfer for any other callers/consistency.
- The **warehouse** each side affects comes from existing movement fields: receive/return →
  `to_label`; issue → `from_label`; transfer → `from_label`/`to_label`. These must be real
  warehouse names (validated against the `warehouses` master-data list).

**Auto `doc_no`:** a small `DocNumber` helper generates `<PREFIX>-<YYYY>-<NNN>` where PREFIX is
`RCV/ISS/RET/TRF` (and `ADJ` for adjustments), `YYYY` from `moved_at`, `NNN` a zero-padded
running counter scoped to (prefix, year). Generated inside the movement transaction using
`lockForUpdate()` on the latest row of that prefix+year to avoid race/duplicates. Applied to all
new movements.

### 3. Transfer dialog (frontend-design at build time)

`MovementDrawer` transfer mode:
- **Remove the Reference/PO field for transfer**; show the auto `doc_no` as "จะออกอัตโนมัติ
  (TRF-…)". (Reference field stays for receive/issue/return; placeholder made context-aware so
  it no longer implies a PO on non-receive kinds.)
- Inputs: SKU → **From warehouse** (source) → **To warehouse** (dest), both backed by
  master-data warehouses.
- **Qty-only SKU:** show "คงเหลือที่คลังต้นทาง" (source balance) and a qty input capped at the
  source balance.
- **Serialized SKU:** list the `in_stock` serials located in the **source** warehouse with
  checkboxes; selected count = qty; on save each selected serial's `warehouse` → destination.
- Guards: `from !== to`; qty ≤ source balance; serialized requires ≥1 selected.

### 4. Adjacent surfaces (per "one spec")

- **Issue (StockRequest fulfill):** add a **source-warehouse** choice for what gets deducted;
  for serialized SKUs the existing serial picker is scoped to that warehouse. Deduct from that
  warehouse's balance.
- **Receive/Return:** destination warehouse via the existing master-data SearchableSelect
  (validate it's a known warehouse).
- **Dashboard "Stock by warehouse":** compute from `stock_balances` instead of grouping items
  by their single `warehouse` field. Expose per-warehouse balances on the stock item resource
  where the detail modal needs them.

### 5. Backfill migration

- For each existing `stock_item`: insert one `stock_balances` row with
  `warehouse = item.warehouse ?? 'Unassigned'`, `qty = current_stock`.
- Existing serials already carry a warehouse — no change.
- Existing `stock_movements` keep `doc_no = null` (only new movements get numbers).
- Live-data safe: additive table + backfill, no destructive change. (Project runs on real data.)

### 6. Testing (PHPUnit)

- Balance maintenance: receive/return add to the destination warehouse; issue removes from the
  source; `SUM(balances) == current_stock` after each.
- **Transfer is stock-neutral**: `current_stock` unchanged, no FIFO lot consumed, `from`
  balance −qty, `to` balance +qty.
- Per-warehouse guard: cannot transfer/issue more than the source-warehouse balance; cannot
  transfer to the same warehouse.
- Serialized transfer: selected serials' `warehouse` updated to destination; counts move
  between warehouse balances.
- `doc_no`: generated, unique, correct prefix per type, running per year.
- Backfill: one balance row per item with the right warehouse + qty.

## Out of Scope

- Min/max reorder remains at the SKU total level (`current_stock`), not per warehouse.
- Costing/FIFO stays SKU-level (transfer doesn't move cost between warehouses).
- Backfilling `doc_no` onto historical movements.

## Risks / Notes

- **Concurrency:** balance upserts and `doc_no` counters must run inside the movement
  transaction with row locking to avoid races/duplicates.
- **Null/legacy warehouse:** items with no `warehouse` land in an "Unassigned" bucket on
  backfill; surface it so admins can transfer out of it.
- **Existing callers of `current_stock`** (reorder, KPIs, serial counts) keep working because it
  stays a maintained cached total.
- `MovementDrawer` is already a large component; transfer's serial-picker reuses the existing
  serial-row UI patterns rather than adding a parallel implementation.
