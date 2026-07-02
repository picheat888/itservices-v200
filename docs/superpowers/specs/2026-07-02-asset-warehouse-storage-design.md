# Asset Warehouse Storage (Ready to Deploy + Warehouse) — Design

**Date:** 2026-07-02
**Module:** Assets Management (Module 4) · touches Stock master data (Warehouses)
**Status:** Approved approach (interactive Q&A) — pending implementation
**Supersedes the concern in:** the deferred "Stock↔Asset bridge" (2026-06-08) — this is a *different, lighter* model: an idle asset stays an asset and simply records **which warehouse it sits in**, rather than being converted into fungible stock.

## Problem / Goal

An asset with no current owner (freshly registered, or received back by IT) needs to be "stored in a warehouse" while it waits to be deployed again. Today the only warehouse-related action is **Asset → Stock** (`convertToStock`), which is the wrong tool: it yields a fungible `StockItem` (quantity-based) and **discards the asset's identity** — serial, warranty, ownership history, per-unit transfer. That path should be reserved for genuine decommission-to-spares.

Instead: keep the asset as an asset in status **`Ready`** ("Ready to deploy") and record a **`warehouse`** on it (the store/branch it is physically kept in). This preserves identity + history and lets IT see "what idle assets are in warehouse X".

Warehouse is modelled the same way the whole Stock module already does it: a **name string** chosen from the `warehouses` master (`GET /warehouses`), **not** a foreign key. (`stock_balances.warehouse`, serials, counts are all `string(120)`.)

## Design

### Data

- New column on `assets`: **`warehouse` `string(120)` nullable** (holds the warehouse *name*, matching Stock's convention). No FK — same as `stock_balances.warehouse`.

### Backend

- `app/Models/Asset/Asset.php` — add `warehouse` to `$fillable`.
- `app/Http/Resources/Asset/AssetResource.php` — add `'warehouse' => $this->warehouse`.
- `app/Http/Requests/Asset/StoreAssetRequest.php` — `warehouse` → `nullable|string|max:120`.
- `app/Http/Controllers/Api/Asset/AssetController.php`:
  - `index()` — add an optional `warehouse` filter: `->when($request->string('warehouse')->toString(), fn ($q, $w) => $q->where('warehouse', $w))`.
  - `markReceived()` — read an optional `warehouse` from the request and pass it to the service.
- `app/Services/Asset/AssetService.php` — `markReceived(Asset $asset, ?string $performedBy = null, ?string $warehouse = null)`: still sets `status = Ready`, `owner = 'Pool — IT'`, and now sets `warehouse` when one is supplied (otherwise keeps the asset's current warehouse). Transfer to a person keeps the asset's `warehouse` as its "home" (unchanged).

### Frontend — form (create/edit)

- `resources/js/modules/asset/components/asset-form-drawer.tsx` — add a **Warehouse** `SearchableSelect` (options from `useWarehouses()` imported from `@/modules/settings` — the same source `stock/movement-drawer` uses; settings does not import asset, so no dependency cycle). Placed next to `location`. `warehouse` is optional. Value = warehouse name.
- `assetApi` `AssetPayload` + `resources/js/shared/types/index.ts` `Asset` — add `warehouse: string | null`.

### Frontend — Mark received flow (warehouse capture)

- New `resources/js/modules/asset/components/asset-receive-modal.tsx`: a small dialog that asks **"Receive to which warehouse?"** with a `SearchableSelect` (default = the asset's current `warehouse`), then confirms. Used by **both** the inventory row's *Mark received* action and the detail dialog's *Mark received* button (both currently call `receive.mutate` directly).
- `assetApi.receive(id, warehouse?)` → `POST /assets/{id}/receive` with body `{ warehouse }`.
- `useAssetMutations().receive` mutation input becomes `{ id: number; warehouse?: string }`.

### Frontend — Inventory tab surfacing

- **Warehouse filter** (Contract-style, matching the filters just added): a labelled `Select` (icon + "คลัง:" / "Warehouse:") whose options come from `useWarehouses()`, plus an "All" option. Wired into the list query (`warehouse` param) and into `hasActiveFilters` / `clearFilters`.
- **Warehouse column** in the inventory table, after Department. Shows `a.warehouse ?? '—'`.
- `assetApi.list` params + `useAssets` gain an optional `warehouse` string.

### Frontend — Detail dialog

- `asset-detail-drawer.tsx` Overview: add a **Warehouse** row (in the Ownership grid, near location).

### i18n

- Add to `lang/en/asset.ts` + `lang/th/asset.ts`: `asset_warehouse` ("Warehouse" / "คลัง"), `asset_receive_title` ("Receive to warehouse" / "รับเข้าคลัง"), `asset_receive_hint` (short helper), and the filter label reuses `asset_warehouse`.

### Out of scope (this spec)

- Renaming/guarding the existing **Asset → Stock** button (keep as-is for now; a separate small follow-up can rename it to "Decommission to spare stock" + warning).
- No dedicated `In store` status (we reuse `Ready`).
- No per-warehouse quantity rollups/dashboards for assets (filter + column is enough for now).
- Warehouse remains a name string (no FK migration for Stock or Asset).

## Testing

- **Backend (PHPUnit, `tests/Feature/AssetApiTest.php`):**
  - create/update an asset with `warehouse` persists and appears in the resource.
  - `markReceived` with a `warehouse` sets `status=ready`, `owner='Pool — IT'`, and the given `warehouse`.
  - `markReceived` without `warehouse` keeps the asset's existing warehouse.
  - list `?warehouse=<name>` returns only assets in that warehouse.
- **Frontend:** `npx tsc --noEmit`, `eslint`, `npm run build` clean; manual: form warehouse picker; receive modal defaults to current warehouse and records it; inventory filter + column; detail shows warehouse.
- **Pint** on changed PHP files.
