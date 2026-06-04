# Stock Return (คืนเข้าคลัง) — Design

**Date:** 2026-06-04
**Module:** Stock Management
**Status:** Approved (pending implementation)

## Purpose

Complete the **Return** movement type as the reverse of an issue: items that were
issued out come back **into** stock. The movement type already exists (`return`,
permission `stock.return`, treated as inbound), but two gaps remain:

1. **Serialized returns are not handled** — `validateSerials()` only runs for
   `receive`, and the inbound serial path only *creates new* serials (for receive).
   Returning a serialized SKU currently bumps quantity only and never flips the
   returned serials back to `in_stock`.
2. **Cost** — qty-only returns already fall back to the item's average cost inside
   `StockLotService::addLot()` (continuous valuation, acceptable). Serialized returns
   should restore each unit's **original receive cost** so FIFO reverses cleanly.

## Scope

**In scope**
- Standalone returns (not linked to a prior issue/request).
- Serialized return: pick from serials currently `issued`, flip to `in_stock` in a
  chosen destination warehouse, restore original cost, log a `returned` serial event.
- Qty-only return: quantity + destination warehouse (existing behaviour, confirmed).

**Out of scope (YAGNI)**
- Linking a return to a specific request/issue document.
- A dedicated "Return history" sub-view on the SKU history page. Returns already
  appear in the Movement Events tab and in each serial's event timeline.
- RMA / return-to-supplier (outbound). This design is return-**into**-stock only.

## Behaviour

### Conceptual model
- **Return = reverse of issue.** From = free text (who returned it). To = warehouse.
- Serialized: you can only return serials that are currently `issued`.
- Qty-only: no cap (the system does not track who holds quantity-only stock).

## Backend

### Validation — `StockMovementController::store()`
Extend the validated rules / serial validation so that for `type === 'return'`:
- **Serialized item:** `serial_ids` is required; every id must belong to the item and
  have `status === 'issued'`. Reject otherwise (422). Quantity is derived from
  `count(serial_ids)`.
- **Qty-only item:** `qty` required (unchanged).

Add a return-aware serial validation path (alongside the existing receive-only
`validateSerials()`), returning the loaded issued-serial models for `record()` to use.

### `StockMovementController::record()`
`return` is already in `StockMovement::INBOUND`, so `current_stock += qty` and the
destination balance add already happen. Add a **serialized-return branch** (inbound,
non-transfer, `type === 'return'`, item is serialized, `serial_ids` present):

1. Load the chosen serials (status `issued`, belong to item).
2. Update them: `status = 'in_stock'`, `warehouse = <destination To warehouse>`.
3. `balances->add(item, destinationWarehouse, qty)` (destination defaults to
   `'Unassigned'` when none chosen, consistent with receive).
4. **Cost restoration:** group the returned serials by their original receive cost
   (`serial.movement->unit_cost`, where `serial.stock_movement_id` still points at the
   receive movement). For each cost group, `lotService->addLot(item, countInGroup,
   groupCost, returnMovementId, movedAt)`. A `null` group cost falls back to `avgCost()`
   inside `addLot()` automatically.
5. Log a `returned` `StockItemSerialEvent` per serial with
   `stock_movement_id = <return movement id>`, `from_label` (who returned),
   `warehouse`/`to_label` = destination, `occurred_at = movement.moved_at`. This mirrors
   how `received`/`transferred`/`issued` events link, so the Movement detail dialog's
   Serial List (and the Print labels button) work for returns too.

Quantity derivation (`record()`): extend the `match` so a serialized return uses
`count(serial_ids)` (same shape as serialized transfer).

Qty-only return: unchanged — one `addLot(item, qty, null, …)` → average cost.

### Notes
- A serial's `stock_movement_id` is set on receive and is **not** changed by transfers
  (transfers only update `warehouse` and log an event), so it reliably points at the
  original receive movement → original cost is recoverable.
- The `stock_item_serial_events.event` column is a free string (no enum/DB constraint),
  so `returned` needs no migration.

## Frontend — `MovementDrawer` (return mode)

- **Serialized return:** show a checkbox **pick list of the SKU's `issued` serials**
  (reuse the transfer serial-pick-list pattern), plus a destination warehouse select.
  Submit `serial_ids`. Source data: fetch the item detail (already available via
  `useStockItem`) and filter `serials` to `status === 'issued'`.
- **Qty-only return:** quantity input + destination warehouse (existing).
- **From** stays a free-text field (who returned it).
- Reuse existing summary/validation affordances from the transfer pick list
  (selected count, "select all", empty state).

## Types / i18n
- Add `'returned'` to the `SerialEvent['event']` union in `resources/js/types`.
- Reuse existing stock i18n keys; add any new return-specific labels as needed
  (e.g. a "select serials to return" heading) following existing key conventions.

## Tests (PHPUnit feature)
1. **Serialized return** flips chosen `issued` serials → `in_stock`, sets their
   warehouse, increments `current_stock` and the destination balance, opens lot(s) at
   the original receive cost, and logs a `returned` event linked to the return movement.
2. **Qty-only return** increments stock at the item's average cost (one lot).
3. **Validation:** returning a serial that is not `issued` (e.g. already `in_stock`) is
   rejected (422); returning a serial from another SKU is rejected.
4. **Permission:** `stock.return` is required (403 without it).

## Acceptance criteria
- Returning issued serialized units puts them back as `in_stock` in the chosen
  warehouse, visible in stock and in the serial's event timeline as `returned`.
- Stock valuation after a serialized return reflects the original receive cost of the
  returned units (FIFO lot reopened at that cost).
- Qty-only returns continue to work and value at average cost.
- The Movement Events detail dialog lists the returned serials (and can print labels).
