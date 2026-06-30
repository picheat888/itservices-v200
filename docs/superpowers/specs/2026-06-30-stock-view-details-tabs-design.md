# Stock Item View Details — Tabbed Redesign — Design

**Date:** 2026-06-30
**Module:** Stock Management (Module 6)
**Status:** Approved design (via interactive mockup) — pending implementation plan
**Mockup:** `docs/mockup/stock-view-tabs-mockup.html`
**Pattern source:** the Contract tabbed View Details (`2026-06-30-contract-view-details-tabs-design.md`) — same focus-dialog + tabs + fillHeight DataTable approach.

## Problem / Goal

`StockItemDetailModal` (`resources/js/components/stock/stock-item-detail-modal.tsx`) is a 768px (`max-w-3xl`) single long scroll: header + KPI strip + meta + per-warehouse balances + FIFO-lots table + serials table, with a "History" button that opens a separate full page in a new tab. Reframe it as a **1100px tabbed focus dialog** matching the Contract View, splitting concerns into tabs and surfacing key signals in the header.

## Design

### Shell & header

- Centered `Dialog` at **`max-w-[1100px]`**, fixed height `h-[min(860px,calc(100vh-72px))]`, flex column (header / tabs / body / footer) — same shape as the Contract View.
- Keep the existing always-mounted open pattern (`open={itemId !== null}`) so the close animation plays. **Retain the last loaded item** in state so the body renders real content during the fade-out instead of flashing the loading skeleton.
- **Header:** box/cube icon tile + eyebrow "Stock Item" + item name + mono SKU chip + a **serialized / qty-only pill** next to the SKU chip + the **status badge** (ok/low/out/over/dead) pinned top-right next to the ✕. (Built inline in this modal — `ContractDialogHeader` is contract-specific; do not reuse it here.)

### Tabs

Custom tab bar (same visual pattern as the Contracts page / Contract View): `Overview · Movements · Lots · Serials`.
- Counts: Lots and Serials counts come from the loaded `item` (lots with `qty_remaining > 0`; serials excluding `issued`). Movements count comes from the history fetch once loaded (chip hidden until then). Count chip hidden when 0.
- Opens on **Overview** each time (reset on item change); transient (no persistence).
- Only the active panel renders. Overview/Lots/Serials scroll; Movements uses fill mode (paginates, no inner scroll).

### Tab: Overview

From `useStockItem(itemId)` (already returns the enriched item):
- **KPI strip** (3 cells): Current stock (+ unit, and `reserved`/free sub-line when present), Total value, Average cost.
- **Meta grid:** category, brand/model, unit, min/max, warranty, last-move date, serial-tracking, status.
- **Per-warehouse balance cards** (from `item.balances`, qty > 0).

### Tab: Movements

- Data source: **`useStockItemHistory(itemId)`** → `.movements[]` (already used by the item-history page; shape: `{ id, doc_no, type, qty, unit_cost, from_label, to_label, reference, recorded_by, notes, moved_at }`). Enabled while the dialog is open.
- Render with the shared `DataTable` in **`fillHeight`** mode (rows fill the panel, Prev/Next pagination, no rows-per-page picker, no inner scroll).
- Columns: **Date** (`moved_at`) · **Doc No** (`doc_no`) · **Type** (badge, localized) · **Qty** (signed/colored: receive/return/adjust_up = green `+`, issue/adjust_down = red `−`, transfer = neutral) · **From → To** (`from_label → to_label`) · **By** (`recorded_by`).
- Empty state when no movements. A loading state while history fetches.

### Tab: Lots

- From `item.lots` filtered to `qty_remaining > 0`. Table columns: Receive doc · Date · Unit cost · Remaining (`qty_remaining/qty_received`) · Value.
- **Preserve the existing expandable-row behavior:** clicking a lot row drills into its receive details (reference / warehouse / supplier / recorded-by / received-at / qty + notes). One row expanded at a time.
- Empty state when no lots.

### Tab: Serials

- Only meaningful when `item.track_serial`. From `item.serials` excluding `issued`. Columns: # · Serial · Status (badge) · Warehouse · Received-at.
- When not serialized: show the existing "not serialized" note (the tab can still exist but render that note), OR hide the Serials tab entirely. **Decision: hide the Serials tab when `!track_serial`** (cleaner — qty-only items have no serials by definition).
- Empty state when serialized but no serials on hand.

### Footer

- **Full history** link (left) — opens `/stock/items/{id}/history` in a new tab (preserves the current "History" affordance).
- **Edit** button (right) — shown only when an `onEdit` callback is provided. Clicking calls `onEdit(item)`; the page closes the detail and opens the existing `StockItemModal` edit form.
- Smaller buttons (~34px), matching the Contract View footer.

## Component / File Plan

- `resources/js/components/stock/stock-item-detail-modal.tsx` — rewrite: 1100px tabbed shell + inline header + Overview + Lots + Serials panels (Lots keeps its expandable rows + Pager; Serials keeps its Pager) + footer; add optional `onEdit?: (item: StockItem) => void` prop; retain-last-item for close animation.
- `resources/js/components/stock/stock-movements-tab.tsx` — new: fetches `useStockItemHistory(itemId)`, renders the movements `DataTable` in fillHeight mode with localized type badges and signed qty.
- `resources/js/pages/stock/index.tsx` — pass `onEdit` to `StockItemDetailModal`, gated by `canManage` (`stock.manage_items` / super): `onEdit={canManage ? (i) => { setViewId(null); setEditItem(i); } : undefined}`.

## Out of Scope

- No backend / API / DB changes (`useStockItem`, `useStockItemHistory`, `stockMovementApi` all already exist).
- The standalone `/stock/items/{id}/history` page stays as-is (linked from the footer for the full ledger).
- No change to the add/edit `StockItemModal` itself.
- `DataTable` is unchanged (the `fillHeight` prop already exists from the Contract feature).

## Testing

- **Frontend (no test runner):** `npx tsc --noEmit` clean for touched files, plus manual checks:
  - Header: status badge top-right by ✕; serialized/qty-only pill next to SKU; 1100px dialog; close fades out (no skeleton flash).
  - Tabs: open on Overview; Lots/Serials counts correct; Movements count appears after history loads; Serials tab hidden for qty-only items.
  - Overview: KPI strip + meta + warehouse cards render from the item.
  - Movements: table fills the panel and pages with Prev/Next (no inner scroll, no picker); qty colored by direction; resize recomputes rows; empty + loading states.
  - Lots: expandable rows still work (one at a time); empty state.
  - Serials: table + statuses; empty state when serialized-but-none.
  - Footer: full-history link opens the page in a new tab; Edit shows only with `canManage`, closes the detail and opens the edit form.
- **DataTable fillHeight regression:** already covered by the Contract feature; no further change here.
- **Backend:** none.
