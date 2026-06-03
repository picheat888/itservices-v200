# Stock Count — Auto/Manual Adjust Mode

**Date:** 2026-06-03
**Module:** Stock Management → Counting (Audit) tab
**Status:** Approved design — pending implementation plan

## Problem

When a stock count is committed, the system **always** adjusts stock immediately:
it records `adjust_up`/`adjust_down` movements, overwrites each item's `current_stock`
with the counted value, and reconciles FIFO lots (`StockCountService::commit()`).

Operations want a choice at commit time:

- **Auto** — current behaviour: commit adjusts stock immediately.
- **Manual** — commit produces a **report only**: it records the counted quantities and
  variances and closes the session, but does **not** touch stock. Warehouse staff apply
  any corrections themselves through the normal Movement screen.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| What does Manual do? | Report only — no movements, no `current_stock` change, no lot reconcile. |
| Where is the mode chosen? | At commit time, inside the commit confirmation dialog. |
| Approach | A — segmented toggle in the dialog + persist the chosen mode on the count. |
| Default mode | **Auto** (preserves existing behaviour; safest backward-compatible default). |

## Architecture

### 1. Data model

- **Migration:** add `adjust_mode` to `stock_counts` — nullable string.
  - `null` while the count is `draft`.
  - Set to `'auto'` or `'manual'` at commit.
- **Enum:** `App\Enums\StockCountAdjustMode` (mirrors `StockCountStatus`):
  ```php
  enum StockCountAdjustMode: string
  {
      case Auto = 'auto';
      case Manual = 'manual';
  }
  ```
- **Model:** `StockCount` — add `adjust_mode` to `$fillable` and cast to the enum in `casts()`.

### 2. Backend service

`StockCountService::commit(StockCount $count, User $user, StockCountAdjustMode $mode): StockCount`

- Guard unchanged: `abort_unless($count->status === StockCountStatus::Draft, 422, ...)`.
- **Auto** (`StockCountAdjustMode::Auto`): unchanged logic — for each line with a non-zero,
  non-null variance, record the movement, overwrite `current_stock`, reconcile FIFO lots.
- **Manual** (`StockCountAdjustMode::Manual`): skip the per-line loop entirely. No movements,
  no `current_stock` change, no lot reconcile.
- Both modes: set `status = Committed`, `committed_at = now()`, and persist `adjust_mode`.
- `AuditLog`: record the mode, e.g. `"Committed stock count (manual — report only)"` vs
  `"Committed stock count (auto — stock adjusted)"`.

### 3. API

- **Endpoint:** `POST /api/stock-counts/{id}/commit`
  - Body: `{ "mode": "auto" | "manual" }`
  - Validation: `mode` → `['nullable', 'in:auto,manual']`; missing/empty defaults to `'auto'`.
  - Controller resolves the string to `StockCountAdjustMode` and passes the enum to the service.
- **Resource:** `StockCountResource` exposes `'adjust_mode' => $this->adjust_mode?->value`.

### 4. Frontend (`resources/js/`)

- **Types** (`types/index.ts`): `StockCount.adjust_mode: 'auto' | 'manual' | null`.
- **API** (`services/stockApi.ts`): `commit(id, mode)` → posts `{ mode }`.
- **Hook** (`hooks/use-stock.ts`): `commit` mutation takes `{ id, mode }`.
- **Commit dialog** (`pages/stock/index.tsx`, AuditTab):
  - A commit confirmation step with a **segmented toggle**:
    - *Auto — ปรับสต็อกทันที* (adjust stock now)
    - *Manual — บันทึกเป็นรายงาน ไม่แตะสต็อก* (record as report, stock untouched)
    - Short description under each; default **Auto**.
  - On confirm: `await save.mutateAsync(...)` then `await commit.mutateAsync({ id, mode })`
    (preserves the save-before-commit fix already in place).
  - UI polish handled with the **frontend-design** skill during implementation.
- **Session list:** committed rows show a badge indicating the mode used
  (Auto = "ปรับสต็อก", Manual = "รายงาน").
- **i18n** (`lib/i18n.ts`): add th/en keys for mode labels, descriptions, and badges.

## Testing

New / updated PHPUnit feature tests in `tests/Feature/StockCountTest.php`:

1. **Manual commit is report-only:** commit with `mode=manual` →
   `status=committed`, `adjust_mode=manual`, **zero** `stock_movements`,
   `current_stock` unchanged, FIFO lots unchanged.
2. **Auto commit adjusts (with mode persisted):** commit with `mode=auto` →
   existing adjust behaviour + `adjust_mode=auto`.
3. **Default is auto:** commit with no `mode` in the body → behaves as auto
   (keeps existing tests green).
4. Existing commit tests updated to assert `adjust_mode` where relevant.

## Out of scope (YAGNI)

- No per-line apply / approval workflow for Manual counts (Manual is purely a report;
  staff use the existing Movement screen).
- No global default-mode setting in Settings (mode is chosen per commit).
- No re-open / re-commit of a committed count.

## Affected files

- `database/migrations/<new>_add_adjust_mode_to_stock_counts.php`
- `app/Enums/StockCountAdjustMode.php` (new)
- `app/Models/StockCount.php`
- `app/Services/StockCountService.php`
- `app/Http/Controllers/Api/StockCountController.php`
- `app/Http/Resources/StockCountResource.php`
- `resources/js/types/index.ts`
- `resources/js/services/stockApi.ts`
- `resources/js/hooks/use-stock.ts`
- `resources/js/pages/stock/index.tsx`
- `resources/js/lib/i18n.ts`
- `tests/Feature/StockCountTest.php`
