# Design: Granular Administration Settings Permissions

**Date:** 2026-05-31
**Status:** Approved (subject to later adjustment)
**Module:** Permission Management (#7) × Settings (#11)

## Goal

Make the Administration **Settings** access controllable per section instead of the
current monolithic `system.edit_settings` permission. Split into **9 granular
permissions**, enforce them on the backend, and hide unauthorized tabs in the UI.

The 9 Setting Controls: **Company, Branding, Display, Master Data, Email Setting,
Ticket & SLA, Assets, Workflows, Security**.

## Approved Decisions

1. **Key structure:** Introduce a `settings.*` namespace with 9 keys; **remove**
   `system.edit_settings` entirely (drop from catalog + migrate away).
   Email moves from `system.edit_settings` → `settings.email`.
2. **Default grants:** **super only** (super bypasses via `Permissions::all()`).
   No `settings.*` granted to any other role at seed time — admins are granted
   later through the Permission matrix UI.
3. **Frontend behaviour:** When a user lacks a section's permission, **hide the
   tab entirely**. If they have **no** `settings.*` permission at all, the
   Settings page renders `<NoAccess/>`.
4. **Enforcement approach:** **B — split endpoints per section + a reusable
   `permission` route middleware.**

## Current State (baseline)

- Permission catalog source of truth: `app/Support/Permissions.php`
  (`catalog()`, `all()`, `defaults()`).
- Resolution: `User::permissions()` (super → `Permissions::all()`),
  `User::hasPermission()` (super-bypass built in).
- Settings backend (`app/Http/Controllers/Api/SettingsController.php`):
  - `update()` is **monolithic** — one `PUT /settings` validates Company,
    Branding, Display, Assets (`asset_status_colors`), SLA (`ticket_sla`)
    fields together, gated by `isSuper()`.
  - `uploadLogo`/`deleteLogo` → `isSuper()`.
  - `updateSecurity` → `isSuper()`; `security()` (GET) is open to any authed user
    (session-timeout hook reads it every load).
  - `mailSettings`/`updateMailSettings`/`testMail` → `hasPermission('system.edit_settings')`.
- `GET /settings` is **public** (theme/branding loaded at boot).
- Master Data: `apiResource` for brands, asset-models, categories, vendors,
  warehouses, units, stock-statuses, warranty-types (+ locations). Their
  **index (read) is consumed by other modules** (Asset/Contract/Stock forms).
- Frontend: `pages/settings/index.tsx` has **zero** permission gating today;
  `services/settingsApi.ts` sends several sections through the same `PUT /settings`.
- Permission UI: `permission-labels.ts` has stub `settings.branding/sla/masterdata/integrations`
  (not in `LIVE`); matrix renders by module from `Permissions::catalog()`.

## Design

### 1. Permission catalog (`app/Support/Permissions.php`)

- Add a new module group `settings` with 9 actions:

  | Key | Section | Backend target |
  |-----|---------|----------------|
  | `settings.company`   | Company       | `PUT /settings/company` |
  | `settings.branding`  | Branding      | `PUT /settings/branding` + logo upload/delete |
  | `settings.display`   | Display       | `PUT /settings/display` |
  | `settings.masterdata`| Master Data   | master-data write routes |
  | `settings.email`     | Email Setting | mail GET/PUT/test |
  | `settings.sla`       | Ticket & SLA  | `PUT /settings/sla` |
  | `settings.assets`    | Assets        | `PUT /settings/assets` |
  | `settings.workflows` | Workflows     | (placeholder tab gate only — no endpoint) |
  | `settings.security`  | Security      | `PUT /settings/security` |

- **Remove** `system.edit_settings` from the `system` group and from `defaults()`.
- `defaults()` grants **no** `settings.*` to admin/hr/user. Super is unaffected
  (returns `all()`).

### 2. Backend enforcement (middleware + controller split)

- **New middleware** `app/Http/Middleware/EnsurePermission.php`, registered as
  alias `permission` in `bootstrap/app.php`
  (`$middleware->alias(['permission' => EnsurePermission::class])`):

  ```php
  public function handle(Request $request, Closure $next, string $key): Response
  {
      abort_unless((bool) $request->user()?->hasPermission($key), 403);
      return $next($request);
  }
  ```
  `hasPermission()` already grants super everything, so super passes all gates.

- **Split `SettingsController::update()`** into per-section methods, each
  validating only its own fields (rules moved verbatim from the current `update()`),
  then `AppSetting::put()` as today:
  - `updateCompany`  — company_name, legal_name, tax_id, industry, address, country, currency, timezone
  - `updateBranding` — brand_name, brand_sub
  - `updateDisplay`  — theme_accent, theme_density, theme_radius
  - `updateAssets`   — asset_status_colors (JSON)
  - `updateSla`      — ticket_sla (JSON)
  - Keep existing: `uploadLogo`/`deleteLogo` (branding), `updateSecurity`/`security`,
    `mailSettings`/`updateMailSettings`/`testMail`.
  - The in-controller `abort_unless(isSuper())` / `hasPermission('system.edit_settings')`
    checks are **removed** — enforcement moves to route middleware.

- **Routes** (`routes/api.php`) — replace the single `PUT /settings`:

  ```php
  Route::get('settings', [SettingsController::class, 'show']);            // public (unchanged)

  Route::put('settings/company',  [SettingsController::class, 'updateCompany'])->middleware('permission:settings.company');
  Route::put('settings/branding', [SettingsController::class, 'updateBranding'])->middleware('permission:settings.branding');
  Route::post('settings/logo',    [SettingsController::class, 'uploadLogo'])->middleware('permission:settings.branding');
  Route::delete('settings/logo',  [SettingsController::class, 'deleteLogo'])->middleware('permission:settings.branding');
  Route::put('settings/display',  [SettingsController::class, 'updateDisplay'])->middleware('permission:settings.display');
  Route::put('settings/assets',   [SettingsController::class, 'updateAssets'])->middleware('permission:settings.assets');
  Route::put('settings/sla',      [SettingsController::class, 'updateSla'])->middleware('permission:settings.sla');

  Route::get('settings/mail',       [SettingsController::class, 'mailSettings'])->middleware('permission:settings.email');
  Route::put('settings/mail',       [SettingsController::class, 'updateMailSettings'])->middleware('permission:settings.email');
  Route::post('settings/mail/test', [SettingsController::class, 'testMail'])->middleware('permission:settings.email');

  Route::get('settings/security', [SettingsController::class, 'security']);   // open (session-timeout hook) — unchanged
  Route::put('settings/security', [SettingsController::class, 'updateSecurity'])->middleware('permission:settings.security');
  ```

### 3. Master Data gating (write-only)

Reads are consumed across modules, so only **store/update/destroy** require
`settings.masterdata`; **index stays open**. Split each resource's read from its
writes and wrap the writes in a `permission:settings.masterdata` group:

```php
// index (read) stays available to any authed user
Route::get('brands', [BrandController::class, 'index']);
// ... same for asset-models, categories, vendors, warehouses, units,
//     stock-statuses, warranty-types, locations

Route::middleware('permission:settings.masterdata')->group(function () {
    Route::post('brands', ...); Route::put('brands/{brand}', ...); Route::delete('brands/{brand}', ...);
    // ... repeated for all 9 resources (8 master-data + locations)
});
```

- **locations** currently sits under the "Employee module" comment
  (`routes/api.php:73`) but is surfaced in Settings → Master Data, so its writes
  join the `settings.masterdata` group. Before moving, verify no other caller
  expects a different permission for location writes.
- Implementation may use a small loop/helper to avoid repeating three lines per
  resource, as long as the resulting routes match the apiResource names.

### 4. Migration (live-DB safe — no reset)

The app runs on real data; ship an additive migration only.

`database/migrations/<ts>_drop_edit_settings_permission.php`:
```php
public function up(): void {
    DB::table('role_permissions')->where('permission', 'system.edit_settings')->delete();
}
public function down(): void { /* no-op: key no longer defined in catalog */ }
```

- The 9 new keys need **no backfill** — absence of a row means "not granted",
  which matches the "super only" decision.
- `php artisan migrate:fresh --seed` (dev) remains correct because the seeder
  reads from the updated `Permissions::all()`.

### 5. Frontend

**5.1 `resources/js/lib/permission-labels.ts`**
- Add 9 `settings.*` entries to `ACTIONS` with EN/TH labels.
- Remove `system.edit_settings` and the `settings.integrations` stub
  (replaced by `settings.workflows`).
- Add all 9 keys to the `LIVE` set; remove `system.edit_settings` from `LIVE`.
- Result: the matrix shows a "Setting" group with 9 live toggles (no "Coming soon").

**5.2 `resources/js/services/settingsApi.ts`** — point each section at its own endpoint:
- `updateCompany` → `PUT /settings/company` (split out from the current combined `update`)
- `updateBranding` → `PUT /settings/branding`
- `updateDisplay` → `PUT /settings/display`
- `updateAssetColors` → `PUT /settings/assets`
- `updateTicketSla` → `PUT /settings/sla`
- mail / security / logo methods unchanged.
- Update the matching hooks (`use-settings`) and the Company/Branding tab save
  handlers (Company and Branding are already separate tabs in the UI).

**5.3 `resources/js/pages/settings/index.tsx`** — gate sections:
```ts
const { can } = useAuth();
const nav = ALL_SECTIONS
  .map(s => ({ ...s, perm: `settings.${s.permKey}` }))
  .filter(s => can(s.perm));      // super: can() true for all
if (nav.length === 0) return <NoAccess/>;
// default active section = nav[0].id
```
Each of the 9 sections carries its permission key; tabs the user can't access
never render.

**5.4 Main nav (`resources/js/lib/nav.ts` / sidebar)**
- Show the "Settings" entry when the user has any `settings.*` permission or is
  super. Inspect the current nav gating mechanism first and follow its existing
  pattern (role-based vs permission-based) rather than inventing a new one.

### 6. Testing (PHPUnit feature tests)

- **Per-section endpoint:** a role granted `settings.<x>` → write returns 200;
  a role without it → 403; super → 200. Cover company, branding, display, assets,
  sla, email (mail), security, plus logo upload (branding).
- **Master Data:** without `settings.masterdata`, store/update/destroy → 403,
  but index → 200 (reads stay open). With it → writes succeed.
- **Route removal:** `PUT /settings` (combined) no longer exists; new section
  routes resolve.
- **Catalog:** `system.edit_settings` is absent from `Permissions::all()`.
- Frontend has no JS unit-test runner — verify with `tsc --noEmit`, `eslint`,
  and manual checks.

Use existing model factories and role/permission seeding helpers; follow the
conventions of current Feature tests.

## Out of Scope

- Real Workflow settings (tab stays a placeholder; only the permission + tab gate
  are added).
- Email **Templates** module (#9) — a separate page from Email Setting/SMTP.
- Per-user display preferences (separate `preferences` endpoint, unaffected).

## Risks / Notes

- `locations` write routes move into the master-data permission group — confirm
  no caller relies on the old (auth-only) gating.
- `GET /settings` and `GET /settings/security` remain open by design; only writes
  are gated. Don't gate reads or other modules' lookup forms will break.
- Splitting `settingsApi.update` into company/branding means the two tabs save
  independently — make sure both tab save buttons are wired to the right method.
