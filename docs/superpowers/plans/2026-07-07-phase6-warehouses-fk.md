# Phase 6 — Warehouses FK Normalization (final phase)

> The largest phase. Design decision: **FK the current-state warehouse columns; keep the log/snapshot ones as strings.**

**Scope decision (owner-approved 2026-07-07):**
- **FK → `warehouse_id`** (current state): `assets.warehouse`, `stock_item_serials.warehouse`, `stock_balances.warehouse` (→ `warehouses` master, `App\Models\Stock\Warehouse`).
- **KEEP as string** (append-only log / historical snapshot): `stock_item_serial_events.warehouse` (sits beside free-text `from_label`/`to_label`), `stock_counts.warehouse`. Rationale: an audit log records what was true at the time; FK-ing it would let a later rename rewrite history, and it's never filtered by id.
- **`stock_items` has NO warehouse column** (removed in the warehouse-aware redesign) — not touched.
- **`stock_movements.from_label`/`to_label`** are free-text labels (dept/recipient/vendor names, not warehouses) — not touched.

**Data:** all warehouse values are clean (0 unmatched vs the 5-row master). No `'Unassigned'` rows currently exist — it is a **code sentinel** for "stock with no chosen warehouse".

**`'Unassigned'` handling:** maps to `warehouse_id = NULL` everywhere (no fake master row). serials.warehouse_id nullable (no unique — fine). balances keep `unique(stock_item_id, warehouse_id)`: enforces real warehouses; the null bucket relies on app-level `firstOrCreate(... warehouse_id IS NULL)` for dedup (as today).

**Key isolation trick:** `StockBalanceService::add/remove/move` keep their **name-string public API** and resolve name→id **internally** — so every balance call-site in StockMovementController / StockRequestController stays unchanged (big risk reduction). Only serial writes/reads, resources, relations, and the summary/filter aggregations change.

**Resolver:** `warehouseId(?string $name): ?int` — trim; `''`/`'Unassigned'` → null; else `Warehouse::firstOrCreate(['name'=>$name])->id` (clean data → always a lookup, never really creates).

---

## Task 1 — Migration `convert_warehouse_to_fk`
1. Create-missing warehouses from distinct non-blank, non-'Unassigned' names in `assets.warehouse` ∪ `stock_item_serials.warehouse` ∪ `stock_balances.warehouse`.
2. `assets`: add `warehouse_id` nullable FK `constrained('warehouses')->restrictOnDelete()` after `warehouse`; backfill by name; drop `warehouse`.
3. `stock_item_serials`: add `warehouse_id` nullable FK after `warehouse`; backfill by name (unmatched/'Unassigned' → null); drop `warehouse`.
4. `stock_balances`: drop `unique(stock_item_id, warehouse)`; add `warehouse_id` nullable FK; backfill; add `unique(stock_item_id, warehouse_id)`; drop `warehouse`.
5. Leave `stock_item_serial_events.warehouse` + `stock_counts.warehouse` untouched.
`down()`: reverse (re-add string cols, backfill names from relation, restore old unique, drop FKs).

## Task 2 — Models
- `Asset`: fillable `warehouse`→`warehouse_id`; add `warehouse(): BelongsTo(Warehouse)`.
- `StockItemSerial`: fillable +`warehouse_id` (−`warehouse`); add `warehouse(): BelongsTo(Warehouse)`.
- `StockBalance`: fillable +`warehouse_id` (−`warehouse`); add `warehouse(): BelongsTo(Warehouse)`.

## Task 3 — StockBalanceService (internal resolve; public API stays name-based)
- add a private `warehouseId(?string): ?int` resolver.
- `add`/`remove`/`move`/`rebuildFor`: translate the name arg to warehouse_id for `firstOrCreate`/`where` keys and messages. Callers unchanged.

## Task 4 — Serial reads/writes (name → `?->name` / resolve on write)
- `StockMovementController`: serial `create(['warehouse_id'=>resolve($inboundWarehouse)])`; transfer `update(['warehouse_id'=>resolve($toWh)])`; `returnSerials` writes warehouse_id. The `$inboundWarehouse = $toWh ?: 'Unassigned'` stays (name), resolved at the serial write and passed as name to the balance service.
- `StockRequestController`: replace `$s->warehouse ?: 'Unassigned'` groupings with `$s->warehouse?->name ?: 'Unassigned'` (eager-load serials.warehouse); balance `remove` still takes the name.
- `StockSerialService`: events keep `'warehouse' => $row->warehouse?->name` (event log stays string) — so the serial's warehouse **name** is snapshotted into the event.
- `StockCountService::reconcileSerials`: event `'warehouse' => $row->warehouse?->name`.

## Task 5 — Resources + aggregations + filters
- `AssetResource`: `'warehouse' => $this->warehouse?->name` + `'warehouse_id'`.
- `StockItemResource` + `StockItemController::show`: serials/balances `'warehouse' => $x->warehouse?->name` (eager-load the relation).
- `StockItemController::index` warehouse filter (sends name): filter items whose balances sit in that warehouse → `whereHas('balances.warehouse', fn($w)=>$w->where('name',$val))` (or resolve name→id then `balances where warehouse_id`).
- `StockItemController::summary` by-warehouse: rewrite `StockBalance::selectRaw('warehouse,...')->groupBy('warehouse')` to join/group by `warehouse_id` and resolve the name (null → 'Unassigned'/'—'); eager-load balances.warehouse where needed.
- `StockCountService::open`: warehouse filter `whereHas('balances', fn($b)=>$b->whereHas('warehouse', fn($w)=>$w->where('name',$val)))`; **also fix the Phase-4 latent bug** on the same line: `->where('category', $c)` → `->whereHas('category', fn($c2)=>$c2->where('name',$c))`.

## Task 6 — Asset warehouse (form/request/controller)
- `StoreAssetRequest`: `warehouse`→`warehouse_id` (nullable, exists:warehouses,id).
- `AssetController`: index warehouse filter `where('warehouse',...)` → `whereHas('warehouse', fn($w)=>$w->where('name',$val))` (or by id); eager-load `warehouse`; picker/summary/show/store/update load `warehouse`.
- `AssetService`: `receive`/`transfer` set `warehouse_id` (resolve the chosen warehouse name → id); the receive endpoint currently takes a warehouse name.

## Task 7 — WarehouseController delete-guard
409 if referenced by `assets.warehouse_id`, `stock_item_serials.warehouse_id`, or `stock_balances.warehouse_id`.

## Task 8 — Frontend (forms submit warehouse_id; displays/filters keep names)
- `Asset` type +`warehouse_id`; `AssetPayload` warehouse→warehouse_id; asset-form-drawer + asset-receive-modal + asset-transfer-drawer warehouse pickers → id; stock receive/transfer/count drawers warehouse pickers → **keep sending name** to the movement/count endpoints (balance service resolves), OR switch to id where the endpoint validates. Decide per-endpoint (movements/counts stay name-based to avoid churn; only the asset register/receive/transfer that hit assets.warehouse switch to id).
- Types for serials/balances warehouse stay string (name via relation) — no frontend change for those displays.

## Task 9 — Tests + seeders + live
- StockBalanceTest, StockTransferTest, StockReturnTest, StockSerialReceiveTest, StockCountTest, StockMovementSerialsTest, AssetApiTest (warehouse), StockItemTest: expect churn — creates that set `warehouse`/`balances(['warehouse'=>...])` directly must use warehouse_id or a real Warehouse. Add warehouse rename + delete-restrict tests.
- Seeders: StockSeeder balances `updateOrCreate(['warehouse'=>...])` → warehouse_id; AssetSeeder n/a (no warehouse col set); serial seeding warehouse→id.
- Full suite green; pint; tsc; build. Run migration live; verify backfill.

## Self-review
- Log tables (events, counts) stay string per audit-log principle. ✓
- 'Unassigned' → null; master stays clean; balance dedup via firstOrCreate. ✓
- Balance service isolates the FK (name-based API) → minimal call-site churn. ✓
- Serial `->warehouse` (now relation) readers all switched to `?->name`. ✓
- Delete-guard covers the three FK tables. ✓
