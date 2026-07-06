# Phase 5 — Vendors FK Normalization

> Follows Phase 1–4 recipe. Shared master across two modules: `assets.supplier` → `vendor_id`; `contracts.vendor` → `vendor_id` (→ `vendors`).

**Goal:** Link asset supplier + contract vendor to the `vendors` master by id. Rename → propagates; delete-in-use → 409.

**Match/display field = `name`** (English). Data shows suppliers/vendors only ever match `vendors.name`, never `name_th`. `contracts.vendor` is largely free-text (18/21 not in master — Fortinet, Zoom, Adobe, Oracle… all real vendors) and `assets.supplier` has 2 junk test values (`dfdfdf`, `terer`). No clean mapping exists → **create-missing by name** (like Phase 3). Created rows get `name` = the string, `name_th` null.

**Verified state:**
- `vendors` = `(id, name NOT NULL, name_th, contact, phone, email, address)` — no unique on name.
- `assets.supplier` nullable; `contracts.vendor` NOT NULL. Values ≤255 (vendors.name is varchar 120 — all live values ≤ ~40, safe).
- Backend readers: AssetResource(42), StoreAssetRequest(48), AssetService(82 `$data['supplier']=$contract->vendor`), ContractResource(26), StoreContractRequest(32), ContractController search(57)/topVendors(123-125)/timeline(140)/actionQueue(156), ContractExpiryNotification(36), ContractExpiryAlertService(194), ContractService::importRows (validates name in master, then stores `vendor`). Contract import CSV stays **name-based** (template sample 'Microsoft') — resolve name→id inside importRows.
- Frontend: asset-form-drawer supplier field (vendorOptions value=v.name); contract-form-drawer vendor field (multi-step: STEP_FIELDS/FIELD_STEP key 'vendor', vendorOptions value=v.name, review row). Displays (asset detail supplier, contract list/detail/dashboard vendor) read the name → untouched (resource/summary returns name).
- Contract search/filter + dashboard top-vendors stay name-based (whereHas / groupBy on relation name) — no filter-UI churn.

**Required-ness:** `assets.vendor_id` nullable + `required_if:source,purchased` (matches supplier today). `contracts.vendor_id` required.

---

## Task 1 — Migration `convert_supplier_and_vendor_to_fk`
1. Create-missing vendors from distinct `assets.supplier` ∪ `contracts.vendor` (trim, non-empty) → `vendors.updateOrInsert(['name'=>trim])`.
2. Add `vendor_id` (nullable, `constrained('vendors')->restrictOnDelete()`) to `assets` (after `supplier`) + `contracts` (after `vendor`).
3. Backfill `vendor_id` by trimmed name (correlated subquery) on both.
4. Drop `assets.supplier` + `contracts.vendor`.
`down()`: re-add `supplier`(nullable) + `vendor`(string default '') columns; backfill names from relation; drop FKs. (contracts.vendor was NOT NULL — re-add with a default '' for rollback safety.)

## Task 2 — Models / Resources / Requests
- `Asset`: fillable `supplier`→`vendor_id`; add `vendor(): BelongsTo(Vendor)`.
- `Contract`: fillable `vendor`→`vendor_id`; add `vendor(): BelongsTo(Vendor)`.
- `AssetResource`: `'supplier' => $this->vendor?->name` + `'vendor_id'`.
- `ContractResource`: `'vendor' => $this->vendor?->name` + `'vendor_id'`.
- `StoreAssetRequest`: `supplier`→`'vendor_id' => ['nullable','required_if:source,purchased','integer','exists:vendors,id']`.
- `StoreContractRequest`: `vendor`→`'vendor_id' => ['required','integer','exists:vendors,id']`.

## Task 3 — Backend readers → relation, eager-load, delete-guard, import
- `AssetService::create` (82): `$data['vendor_id'] = $contract->vendor_id` for rented assets.
- `AssetController`: eager-load `vendor` on index/picker/summary/show/store/update.
- `ContractController`: search → `whereHas('vendor', fn=>where('name',$q))`; topVendors `groupBy(fn=>$c->vendor?->name)`; timeline/actionQueue `$c->vendor?->name`; eager-load `vendor` on index + `Contract::with('vendor')` in summary + load on show/store/update.
- `ContractExpiryNotification`(36) + `ContractExpiryAlertService`(194): `$contract->vendor?->name`.
- `ContractService::importRows`: keep name-in-master validation; build a `strtolower(name)=>id` map; store `'vendor_id' => $map[strtolower(trim($row['vendor']))]` instead of `'vendor'`.
- `VendorController::destroy`: 409 if `Asset::where('vendor_id',$id)->exists() || Contract::where('vendor_id',$id)->exists()`.

## Task 4 — Frontend (forms submit vendor_id; displays/filters unchanged)
- `Asset` type add `vendor_id:number|null`; `Contract` type add `vendor_id:number|null`.
- `AssetPayload`: `supplier`→`vendor_id?:number|null`. `ContractPayload`: `vendor`→`vendor_id:number`.
- asset-form-drawer: supplier field → vendor_id (vendorOptions value String(v.id); FormState/EMPTY/editing/validation/payload).
- contract-form-drawer: rename form key `vendor`→`vendor_id` in FormState/EMPTY/editing/STEP_FIELDS/FIELD_STEP/err/Field name/value/onChange; vendorOptions value String(v.id) label by lang; review row resolves name from id; payload `vendor_id: Number(form.vendor_id)`.

## Task 5 — Tests + seeders + live
- AssetApiTest: rented test asserts `data.supplier` = the contract's vendor name (create a Vendor + set contract vendor_id). Add asset supplier rename + delete-restrict? (covered via contract path below; add one asset-supplier rename test.)
- ContractApiTest: create/import tests send `vendor_id` (create Vendor). Import test CSV still name-based → ensure a matching Vendor exists. Add vendor rename-propagation + delete-restrict (via contract).
- MasterDataTest vendor delete safe (no refs).
- AssetSeeder supplier name → vendor_id (firstOrCreate); StockSeeder n/a; ContractSeeder vendor name → vendor_id.
- Full suite green; pint; tsc; build. Run migration live; verify backfill.

## Self-review
- Match/display by `name`; create-missing by name (name_th null on created rows — column nullable). ✓
- `vendor()` relation shadows old string attr on BOTH Asset and Contract → every `$x->supplier`/`$x->vendor` reader updated. ✓
- Import stays name-based CSV but resolves to id. ✓
- Delete-guard covers both referencing tables. ✓
