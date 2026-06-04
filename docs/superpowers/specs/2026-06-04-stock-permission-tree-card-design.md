# Stock Control — Hierarchical Permission Card (Design)

**Date:** 2026-06-04
**Module:** Permission Management (#7) × Stock Management (#6)
**Status:** Approved design — ready for implementation plan
**Mockup:** `docs/mockups/stock-permission-card.html` (interactive, approved)

## Goal

Restructure the **Stock Control** card in the Permission matrix from a flat list of
action toggles into a **three-level tree**:

```
Stock Module        (master)   ── gates the module + the sidebar Stock icon
  Dashboard         (view)
  Stock item        (view)
    Manage SKU / Receive / Return / Transfer   (management)
  Request           (view)
    New Request / Approve Request / Issue·Fulfill   (management)
  Counting          (view)
    Counting        (management)
  Event             (view)
    Events          (management)
```

A **View only** parent unlocks the **Management** children beneath it. Turning a
parent off cascades its children off and locks them. The master **Stock Module**
gates everything and drives the sidebar icon.

**Scope:** the Stock module only. Other modules keep their current flat card. The
matrix renderer must special-case Stock the same way Administration is already
special-cased via `ADMIN_GROUPS`.

## Permission key model (16 keys)

Catalog `stock` becomes (flat list, used for validation + super = all):

| Level | Key | Meaning |
|---|---|---|
| Master | `stock.module` | Module access; drives sidebar icon; cascade root |
| View | `stock.view_dashboard` | See the Dashboard tab (KPIs / reorder) |
| View | `stock.view` *(existing — reused)* | See the Stock item tab |
| View | `stock.view_request` | See the Request tab |
| View | `stock.view_count` | See the Counting tab (read sessions) |
| View | `stock.view_events` | See the Event tab (read movement log) |
| Mgmt | `stock.manage_items` | Manage SKU (Min/Max) |
| Mgmt | `stock.receive` | Receive |
| Mgmt | `stock.return` | Return |
| Mgmt | `stock.transfer` | Transfer |
| Mgmt | `stock.request` | New Request |
| Mgmt | `stock.approve` | Approve Request |
| Mgmt | `stock.fulfill` | Issue / fulfill |
| Mgmt | `stock.count` | Open / save / commit / cancel a count |
| Mgmt | `stock.events` | View movement detail (serials) |

New keys introduced: `module`, `view_dashboard`, `view_request`, `view_count`,
`view_events`, `count`, `events`. `stock.view` is **kept as-is** and re-purposed as
the "Stock item" view (no rename — avoids churn in `StockItemController`).

### Hierarchy map (drives cascade + normalization)

```
stock.module
├── stock.view_dashboard
├── stock.view            → manage_items, receive, return, transfer
├── stock.view_request    → request, approve, fulfill
├── stock.view_count      → count
└── stock.view_events     → events
```

- A management child requires its group's view key.
- Every view key requires `stock.module`.

## UI design (approved mockup)

- **Aesthetic:** "refined control-panel" — compact/dense like the existing module
  cards. Tokens identical to `resources/css/app.css` (brand `#2563eb`, light + dark).
- **Master row:** a faint brand-tinted band with the label **Stock Module** and the
  caption "Master · gates the module and the sidebar icon" stacked beneath it. No
  separate sidebar indicator chip.
- **View parents:** stronger weight, a small **View** chip (brand-tinted) before the
  toggle. No "MGMT" tag on children.
- **Management children:** lighter text, hung off a thin connector rail (indent + tee).
- **Toggle:** same as the app's `h-5 w-9` switch (white knob + brand check).
- **States:** on / off / locked. Locked = dimmed + a small lock glyph, not clickable.
- **Cascade (client):** turning a parent off forces children off and locks them;
  turning a child on implies its ancestors (keeps draft state honest). Master off →
  whole panel dims and locks.
- **Counts:** header tally `active / 16`, counting only keys whose ancestors are all on.

The matrix renders this from a Stock-specific tree config in
`resources/js/pages/permissions/index.tsx` (sibling to `ADMIN_GROUPS`), reading the
keys' on/off from the existing role draft `Set<string>`.

## Backend enforcement

### Catalog
`Permissions::catalog()['stock']` lists all 16 keys (flat). `Permissions::all()`
therefore includes them for `Rule::in()` validation and the super grant set.

### Normalization on save (the core mechanism)
`RolePermissionController::update` gains a normalization step: given the submitted
permission set, drop any stock key whose ancestor (per the hierarchy map) is not also
present. Persist the normalized set.

Because the stored set is always hierarchy-consistent, **per-key `hasPermission()`
checks throughout the controllers remain valid** — a granted child guarantees its
ancestors are granted too. No compound checks are needed in business logic.

The hierarchy map lives in PHP (e.g. `Permissions::stockHierarchy()` or a small
`StockPermissions` support class) and is the single source of truth shared by the
normalizer; the frontend mirrors it for cascade.

### Re-gated read endpoints

| Endpoint | Old gate | New gate |
|---|---|---|
| `StockItemController@index/show` | `stock.view` | `stock.view` (unchanged) |
| `StockItemController@summary` (Dashboard KPIs) | `stock.view` | `stock.view_dashboard` |
| `StockRequestController@index` | `stock.view` | `stock.view_request` |
| `StockMovementController@index` (log) | `stock.view` | `stock.view_events` |
| `StockMovementController@serials` | `stock.view` | `stock.events` |
| `StockMovementController@labelsPdf` | `stock.view` | `stock.events` OR a write perm (see coupling) |
| `StockCountController@*` (list/read) | `stock.audit` | `stock.view_count` |
| `StockCountController@*` (open/save/commit/cancel) | `stock.audit` | `stock.count` |

Write endpoints (`store` receive/return/transfer, `StoreStockItemRequest`,
request/approve/fulfill) keep their existing per-action gate.

### Coupling resolutions (approved)

1. **Dashboard "recent movements" widget** reads the movement log (now `view_events`).
   The widget is shown only when the user has `stock.view_events`; otherwise it is
   hidden while the rest of the Dashboard (KPIs, reorder queue) stays under
   `stock.view_dashboard`. The `useStockMovements()` query in `dashboard-tab.tsx` is
   gated with `enabled: can('view_events')`.
2. **`labelsPdf`** (serial-sticker print) is used both in the receive flow
   (`movement-drawer.tsx`) and the Events detail. Gate it by
   `stock.events OR stock.receive OR stock.return OR stock.transfer` so a user who can
   record a movement can still print labels without holding the Events permission.

### Frontend `can()` and tab visibility
`resources/js/pages/stock/index.tsx`: `can(p)` stays `role === 'super' || perms.includes('stock.'+p)`.
- Tabs are filtered by their view key: Dashboard→`view_dashboard`, Items→`view`,
  Requests→`view_request`, Counting→`view_count`, Events→`view_events`.
- `can('audit')` references migrate to `can('count')` (Counting tab + actions).
- Events tab data/detail gated by `view_events` / `events`.
- Sidebar (`nav.ts`): the Stock item gate changes from `permission: 'stock.view'` to
  `permission: 'stock.module'` so the icon follows the master.

## Migration / rollout (live data)

A data migration grants the new keys to existing roles so no current user loses access:

For each role with any `stock.*` grant (`allowed = true`):
- grant `stock.module`
- if it has `stock.view` → grant `stock.view_dashboard` and `stock.view_events`
  (`stock.view` itself stays as the items view)
- if it has `stock.view` or `stock.request` → grant `stock.view_request`
- `stock.view_count` → only for roles that had `stock.audit` (none non-super today) → stays off
- management grants untouched

`Permissions::defaults()` is updated for `admin` / `hr` / `user` to include
`stock.module` + the relevant view keys, so a fresh `migrate:fresh --seed` matches.

Result: every role sees exactly the same tabs as before; the split is now independently
toggleable going forward.

## Tests

- **Unit:** hierarchy normalization — granting a child without its parent is dropped;
  granting a view without master is dropped.
- **Feature (RBAC):** for each re-gated endpoint, a user with only the new view/mgmt
  key passes and a user missing it gets 403; super bypasses.
- **Feature:** `labelsPdf` reachable by a receiver without `stock.events`.
- **Update existing:** `StockCountTest` grant `stock.audit` → split into `view_count`
  (read) and `count` (write) as appropriate.
- **Migration test (or assertion):** a role with old `stock.view` ends up with
  `module + view + view_dashboard + view_events` after migration.

## Out of scope
- Hierarchical treatment for other modules (Tickets, Assets, …) — they keep the flat card.
- Removing the Stock Count or Write-off features (already handled earlier in the session:
  `stock.manage_warehouse` / `stock.audit` / `stock.delete` removed from the card;
  `stock.delete` write-off remains super-only via `isSuper()`).

## Risks
- **Cross-tab data reuse** (movement log feeds both Events tab and Dashboard widget) is
  handled by coupling resolution #1; verify no other consumer of `useStockMovements`
  breaks (`dashboard-tab.tsx`, `movements-tab.tsx` are the only two today).
- **Migration on live DB** writes new `role_permissions` rows; it is additive and
  idempotent (use `updateOrCreate`).
- **Normalization** must run on every save path; if bypassed, an orphan child grant
  could be stored (harmless for `hasPermission` since the matrix can't produce it, but
  the normalizer is the guarantee).
