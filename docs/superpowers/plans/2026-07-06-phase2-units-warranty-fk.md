# Phase 2 — Units + Warranty Types FK Normalization

> Follows the proven Phase 1 (Locations) pattern — see `2026-07-06-master-data-fk-normalization.md`.
> Same recipe: create-missing → add nullable FK → backfill by trimmed name → drop name column;
> resource returns human name (via relation) **plus** the new `*_id`; forms submit the id;
> deleting an in-use master is blocked at the app layer (409) with `restrictOnDelete` as DB-level defense.

**Goal:** Link `stock_items.unit` → `stock_items.unit_id` (→ `units`) and `stock_items.warranty` → `stock_items.warranty_type_id` (→ `warranty_types`), so renaming a unit / warranty type in Master Data propagates everywhere and deleting one that is still in use is blocked.

**Verified current state:**
- `units` = `(id, name unique, description)`; `warranty_types` = `(id, name unique, description)`. Both masters already exist with a unique name.
- `stock_items.unit` = `varchar(40) NOT NULL default 'unit'`; `stock_items.warranty` = `varchar(120)` nullable.
- `StockItem` model: `$fillable` includes `'unit'`, `'warranty'`; no relation; no cast for these.
- `StockItemResource`: `'unit' => $this->unit`, `'warranty' => $this->warranty`.
- `StoreStockItemRequest`: `'unit' => ['required','string','max:40']`, `'warranty' => ['required','string','max:120']`.
- Only backend reader of these two attributes is `StockItemResource`. The PDF (`stock-history.blade.php`) uses movement `unit_cost`, unrelated.
- Frontend: **form** = `stock-item-modal.tsx` (Unit field NOT required; Warranty field required). **Display-only** readers: `stock-item-detail-modal.tsx`, `requests-tab.tsx`, `request-drawer.tsx` (read the string name — untouched because the resource keeps returning the name).
- `UnitController::destroy` / `WarrantyTypeController::destroy` delete unconditionally.
- No `StockItem` factory exists — tests use `StockItem::create([... 'unit' => 'unit', 'warranty' => '1y' ...])`.

**Design decisions (differ from Phase 1 because the fields differ):**
- `unit_id` → **nullable** column, request rule `nullable` — mirrors the UI (Unit field is not required; `isValid` never enforced it).
- `warranty_type_id` → **nullable** column (backfill-safe for legacy null warranty rows) but request rule `required` — preserves the existing "warranty required" behavior + validation test.
- Removing `unit`/`warranty` from `$fillable` means direct `StockItem::create(['unit' => …])` in the other 15 stock tests silently ignores the obsolete keys (no SQL error), so most need no edit. Only `StockItemTest` POST tests (which send `warranty` and expect it validated) must switch to `warranty_type_id`.

---

## Task 1 — Backend: `unit_id` + `warranty_type_id` FK end-to-end (TDD)

**Files:**
- Create: `database/migrations/2026_07_06_XXXXXX_convert_stock_items_unit_and_warranty_to_fk.php`
- Modify: `app/Models/Stock/StockItem.php`
- Modify: `app/Http/Resources/Stock/StockItemResource.php`
- Modify: `app/Http/Requests/Stock/StoreStockItemRequest.php`
- Modify: `app/Http/Controllers/Api/Stock/StockItemController.php` (eager-load relations)
- Modify: `app/Http/Controllers/Api/Settings/UnitController.php` (`destroy` → 409 when in use)
- Modify: `app/Http/Controllers/Api/Settings/WarrantyTypeController.php` (`destroy` → 409 when in use)
- Test: `tests/Feature/StockItemTest.php`

**Interfaces produced:**
- `StockItem::unit(): BelongsTo` → `App\Models\Settings\Unit`
- `StockItem::warrantyType(): BelongsTo` → `App\Models\Settings\WarrantyType`
- API `data.unit` (name via relation, may be null) + `data.unit_id`; `data.warranty` (name via relation) + `data.warranty_type_id`
- Store body: `unit_id?` (nullable), `warranty_type_id` (required)

### Steps

1. **Write/adjust failing tests first** in `tests/Feature/StockItemTest.php`:
   - Add `use App\Models\Settings\Unit;` and `use App\Models\Settings\WarrantyType;`.
   - In every POST test that currently sends `'warranty' => '1y'` (create, sequential-sku ×2, auto-sku-ignores, negative-min-max, max<min), create a `WarrantyType` and send `'warranty_type_id' => $wt->id`; drop the `'unit' => 'unit'` string (or optionally send `'unit_id'`).
   - Rewrite `test_create_requires_category_brand_model_warranty` to omit `warranty_type_id` and assert `assertJsonValidationErrors(['category','brand','model','warranty_type_id'])`.
   - Add `test_renaming_a_unit_propagates_to_stock_items` and `test_renaming_a_warranty_type_propagates_to_stock_items` (create master, create item with the `*_id`, rename master, GET item → `data.unit` / `data.warranty` shows new name).
   - Add `test_unit_in_use_cannot_be_deleted` and `test_warranty_type_in_use_cannot_be_deleted` (create master + referencing item → DELETE `/api/units/{id}` / `/api/warranty-types/{id}` → 409, master still in DB).

2. **Run** `php artisan test --compact tests/Feature/StockItemTest.php` → expect FAIL.

3. **Migration** — one file, both columns. Pattern per column: create-missing (`updateOrInsert(['name' => trim($name)])`) → add nullable FK `constrained(...)->restrictOnDelete()` → backfill via correlated subquery on `TRIM(...)` → drop old string column. `down()` re-adds `unit` (`string default 'unit'`) + `warranty` (`nullable`), best-effort backfills names from relations, drops the FKs. (Guard the `warranty` distinct pluck with `whereNotNull('warranty')->where('warranty','!=','')`.)

4. **Model** — `$fillable`: `'unit'`→`'unit_id'`, `'warranty'`→`'warranty_type_id'`. Add `unit(): BelongsTo` and `warrantyType(): BelongsTo`; import the two Settings models and `BelongsTo`.

5. **Resource** — `'unit' => $this->unit?->name`, add `'unit_id' => $this->unit_id`; `'warranty' => $this->warrantyType?->name`, add `'warranty_type_id' => $this->warranty_type_id`.

6. **Request** — `'unit_id' => ['nullable','integer','exists:units,id']`, `'warranty_type_id' => ['required','integer','exists:warranty_types,id']`; remove `unit`/`warranty` rules.

7. **Controller eager-load** — in `StockItemController::index` add `'unit','warrantyType'` to `->with([...])`; in `show()` add them too (avoid N+1 now that the resource resolves names through relations).

8. **Delete guards** — `UnitController::destroy` and `WarrantyTypeController::destroy`: if `StockItem::where('unit_id'|'warranty_type_id', $x->id)->exists()` return `response()->json(['message'=>'in_use'], 409)` before deleting. Import `App\Models\Stock\StockItem`.

9. **Run** `php artisan test --compact tests/Feature/StockItemTest.php` → expect PASS.

10. **Pint** `vendor/bin/pint --dirty --format agent`.

---

## Task 2 — Frontend: modal submits ids

**Files:** `resources/js/shared/types/index.ts`, `resources/js/modules/stock/api/stockApi.ts`, `resources/js/modules/stock/components/stock-item-modal.tsx`.

1. `StockItem` type: keep `unit`/`warranty` (change `unit` to `string | null`), add `unit_id: number | null;` and `warranty_type_id: number | null;`.
2. `StockItemPayload`: replace `unit: string` → `unit_id: number | null`; replace `warranty?: string | null` → `warranty_type_id: number | null`.
3. `stock-item-modal.tsx`:
   - `empty`: `unit_id: null`, `warranty_type_id: null` (drop `unit`, `warranty`).
   - `itemToForm`: `unit_id: item.unit_id`, `warranty_type_id: item.warranty_type_id`.
   - Unit `SearchableSelect`: `value={form.unit_id != null ? String(form.unit_id) : ''}`, `onChange={(v)=>set('unit_id', v ? Number(v) : null)}`, options `units.map(u=>({value:String(u.id),label:u.name,search:u.name}))`.
   - Warranty `SearchableSelect`: same with `warranty_type_id`.
   - `isValid`: replace `!!form.warranty?.trim()` → `form.warranty_type_id != null`.
4. `npx tsc --noEmit -p tsconfig.json` → 0; `npm run build` → ok.

---

## Task 3 — Seeders + full suite

1. Update `StockSeeder` (and any demo seeder that inserts `stock_items`) to resolve `unit`/`warranty` names to `unit_id`/`warranty_type_id` (e.g. `Unit::firstOrCreate(['name'=>$unit])->id`). `MasterDataSeeder` (which seeds the masters) stays.
2. Run full backend suite `php artisan test --compact`; fix any test that asserted on `data.unit`/`data.warranty` as a literal string set via the now-ignored create key.
3. Pint + typecheck + build clean.

---

## Self-review checklist
- Spec: `unit`→`unit_id`, `warranty`→`warranty_type_id` (migration+model+resource+request). Rename propagation (tests). Delete-restrict app-level for both masters (+tests). Create-missing backfill. Frontend id submit. Eager-load to kill N+1. ✓
- Type consistency: `unit_id`/`warranty_type_id` (int) through migration, fillable, resource, request, TS type, payload, api. Relations `unit()` / `warrantyType()` match `$this->unit?->name` / `$this->warrantyType?->name`. ✓
- Required-ness: `unit_id` nullable (matches UI), `warranty_type_id` required (preserves behavior+test). ✓
