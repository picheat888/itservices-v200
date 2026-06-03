# Stock Item — SKU History Page

**Date:** 2026-06-03
**Module:** Stock Management → Stock item → View detail
**Status:** Approved design — pending implementation plan

## Problem

The stock-item detail modal shows current lots and serials but no history. Users want a full
audit trail for a SKU: every receive (per lot, with which serials, by whom), every issue (by
whom), and any adjustments — plus each serial's own journey (received → transferred → issued /
adjusted, with who and when).

The movement log already records batch-level events. The gap: serials are not linked to the
movement that issued or adjusted them, so a per-serial timeline can't be built today.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| History structure | A unified **movement timeline** plus a **per-serial timeline**. |
| Serial-journey depth | Track the full journey via a new **events table** (not exit columns). |
| Page presentation | **Standalone full page** (no sidebar), opened in a **new browser tab**, print-friendly. |
| Events captured | receive, issue, adjust, **transfer** (warehouse move). Returns only if the return flow handles serials individually (qty-only returns log nothing). |
| Backfill | All existing serials get a `received` event; non-`in_stock` serials get a best-effort exit event (`occurred_at = updated_at`, movement link may be null for legacy rows). |

## Architecture

### 1. Data model — serial events

New table `stock_item_serial_events`:

| Column | Notes |
|--------|-------|
| `id` | PK |
| `stock_item_serial_id` | FK → `stock_item_serials`, cascade on delete |
| `stock_item_id` | FK → `stock_items` (denormalised for fast per-SKU queries) |
| `event` | string: `received` \| `issued` \| `adjusted` \| `transferred` \| `returned` |
| `stock_movement_id` | nullable FK → `stock_movements` (the movement that caused it) |
| `reference` | nullable string (doc reference, e.g. `SC-2026-001`, `REQ-2026-0007`) |
| `warehouse` | nullable string |
| `from_label` / `to_label` | nullable strings (for transfers) |
| `user_id` | nullable FK → `users` |
| `recorded_by` | nullable string (name snapshot) |
| `occurred_at` | timestamp |
| timestamps | `created_at`, `updated_at` |

- Model `StockItemSerialEvent` (fillable for the above; `occurred_at` cast to datetime).
- `StockItemSerial::events(): HasMany` ordered by `occurred_at`.
- A small helper `StockItemSerialEvent::log(StockItemSerial $serial, string $event, array $attrs)`
  to keep write sites tidy.

**Write points:**

- **Receive** (`StockMovementController` serialized-receive branch, where each `StockItemSerial`
  is created): log `received` with the receive movement, warehouse, user/recorded_by.
- **Transfer** (`StockMovementController` serialized-transfer branch, where serials change
  warehouse): log `transferred` with the transfer movement, `from_label`/`to_label`.
- **Issue** (`StockSerialService::issue`): accept the issuing `StockMovement` and, for each serial
  marked `issued`, log `issued` with that movement + reference + user/recorded_by. (The fulfill
  flow must create the issue movement first, then call `issue()` with it.)
- **Adjust** (`StockCountService::reconcileSerials`): for each serial marked `adjusted`, log
  `adjusted` with the count's `adjust_down` movement and the count reference.

**Backfill migration** (after creating the table): for every existing serial, insert a `received`
event from its `received_at` / `stock_movement_id` / `warehouse`; for serials whose status is not
`in_stock`, insert one best-effort event named after the status (`issued`/`adjusted`) with
`occurred_at = updated_at`, `reference` from the serial, and a null movement link when unknown.

### 2. Backend — history endpoint

`GET /api/stock-items/{id}/history` — gated by `stock.view` (same as the item endpoints).

Returns a single structured payload:

- `item`: `{ id, sku, name, current_stock, track_serial }`
- `movements`: every movement for the item, newest-first —
  `{ id, doc_no, type, qty, unit_cost, from_label, to_label, reference, recorded_by, notes, moved_at }`
- `lots`: per receive lot — `{ unit_cost, qty_received, qty_remaining, received_at, doc_no, serials: [code] }`
  (lot ↔ receive movement via `stock_lots.stock_movement_id`; serials via `serials.stock_movement_id`)
- `serials`: each — `{ serial, status, warehouse, events: [{ event, occurred_at, doc_no, reference, recorded_by, from_label, to_label }] }`

Implemented as `StockItemController@history` returning a plain structured array (or a dedicated
`StockItemHistoryResource`). Eager-loads movements, lots (+ their serials), and serials (+ events).

### 3. Frontend — standalone history page

- **Route:** add `/stock/items/:id/history` in `app.tsx` **outside `AppShell`** but still inside
  `ProtectedRoute` (full-width, no sidebar/topbar; auth via the existing Sanctum cookie).
- **Entry:** a **History** button in `stock-item-detail-modal` opens the route in a new tab:
  `window.open('/stock/items/' + item.id + '/history', '_blank')`.
- **Page** (`resources/js/pages/stock/item-history.tsx`):
  - Header: SKU (mono), name, on-hand, serialized badge, a Print button (`window.print()`).
  - **Movement timeline:** chronological (newest-first) list. Each entry: a type icon + color
    (receive = green in, issue = red out, adjust = amber, transfer = blue, return = slate), date,
    signed qty, `from → to`, recorded_by, `doc_no` / reference, notes. Receive entries also show
    the lot (unit_cost, qty) and its serial chips.
  - **Serial detail:** a list of serials (filtered to exclude none — history shows all statuses).
    Each serial row expands to its own event timeline (received → transferred → issued / adjusted),
    each event showing when, doc_no/reference, by whom, and warehouse / from→to.
- **Data:** `stockItemApi.history(id)` + a `useStockItemHistory(id)` hook + TS types.

## Testing

PHPUnit feature tests:

1. **Receive logs a `received` event** per serial with the movement + warehouse.
2. **Issue logs an `issued` event** per serial linked to the issue movement (via the fulfill flow).
3. **Adjust (count) logs an `adjusted` event** per missing serial linked to the count's movement.
4. **History endpoint** returns `movements`, `lots`, and `serials` with their event timelines for a
   SKU that has been received then partially issued.
5. **Permission:** a user without `stock.view` is forbidden from the history endpoint.
6. Existing issue/fulfill and stock-count serial tests still pass (events added, behaviour intact).

## Out of scope (YAGNI)

- Editing or deleting history.
- CSV / PDF export — the page is print-friendly via the browser.
- Serial events for return movements that don't handle serials per unit (qty-only returns).
- Real-time updates — the page reflects data at load time.

## Affected files

- `database/migrations/<new>_create_stock_item_serial_events_table.php` (new)
- `app/Models/StockItemSerialEvent.php` (new), `app/Models/StockItemSerial.php`
- `app/Http/Controllers/Api/StockMovementController.php` (receive + transfer write points)
- `app/Services/StockSerialService.php` (issue signature + event), `app/Http/Controllers/Api/StockRequestController.php` (pass movement to issue)
- `app/Services/StockCountService.php` (`reconcileSerials` event)
- `app/Http/Controllers/Api/StockItemController.php` (+ `history`), `routes/api.php`
- `app/Http/Resources/StockItemHistoryResource.php` (new, optional)
- `resources/js/app.tsx` (route), `resources/js/pages/stock/item-history.tsx` (new)
- `resources/js/components/stock/stock-item-detail-modal.tsx` (History button)
- `resources/js/services/stockApi.ts`, `resources/js/hooks/use-stock.ts`, `resources/js/types/index.ts`, `resources/js/lib/i18n.ts`
- `tests/Feature/StockItemHistoryTest.php` (new)
