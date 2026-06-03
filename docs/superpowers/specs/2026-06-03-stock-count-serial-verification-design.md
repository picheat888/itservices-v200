# Stock Count — Serial Verification on Auto Commit

**Date:** 2026-06-03
**Module:** Stock Management → Counting (Audit) tab
**Status:** Approved design — pending implementation plan
**Builds on:** `2026-06-03-stock-count-adjust-mode-design.md` (Auto/Manual adjust mode)

## Problem

The stock-count flow is purely quantity-based. For serialized items (`stock_items.track_serial = true`),
committing an adjustment changes `current_stock` and reconciles FIFO lots but **never touches the
per-unit serial records** (`stock_item_serials`). So after a count, the serial list can drift from the
counted quantity — e.g. system holds 10 `in_stock` serials, you count 8, commit sets `current_stock = 8`,
but all 10 serials remain `in_stock`.

For serialized items we want the commit to also reconcile *which* specific units are missing.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Where does serial verification happen? | A **separate step at Auto commit** (not inline in the draft sheet). |
| Draft sheet for serial items | Keep the **quantity input** for all items; the serial step at commit must reconcile to the variance. |
| Status of "missing" (ticked-out) serials | `'adjusted'`. |
| Manual mode + serialized items | **Not supported** — if a session contains any serialized item, Manual is disabled; it must be committed with Auto. |
| Positive variance (counted > system) on a serialized item | **Blocked (422)** — cannot have more serials than recorded. |
| Source of in-stock serials for the step | Returned by the count `show` endpoint (one request when the sheet opens). |

## Architecture

### 1. Data model

- **No migration.** `stock_item_serials.status` is a free-form string; this feature introduces the
  used value `'adjusted'` for units found missing during a count.
- Serials marked `'adjusted'` also get `reference` set to the count reference (e.g. `SC-2026-001`)
  for traceability.

### 2. Count `show` payload

`StockCountController::show` eager-loads in-stock serials for serialized lines:

```php
$stockCount->load(['countedBy', 'lines.item.serials' => fn ($q) => $q->where('status', 'in_stock')]);
```

`StockCountResource` — each line gains:

- `track_serial` (bool) — from `item.track_serial`.
- `serials` — for serialized lines only, the in-stock units: `[{ id, serial }]`. Omitted/empty for
  non-serialized lines.

### 3. Commit API

`POST /api/stock-counts/{id}/commit`

- Body: `{ mode: 'auto' | 'manual', missing_serials?: { [stockItemId: number]: number[] } }`
  - `missing_serials` maps a stock-item id to the serial-record ids ticked as **not found**.
  - Only meaningful for `mode = auto`.
- Validation (controller + service):
  1. If the count has any serialized line **and** `mode = manual` → **422** "Serialized counts must use Auto."
  2. For each serialized line with `variance < 0` (shortage): `missing_serials[itemId]` must contain
     exactly `|variance|` ids; every id must be `in_stock` and belong to that item → else **422**.
  3. Serialized line with `variance > 0` → **422** "Counted exceeds recorded serials."
  4. Serialized line with `variance = 0` → no serials required.

### 4. Commit service behaviour (Auto)

`StockCountService::commit($count, $user, $mode, $missingSerials = [])`:

- For each line with a non-zero, non-null variance (existing logic), **plus** for serialized lines:
  - Mark the supplied serial ids `status = 'adjusted'`, `reference = $count->reference`.
  - Then run the existing quantity adjust: record the `adjust_down` movement, set
    `current_stock = counted_qty`, reconcile FIFO lots.
- Non-serialized lines: unchanged.
- Manual mode: unchanged (report only) — and is rejected upstream if serialized lines exist.

### 5. Frontend (`resources/js/`)

- **Types:** `StockCountLine` gains `track_serial: boolean` and `serials?: { id: number; serial: string }[]`.
- **Mode selector:** when the open session has any `track_serial` line, disable the **Manual** option
  (force Auto) with a short note ("Serialized — Auto only").
- **Commit flow (Auto):** after the existing confirm dialog, if any serialized line has a shortage,
  open a **Serial verification dialog**:
  - One section per serialized item with a shortage; lists its in-stock serials as checkboxes.
  - Section header shows the required count: "tick N not-found" where `N = |variance|`.
  - Confirm is enabled only when every section has exactly `N` ticked.
  - On confirm, commit with `missing_serials = { [itemId]: tickedSerialIds }`.
- **i18n:** th/en keys for the verification dialog, the Auto-only note, and validation messages.

## Testing

PHPUnit feature tests (`tests/Feature/StockCountTest.php` or a focused `StockCountSerialTest.php`):

1. **Manual blocked for serialized session:** a count containing a serialized item committed with
   `mode = manual` → 422; nothing changes.
2. **Auto reconciles serials:** count a serialized item short by 2, commit Auto with 2 valid missing
   serial ids → those 2 serials become `adjusted` (reference set), `current_stock` reduced by 2,
   an `adjust_down` movement exists, the other serials stay `in_stock`.
3. **Wrong missing count → 422:** supplying ≠ `|variance|` ids.
4. **Invalid serial → 422:** an id that is `issued`, missing, or belongs to another item.
5. **Positive variance on serialized item → 422.**
6. **Non-serialized items still commit normally** (regression of existing behaviour).

## Out of scope (YAGNI)

- Adding new/unknown serials (positive variance) during a count.
- Barcode/scanner input — verification is manual checkbox ticking only.
- Serial verification under Manual mode (Manual is blocked for serialized sessions).

## Affected files

- `app/Http/Controllers/Api/StockCountController.php`
- `app/Http/Resources/StockCountResource.php`
- `app/Services/StockCountService.php`
- `resources/js/types/index.ts`
- `resources/js/services/stockApi.ts`
- `resources/js/hooks/use-stock.ts`
- `resources/js/pages/stock/index.tsx`
- `resources/js/lib/i18n.ts`
- `tests/Feature/StockCountSerialTest.php` (new) and/or `tests/Feature/StockCountTest.php`
