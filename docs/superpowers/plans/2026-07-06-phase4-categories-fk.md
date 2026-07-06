# Phase 4 — Categories FK Normalization

> Follows Phase 1–3 recipe. `assets.type` → `category_id`; `stock_items.category` → `category_id` (both → `categories`).

**Goal:** Link the asset "type" and stock "category" to the `categories` master by id. Rename a category → propagates; delete-in-use → 409. Icon already resolves from `categories.icon` in `AssetTypeIcon` (matches by name → keeps working once the resource returns the category name).

**User decision (2026-07-06):** `assets.type` holds a mix of legacy English enum values (`laptop`, `desktop`, …) and Thai category names. Owner chose to **map the known enum values to their existing Thai categories** in the migration (no duplicate categories) rather than create-missing. `stock_items.category` is already 100% aligned to master.

**Verified state:**
- `categories` = `(id, name, name_th, icon, description)` — **no unique on name** (unique in practice); icons already populated for all 20 rows.
- `assets.type` NOT NULL default 'laptop'; `stock_items.category` nullable. Values ≤120.
- `App\Enums\Asset\AssetType` (laptop/desktop/mobile/printer/server/network/other) exists but is NOT enforced (type is a free string; not cast). Keep the enum file (unused now) — harmless.
- `AssetTypeIcon` (`asset-meta.tsx`) already reads `categories.find(c => c.name === type)?.icon` with a LEGACY_ICON fallback → unchanged (resource returns the category name).
- Backend readers of `assets.type`: AssetResource(23), AssetController picker(48-49) + type-filter(75-76) + by-type dashboard(113-117), StoreAssetRequest(35), ContractResource(60 `?: $a->type`). Stock `category`: StockItemResource(26), StoreStockItemRequest, StockItemController category-filter(65-66) + by-category summary(141-142).
- **Filters stay name-based** (whereHas by category name, like Phase-3 search) — no filter-UI churn; forms switch to id.

**Enum→category map (applied in migration, in place, before backfill):**
`laptop→แล็ปท็อป, desktop→เดสก์ท็อป, mobile→Mobile, printer→เครื่องพิมพ์, server→เซิร์ฟเวอร์, network→สวิตช์ / เราเตอร์, other→อุปกรณ์อื่น ๆ, โทรศัพท์→Mobile`. (UPS / เครื่องพิมพ์ / ซอฟต์แวร์ลิขสิทธิ์ already match.)

---

## Task 1 — Migration `convert_type_and_category_to_fk`
1. Normalize `assets.type`: for each `[$from=>$to]` in the map, `DB::table('assets')->where('type',$from)->update(['type'=>$to])`.
2. Create-missing categories from distinct `assets.type` ∪ `stock_items.category` (trim, non-empty) → `categories.updateOrInsert(['name'=>trim])` (should be a no-op after mapping; safety net).
3. Add `category_id` (nullable, `constrained('categories')->restrictOnDelete()`) to `assets` (after `type`) + `stock_items` (after `category`).
4. Backfill `category_id` by trimmed name (correlated subquery) on both.
5. Drop `assets.type` + `stock_items.category`.
`down()`: re-add `type`(string default 'laptop') + `category`(nullable string); backfill names from relation; drop the FKs.

## Task 2 — Models / Resources / Requests
- `Asset`: fillable `type`→`category_id`; add `category(): BelongsTo(Category)`.
- `StockItem`: fillable `category`→`category_id`; add `category(): BelongsTo(Category)`.
- `AssetResource`: `'type' => $this->category?->name` + `'category_id'`.
- `StockItemResource`: `'category' => $this->category?->name` + `'category_id'`.
- `StoreAssetRequest`: `type`→`'category_id' => ['required','integer','exists:categories,id']`.
- `StoreStockItemRequest`: `category`→`'category_id' => ['required','integer','exists:categories,id']`.

## Task 3 — Controllers (readers → relation, filter → whereHas, eager-load, delete-guard)
- `AssetController`: picker(48-49) `$a->category?->name`; type-filter `whereHas('category', fn=>where('name',$val))`; by-type `groupBy(fn=>$a->category?->name)`; eager-load `category` on index/picker/summary/show/store/update.
- `ContractResource`(60) `?: $a->category?->name` (eager-load category on contract assets query).
- `StockItemController`: category-filter `whereHas('category', …)`; by-category `groupBy(fn=>$i->category?->name)`; eager-load `category` on index/summary/show.
- `CategoryController::destroy`: 409 if `Asset::where('category_id',$id)->exists() || StockItem::where('category_id',$id)->exists()`.

## Task 4 — Frontend (forms submit category_id; display + filters unchanged)
- `Asset` type: add `category_id:number|null` (keep `type` display string). `StockItem`: add `category_id:number|null`.
- `AssetPayload`: `type`→`category_id:number`. `StockItemPayload`: `category`→`category_id:number|null`.
- `asset-form-drawer`: type field → category_id (FormState `type`→`category_id` string, options value String(c.id), submit Number). Validation on category_id.
- `stock-item-modal`: category field → category_id (empty/itemToForm/isValid/select).
- Display of `a.type`/`item.category` (list/detail) untouched (resource returns name). Filters untouched (still send name).

## Task 5 — Tests + seeders + live
- AssetApiTest: create tests send `category_id` (create a Category); type-required test → `category_id`; add rename + delete-restrict (category via asset). Fix any `data.type` assertions to the category name.
- StockItemTest: create tests send `category_id`; add rename + delete-restrict (category via stock). Category filter test still sends name.
- MasterDataTest category delete test safe (no references).
- AssetFactory: `category_id` via `Category::firstOrCreate`. AssetSeeder: map type name → category_id. StockSeeder: category name → category_id.
- Full suite green; pint; tsc; build. Run migration on live DB; verify 100% backfill.

## Self-review
- Map avoids duplicate categories; create-missing is a safety net only. ✓
- `category()` relation shadows old string attr → every `$x->type`/`$x->category` reader updated. ✓
- Filters name-based (no UI churn), forms id-based. ✓
- Delete-guard covers both referencing tables. ✓
