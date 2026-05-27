# Master Data – Settings Module

**Date:** 2026-05-27
**Status:** Approved

## Summary

Add a **Master Data** section to the Settings module with six sub-tabs: Brands, Models, Categories, Supplier/Vendor, Warehouse, and Locations (the existing Locations tab is relocated here). These lookups feed the Assets, Contract, and Stock modules.

---

## Architecture

### Navigation change
- Add `'master-data'` to the `Section` union and the `nav` array in `settings/index.tsx`.
- The existing `'locations'` nav item is removed; Locations becomes one of the six sub-tabs inside Master Data.

### Sub-tab layout (Option A – flat tabs)
`MasterDataTab` renders a horizontal pill/tab bar at the top with six items. The active sub-tab renders its list below. Sub-tab state is local (`useState`), not in the URL hash.

```
[ Brands | Models | Categories | Supplier/Vendor | Warehouse | Locations ]
────────────────────────────────────────────────────────────────────────────
  inline add row
  list of rows (name • edit • delete)
```

Each sub-tab reuses the same inline-edit row pattern as the existing `LocationsTab`.

---

## Data Model

### New tables

| Table | Columns |
|-------|---------|
| `brands` | id, name, description (nullable), timestamps |
| `asset_models` | id, name, brand_id (FK→brands nullable), description (nullable), timestamps |
| `categories` | id, name, type ENUM('asset','contract','stock'), description (nullable), timestamps |
| `vendors` | id, name, contact (nullable), phone (nullable), email (nullable), address (nullable), timestamps |
| `warehouses` | id, name, description (nullable), timestamps |

`locations` table already exists — no migration needed, just UI relocation.

### Models (Eloquent)
- `Brand`, `AssetModel` (belongsTo Brand), `Category`, `Vendor`, `Warehouse`
- All use `$fillable`; no soft-deletes for now.

---

## Backend

### Controllers (all under `app/Http/Controllers/Api/`)
One resourceful controller per entity: `BrandController`, `AssetModelController`, `CategoryController`, `VendorController`, `WarehouseController`.

Each exposes: `index`, `store`, `update`, `destroy`.

### Routes (`routes/api.php`)
```php
Route::apiResource('brands', BrandController::class)->only(['index','store','update','destroy']);
Route::apiResource('asset-models', AssetModelController::class)->only(['index','store','update','destroy']);
Route::apiResource('categories', CategoryController::class)->only(['index','store','update','destroy']);
Route::apiResource('vendors', VendorController::class)->only(['index','store','update','destroy']);
Route::apiResource('warehouses', WarehouseController::class)->only(['index','store','update','destroy']);
```
All under `auth:sanctum` middleware (already applied globally).

### API Resources
`BrandResource`, `AssetModelResource`, `CategoryResource`, `VendorResource`, `WarehouseResource` — return id + all fillable fields.

---

## Frontend

### Types (`resources/js/types/index.ts` or new `master-data.ts`)
```ts
interface Brand     { id: number; name: string; description?: string }
interface AssetModel{ id: number; name: string; brand_id?: number; brand?: Brand; description?: string }
interface Category  { id: number; name: string; type: 'asset'|'contract'|'stock'; description?: string }
interface Vendor    { id: number; name: string; contact?: string; phone?: string; email?: string; address?: string }
interface Warehouse { id: number; name: string; description?: string }
```

### API service (`resources/js/services/masterDataApi.ts`)
Standard axios CRUD functions for each entity (list, create, update, remove).

### Hooks (`resources/js/hooks/use-master-data.ts`)
`useBrands`, `useAssetModels`, `useCategories`, `useVendors`, `useWarehouses` — each with a mutations hook following the same pattern as `useLocationMutations`.

### Component (`resources/js/pages/settings/index.tsx`)
`MasterDataTab` — sub-tab bar + six inner list components:
- `BrandsList` — name + optional description
- `ModelsList` — name + brand dropdown (SearchSelect from existing brands)
- `CategoriesList` — name + type badge (asset/contract/stock)
- `VendorsList` — name + contact/phone/email (shown as secondary text, not inline-editable fields — use a small form row instead)
- `WarehousesList` — name + optional description
- `LocationsList` — extracted from existing `LocationsTab`, unchanged logic

Simple entities (Brands, Warehouses, Locations) use the single-field inline-edit row identical to existing Locations.
Complex entities (Models, Categories, Vendors) use a small inline form with 2–3 fields.

---

## Sub-tab details

### Brands
Fields: name (required), description (optional).
Row display: name • description (muted, truncated).

### Models
Fields: name (required), brand_id (optional select — shows brand name).
Row display: name • brand chip.

### Categories
Fields: name (required), type (required — select: Asset / Contract / Stock).
Row display: name • type badge colored by type.

### Supplier/Vendor
Fields: name (required), contact, phone, email, address (all optional).
Row display: name • phone/email as secondary line (compact).

### Warehouse
Fields: name (required), description (optional).
Row display: name • description (muted).

### Locations
Identical to current `LocationsTab` — just moved inside `MasterDataTab`.

---

## Error handling
- Delete blocked by FK constraint → catch 422/500 and show `Swal.fire` error (consistent with rest of app).
- Empty name → disabled Add button (client-side guard only).

---

## Out of scope
- Bulk import/export
- Soft deletes
- Usage counts ("used in N assets")
- Pagination (lists are short master-data tables)
