# Phase 3 — Brands + Asset Models FK Normalization

> Follows Phase 1/2 recipe. **Largest phase so far** — touches BOTH `assets` and `stock_items`, and models are brand-scoped.

**Goal:** `assets.brand` + `stock_items.brand` → `*.brand_id` (→ `brands`); `assets.model` + `stock_items.model` → `*.model_id` (→ `asset_models`). Rename a brand/model in Master Data → propagates; delete-in-use → 409.

**User decision (2026-07-06):** Full brand+model create-missing, accepting that free-text model values (which mostly don't match the curated `asset_models`) auto-create ~30 new master rows. Data reality: `brands.name` clean+unique (create-missing legit brands like Belkin/Kingston/Logitech); `asset_models.name` NOT unique (scoped by brand_id), model strings are free-text/part-numbers → **backfill model_id by (name + brand_id), null-safe**.

**Verified state:**
- `brands` `(id, name unique, description)`; `asset_models` `(id, name, brand_id nullable FK→brands setNull, description)` — no unique on name; **no dup (name, brand_id)** confirmed.
- `assets.brand` nullable / `assets.model` NOT NULL; `stock_items.brand`/`model` nullable. All values ≤25 chars (safe for asset_models.name varchar 120).
- Relations to add: `Asset::brand()`,`Asset::model()`; `StockItem::brand()`,`StockItem::model()` (both → Brand / AssetModel).
- Backend readers of `$x->brand`/`$x->model` (→ must become `?->name`): AssetResource, StockItemResource, AssetService (transfer snapshot `asset_model`), AssetController (picker display name L47, search L69, 3× AuditLog), ContractResource (linked-asset display L59), AssetAssignedNotification, AssetReturnRequestedNotification, TicketResource (relatedAsset model). Stock/Asset controller search `orWhere('brand'|'model','like')` → `orWhereHas`.
- Frontend forms (submit ids): `asset-form-drawer.tsx`, `stock-item-modal.tsx` (both already do the brand→model cascade by `brand_id`). Display-only (untouched, resource returns names): asset list/detail/my-assets/transfer/receive, stock detail/requests.
- API contract change: `brand`/`model` strings → `brand_id`/`model_id`. **Test churn**: AssetApiTest (~9 create tests + factory + a manual transfer snapshot), StockItemTest / StockFifoCostingTest POST tests, ContractApiTest (if it creates assets). MasterDataTest brand/model delete tests are safe (no references).

**Required-ness:** `brand_id` — asset nullable (current), stock required (current). `model_id` — both required (current).

---

## Task 1 — Migration (both tables, brands then models)

Create `..._convert_brand_and_model_to_fk`:
1. **Brands create-missing** from distinct `assets.brand` ∪ `stock_items.brand` (trim, non-empty) → `brands.updateOrInsert(['name'=>trim])`.
2. Add `brand_id` (nullable, `constrained('brands')->restrictOnDelete()`) to `assets` (after `brand`) + `stock_items` (after `brand`).
3. Backfill `brand_id` by name (correlated subquery) on both.
4. **Asset models create-missing**: distinct `(brand_id, model)` pairs from both tables (brand_id now populated) → `asset_models.updateOrInsert(['name'=>trim(model),'brand_id'=>brandId])`. Null brand_id → Laravel `where` emits `IS NULL`, so no dup.
5. Add `model_id` (nullable, `constrained('asset_models')->restrictOnDelete()`) to both (after `model`).
6. Backfill `model_id` matching **name + brand_id null-safe**: `... WHERE asset_models.name=TRIM(t.model) AND (asset_models.brand_id=t.brand_id OR (asset_models.brand_id IS NULL AND t.brand_id IS NULL))`.
7. Drop `brand`, `model` from both tables.

`down()`: re-add `brand`(nullable string), `model`(nullable string — was NOT NULL on assets but nullable is safe for rollback) on both; backfill names from relations; drop the two FKs on each. (asset_models FK→brands untouched.)

## Task 2 — Models + Resources + Requests

- `Asset`: fillable `brand`→`brand_id`, `model`→`model_id`; add `brand(): BelongsTo(Brand)`, `model(): BelongsTo(AssetModel)`.
- `StockItem`: fillable `brand`→`brand_id`, `model`→`model_id`; add same two relations.
- `AssetResource`: `brand`→`$this->brand?->name` + `brand_id`; `model`→`$this->model?->name` + `model_id`.
- `StockItemResource`: same.
- `StoreAssetRequest`: `brand_id`→`['nullable','integer','exists:brands,id']`, `model_id`→`['required','integer','exists:asset_models,id']`.
- `StoreStockItemRequest`: `brand_id`→`['required',...]`, `model_id`→`['required','integer','exists:asset_models,id']`.

## Task 3 — Backend readers → `?->name` + eager-load + search + delete-guards

- `AssetService` transfer snapshot: `$asset->model?->name`.
- `AssetController`: picker name (L47) `$a->brand?->name`/`$a->model?->name`; search (L69) `orWhereHas('model', fn=>where('name','like'))`; 3× AuditLog `$asset->model?->name`; eager-load `brand`,`model` on index + picker + load on show/store/update responses.
- `ContractResource` L59 linked-asset name → relations (ensure the contract's assets query eager-loads brand,model).
- `AssetAssignedNotification`, `AssetReturnRequestedNotification`: `$this->asset->model?->name`.
- `TicketResource` L38: `$this->relatedAsset?->model?->name` (eager-load relatedAsset.model where used).
- `StockItemController` search (L61-62): `orWhereHas('brand'…)->orWhereHas('model'…)`; eager-load `brand`,`model` on index + show.
- `BrandController::destroy`: 409 if `Asset::where('brand_id',$id)->exists() || StockItem::where('brand_id',$id)->exists()`.
- `AssetModelController::destroy`: 409 if referenced by `assets.model_id` or `stock_items.model_id`.

## Task 4 — Frontend (forms submit ids)

- `shared/types`: `Asset` add `brand_id:number|null`, `model_id:number|null` (keep `brand`,`model` display); `StockItem` add same.
- `assetApi` `AssetPayload`: `brand`→`brand_id?:number|null`, `model`→`model_id:number`.
- `stockApi` `StockItemPayload`: `brand`→`brand_id:number|null`, `model`→`model_id:number|null`.
- `asset-form-drawer.tsx`: FormState `brand`/`model` → `brand_id`/`model_id` (string in state, Number on submit); brand select value/options by id; model cascade `selectedBrand = brands.find(b=>b.id===Number(form.brand_id))`, options filtered by brand_id → value String(m.id); reset model_id when brand changes; validation on ids; payload sends ids.
- `stock-item-modal.tsx`: same conversion (brand/model → ids, cascade by id).

## Task 5 — Seeders + full suite

- `AssetFactory`: resolve/create a Brand + AssetModel → set `brand_id`/`model_id` (keep a couple of realistic names). Or use `Brand::firstOrCreate` + `AssetModel::firstOrCreate` in `definition()`.
- `AssetSeeder`, `StockSeeder`: resolve brand/model names → ids (`firstOrCreate`; model scoped to brand_id).
- Update AssetApiTest / StockItemTest / StockFifoCostingTest / ContractApiTest POST payloads to send `brand_id`/`model_id`; fix the manual AssetTransfer snapshot to `$asset->model?->name`.
- `php artisan test --compact` green; `pint`; `tsc`; `npm run build`.
- Run `php artisan migrate` on live DB (user pre-approved running migrations without backup for this effort).

## Self-review
- Model backfill by (name+brand_id) null-safe — avoids ambiguous match on non-unique model names. ✓
- Relation names `brand`/`model` shadow the old string attrs; every `$x->brand`/`$x->model` reader updated to `?->name`. ✓
- Delete-guard on both masters covers both referencing tables. ✓
- Required-ness preserved per current form behavior. ✓
