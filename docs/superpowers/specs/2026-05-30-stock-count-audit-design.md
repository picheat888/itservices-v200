# Design: Stock Count / Audit

**Date:** 2026-05-30
**Status:** Approved (session-based, commit-direct, ledger approach A)

## Goal

Replace the placeholder "Stock count" tab in the Stock module with a real
physical-count workflow: open a count session, record counted quantities per
item, see the variance against system stock, and commit adjustments that reconcile
on-hand stock through the movement ledger.

## Decisions (from brainstorming)

- **Session-based** (not per-item ad-hoc).
- **Commit direct** — a user with `stock.audit` commits adjustments immediately;
  no separate approval step (the catalog has only `stock.audit`). Every adjustment
  is recorded in the movement ledger + audit log.
- **Ledger approach A** — represent each variance as a real `StockMovement` of a
  new type (`adjust_up` / `adjust_down`), so it flows through the existing
  `record()` (locks the row, applies the signed delta, stamps `last_move_at`).
- **Uncounted = no change** — only lines with a counted quantity entered are
  adjusted; items left blank are untouched (no accidental zeroing).
- **Out of scope (YAGNI):** approval workflow, recurring counts, barcode scanning,
  export.

## Data model

`stock_counts`
- `id`, `reference` (auto `SC-####`, unique)
- `warehouse` (nullable string) — filter the session was opened for
- `category` (nullable string) — filter the session was opened for
- `status` — `draft` | `committed` | `canceled` (StockCountStatus enum)
- `note` (nullable)
- `counted_by` → `users.id` (nullOnDelete)
- `committed_at` (nullable timestamp)
- timestamps

`stock_count_lines`
- `id`, `stock_count_id` → `stock_counts.id` (cascadeOnDelete)
- `stock_item_id` → `stock_items.id` (cascadeOnDelete)
- `system_qty` (int) — snapshot of `current_stock` when the session was opened
- `counted_qty` (nullable int) — entered during counting
- timestamps
- `variance` is derived: `counted_qty - system_qty` (null until counted)

## Backend

- **Enum** `App\Enums\StockCountStatus` (draft/committed/canceled).
- **`StockMovement`** — add `adjust_up` to `INBOUND`; add `adjust_down` (outbound).
  `delta()` already handles the sign from `INBOUND` membership.
- **Models** `StockCount` (hasMany lines, belongsTo countedBy; auto `SC-####` in
  `booted`), `StockCountLine` (belongsTo count + item).
- **`StockCountService`**
  - `open(array $filters, User $user): StockCount` — create a draft and snapshot a
    line (`system_qty = current_stock`) for every `StockItem` matching the optional
    `warehouse` / `category` filter.
  - `saveCounts(StockCount $count, array $countedByLineId): StockCount` — set
    `counted_qty` on lines; allowed only while `draft`.
  - `commit(StockCount $count): StockCount` — in a transaction, for each line with
    `counted_qty !== null` and `counted_qty !== system_qty`, post a movement
    (`adjust_up` when counted > system, else `adjust_down`) of `abs(variance)` via
    the existing `StockMovementController::record()`/service path, referencing the
    count `reference`; then set `status = committed`, `committed_at = now()`.
    Re-commit is rejected (status guard).
  - `cancel(StockCount $count): StockCount` — draft → canceled.
- **`StockCountController`** — `index` (list sessions, newest first), `store`
  (open), `show` (session + lines), `update` (save counts), `commit`, `destroy`
  (cancel). All gated by `stock.audit` (super bypasses). `commit`/`update` also
  guard `status === draft`.
- **Resources** `StockCountResource` (+ embedded lines with `variance`).
- **Routes** under the stock block in `routes/api.php`:
  `apiResource('stock-counts')` (+ `stock-counts/{stockCount}/commit`).

The adjustment movement reuses the same `record()` used by manual movements, so the
"Not enough stock" guard and `current_stock` update are shared (an `adjust_down`
can never exceed `system_qty`, so it always passes that guard).

## Frontend

- Replace the placeholder body of the **audit** tab in `resources/js/pages/stock/index.tsx`.
- **Session list**: reference, warehouse, status badge, counted/variance summary, date.
- **New count drawer**: optional warehouse + category select → opens a session.
- **Count sheet** (drawer or panel): table of lines (sku, name, system qty,
  counted input, variance badge), **Save draft** and **Commit** actions; commit
  disabled unless at least one line is counted.
- `stockApi` + `use-stock` additions; gate the whole tab + actions on `stock.audit`.
- i18n EN/TH for the new strings.

## Testing

- `open` snapshots a line per matching item with `system_qty = current_stock`.
- `saveCounts` stores counted quantities on a draft.
- `commit` posts `adjust_up`/`adjust_down` movements, sets each item's
  `current_stock` to its counted value, records variance, and flips status to
  committed; a committed session cannot be re-committed.
- RBAC: a user without `stock.audit` is forbidden from open/save/commit.

## Out of scope

Approval workflow, recurring/scheduled counts, barcode scanning, CSV export,
multi-counter blind counts.
