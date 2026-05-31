# Granular Administration Settings Permissions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic `system.edit_settings` permission with 9 granular `settings.*` permissions, enforced per Settings section on the backend (route middleware) and reflected in the UI (hidden tabs).

**Architecture:** Add a `settings` module to the permission catalog; introduce a reusable `permission` route middleware; split `SettingsController::update()` into per-section endpoints each gated by middleware; gate Master Data writes (read stays open); hide unauthorized tabs in the Settings page and the main nav entry. Super bypasses all checks via `User::hasPermission()`.

**Tech Stack:** Laravel 12 (PHPUnit feature/unit tests), React 19 + TypeScript, React Query, Tailwind. DB driver: MySQL (live data — additive migration only).

**Spec:** `docs/superpowers/specs/2026-05-31-settings-permissions-design.md`

---

## The 9 permission keys

| Key | Section tab | Backend endpoint |
|-----|-------------|------------------|
| `settings.company` | Company | `PUT /settings/company` |
| `settings.branding` | Branding | `PUT /settings/branding`, logo upload/delete |
| `settings.display` | Display | `PUT /settings/display` |
| `settings.masterdata` | Master Data | master-data writes (9 resources) |
| `settings.email` | Email Setting | `GET/PUT /settings/mail`, mail test |
| `settings.sla` | Ticket & SLA | `PUT /settings/sla` |
| `settings.assets` | Assets | `PUT /settings/assets` |
| `settings.workflows` | Workflows | (placeholder tab — gate only) |
| `settings.security` | Security | `PUT /settings/security` |

**Decisions locked in:** super-only defaults (no role granted at seed); hide tab when permission missing; Warehouse writes move from `stock.manage_warehouse` to `settings.masterdata`.

---

## File Structure

**Backend — modify:**
- `app/Support/Permissions.php` — add `settings` catalog group, drop `system.edit_settings`.
- `app/Http/Middleware/EnsurePermission.php` — **create**: reusable permission gate.
- `bootstrap/app.php` — register middleware alias `permission`.
- `app/Http/Controllers/Api/SettingsController.php` — split `update()` into per-section methods; drop in-method permission checks (moved to routes).
- `routes/api.php` — replace `PUT /settings`; add per-section routes with middleware; split Master Data read vs write.
- `app/Http/Controllers/Api/{Brand,AssetModel,Category,Vendor,Warehouse,Unit,StockStatus,WarrantyType,Location}Controller.php` — remove in-method `abort_unless` (gate moves to route middleware).
- `database/migrations/<ts>_drop_edit_settings_permission.php` — **create**: delete stale rows.

**Backend — tests:**
- `tests/Feature/PermissionCatalogTest.php` — **create**.
- `tests/Feature/EnsurePermissionMiddlewareTest.php` — **create**.
- `tests/Feature/SettingsSectionPermissionsTest.php` — **create** (company/branding/display/email).
- `tests/Feature/AssetStatusColorsTest.php`, `tests/Feature/TicketSlaTest.php`, `tests/Feature/SecuritySettingsTest.php`, `tests/Feature/MasterDataTest.php` — **modify** (endpoints + permissions changed).

**Frontend — modify:**
- `resources/js/lib/permission-labels.ts` — settings labels + LIVE set.
- `resources/js/services/settingsApi.ts` — split endpoints + payload types.
- `resources/js/hooks/use-settings.ts` — per-section mutation hooks.
- `resources/js/pages/settings/index.tsx` — split Company/Branding save; permission-gated nav; NoAccess.
- `resources/js/lib/nav.ts` — Settings entry gating.

---

## Conventions to follow (read before starting)

- Tests are **PHPUnit** classes (`class X extends Tests\TestCase`, `use RefreshDatabase;`, `test_*` methods). NOT Pest.
- Create a user with a role: `User::factory()->create(['role' => 'super'])` (role-key mutator resolves to `role_id`).
- Grant one permission to a non-super user:
  `RolePermission::create(['role_id' => $user->role_id, 'permission' => 'settings.company', 'allowed' => true]);`
- Hit endpoints with `$this->actingAs($user)->putJson('/api/...', [...])->assertOk()/assertForbidden()`.
- After editing PHP, run `vendor/bin/pint --dirty --format agent`.
- Run a single test file: `php artisan test --compact tests/Feature/FileName.php`.
- Frontend has no JS unit runner — verify with `npx tsc --noEmit` and `npx eslint <file>`.

---

## Task 1: Add `settings.*` catalog keys, drop `system.edit_settings`

**Files:**
- Modify: `app/Support/Permissions.php:23`
- Test: `tests/Feature/PermissionCatalogTest.php` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/PermissionCatalogTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Support\Permissions;
use Tests\TestCase;

class PermissionCatalogTest extends TestCase
{
    public function test_settings_module_has_nine_granular_keys(): void
    {
        $expected = [
            'settings.company', 'settings.branding', 'settings.display',
            'settings.masterdata', 'settings.email', 'settings.sla',
            'settings.assets', 'settings.workflows', 'settings.security',
        ];

        foreach ($expected as $key) {
            $this->assertContains($key, Permissions::all(), "missing {$key}");
        }
    }

    public function test_legacy_edit_settings_key_is_removed(): void
    {
        $this->assertNotContains('system.edit_settings', Permissions::all());
    }

    public function test_settings_permissions_are_not_granted_by_default(): void
    {
        foreach (Permissions::defaults() as $role => $granted) {
            foreach ($granted as $key) {
                $this->assertStringStartsNotWith('settings.', $key, "{$role} should not be granted {$key}");
            }
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact tests/Feature/PermissionCatalogTest.php`
Expected: FAIL — `settings.company` missing; `system.edit_settings` still present.

- [ ] **Step 3: Edit the catalog**

In `app/Support/Permissions.php`, change the `system` line and add a `settings` group. Replace line 23:
```php
            'system' => ['manage_permissions', 'manage_roles', 'manage_groups', 'configure_notifications', 'view_audit'],
            'settings' => ['company', 'branding', 'display', 'masterdata', 'email', 'sla', 'assets', 'workflows', 'security'],
```
(Removed `edit_settings` from `system`; added the `settings` group.)

`defaults()` already grants no `settings.*` and no longer references `edit_settings` — no change needed there.

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact tests/Feature/PermissionCatalogTest.php`
Expected: PASS (3 tests).

- [ ] **Step 5: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Support/Permissions.php tests/Feature/PermissionCatalogTest.php
git commit -m "feat(permissions): add settings.* catalog keys, drop system.edit_settings"
```

---

## Task 2: Create `EnsurePermission` middleware + register alias

**Files:**
- Create: `app/Http/Middleware/EnsurePermission.php`
- Modify: `bootstrap/app.php:14-16`
- Test: `tests/Feature/EnsurePermissionMiddlewareTest.php` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/EnsurePermissionMiddlewareTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class EnsurePermissionMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    private function requestFor(User $user): Request
    {
        $request = Request::create('/api/settings/company', 'PUT');
        $request->setUserResolver(fn () => $user);

        return $request;
    }

    public function test_blocks_user_without_permission(): void
    {
        $request = $this->requestFor(User::factory()->create(['role' => 'user']));

        $this->expectException(HttpException::class);
        (new EnsurePermission)->handle($request, fn () => response('ok'), 'settings.company');
    }

    public function test_allows_user_with_permission(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'settings.company', 'allowed' => true]);

        $response = (new EnsurePermission)->handle($this->requestFor($user), fn () => response('ok'), 'settings.company');

        $this->assertSame('ok', (string) $response->getContent());
    }

    public function test_super_bypasses_any_permission(): void
    {
        $response = (new EnsurePermission)->handle(
            $this->requestFor(User::factory()->create(['role' => 'super'])),
            fn () => response('ok'),
            'settings.company'
        );

        $this->assertSame('ok', (string) $response->getContent());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact tests/Feature/EnsurePermissionMiddlewareTest.php`
Expected: FAIL — class `App\Http\Middleware\EnsurePermission` not found.

- [ ] **Step 3: Create the middleware**

Create `app/Http/Middleware/EnsurePermission.php`:
```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePermission
{
    /**
     * Aborts with 403 unless the authenticated user holds the given permission key.
     * Super admins always pass (handled inside User::hasPermission()).
     */
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        abort_unless((bool) $request->user()?->hasPermission($permission), 403);

        return $next($request);
    }
}
```

- [ ] **Step 4: Register the alias**

In `bootstrap/app.php`, extend the `withMiddleware` closure (currently only `$middleware->statefulApi();`):
```php
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->statefulApi();
        $middleware->alias([
            'permission' => \App\Http\Middleware\EnsurePermission::class,
        ]);
    })
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php artisan test --compact tests/Feature/EnsurePermissionMiddlewareTest.php`
Expected: PASS (3 tests).

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Middleware/EnsurePermission.php bootstrap/app.php tests/Feature/EnsurePermissionMiddlewareTest.php
git commit -m "feat(permissions): add EnsurePermission route middleware (alias: permission)"
```

---

## Task 3: Split Company endpoint (`PUT /settings/company`)

**Files:**
- Modify: `app/Http/Controllers/Api/SettingsController.php` (split `update()`)
- Modify: `routes/api.php:46`
- Test: `tests/Feature/SettingsSectionPermissionsTest.php` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/SettingsSectionPermissionsTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsSectionPermissionsTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string $permission): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => $permission, 'allowed' => true]);

        return $user;
    }

    public function test_company_requires_settings_company_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->putJson('/api/settings/company', ['company_name' => 'Acme'])
            ->assertForbidden();
    }

    public function test_granted_user_can_update_company(): void
    {
        $this->actingAs($this->userWith('settings.company'))
            ->putJson('/api/settings/company', ['company_name' => 'Acme', 'currency' => 'USD'])
            ->assertOk()
            ->assertJsonPath('data.company_name', 'Acme')
            ->assertJsonPath('data.currency', 'USD');

        $this->assertSame('Acme', AppSetting::get('company_name'));
    }

    public function test_super_can_update_company(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->putJson('/api/settings/company', ['company_name' => 'Acme'])
            ->assertOk();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact tests/Feature/SettingsSectionPermissionsTest.php`
Expected: FAIL — `PUT /api/settings/company` route does not exist (404/405).

- [ ] **Step 3: Add `updateCompany()` to the controller**

In `app/Http/Controllers/Api/SettingsController.php`, add this method (keep the existing `update()` for now — later tasks remove it). Place after `show()`:
```php
    /** Company information (Settings -> Company). Gated by route middleware permission:settings.company. */
    public function updateCompany(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_name' => ['sometimes', 'required', 'string', 'max:150'],
            'legal_name' => ['sometimes', 'nullable', 'string', 'max:150'],
            'tax_id' => ['sometimes', 'nullable', 'string', 'max:50'],
            'industry' => ['sometimes', 'nullable', 'string', 'max:100'],
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'country' => ['sometimes', 'nullable', 'string', 'max:100'],
            'currency' => ['sometimes', 'nullable', 'string', 'max:20'],
            'timezone' => ['sometimes', 'nullable', 'string', 'max:60'],
        ]);

        foreach ($data as $key => $value) {
            AppSetting::put($key, $value === null ? '' : (string) $value);
        }
        AuditLog::record('Updated company settings', implode(', ', array_keys($data)));

        return $this->show();
    }
```

- [ ] **Step 4: Add the route**

In `routes/api.php`, immediately after the public `GET settings` is fine, but keep writes inside the auth group. Inside the `auth:sanctum` group, add (next to the existing settings routes):
```php
    Route::put('settings/company', [SettingsController::class, 'updateCompany'])
        ->middleware('permission:settings.company')->name('api.settings.company');
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php artisan test --compact tests/Feature/SettingsSectionPermissionsTest.php`
Expected: PASS (3 tests).

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/SettingsController.php routes/api.php tests/Feature/SettingsSectionPermissionsTest.php
git commit -m "feat(settings): company endpoint gated by settings.company"
```

---

## Task 4: Split Branding endpoint + logo (`PUT /settings/branding`, logo)

**Files:**
- Modify: `app/Http/Controllers/Api/SettingsController.php` (add `updateBranding()`, drop `isSuper()` from `uploadLogo`/`deleteLogo`)
- Modify: `routes/api.php` (branding + logo routes)
- Test: `tests/Feature/SettingsSectionPermissionsTest.php` (add cases)

- [ ] **Step 1: Add the failing tests**

Append to `SettingsSectionPermissionsTest`:
```php
    public function test_branding_requires_settings_branding_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->putJson('/api/settings/branding', ['brand_name' => 'IT'])
            ->assertForbidden();
    }

    public function test_granted_user_can_update_branding(): void
    {
        $this->actingAs($this->userWith('settings.branding'))
            ->putJson('/api/settings/branding', ['brand_name' => 'Inaba IT', 'brand_sub' => 'Desk'])
            ->assertOk()
            ->assertJsonPath('data.brand_name', 'Inaba IT');

        $this->assertSame('Inaba IT', AppSetting::get('brand_name'));
    }

    public function test_logo_upload_requires_settings_branding_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->postJson('/api/settings/logo', [])
            ->assertForbidden();
    }
```

- [ ] **Step 2: Run to verify fail**

Run: `php artisan test --compact tests/Feature/SettingsSectionPermissionsTest.php`
Expected: FAIL — `/settings/branding` missing; logo still returns 403 only for non-super but our test user is `user` so 403 passes for upload? Note: `test_logo_upload_requires_settings_branding_permission` already passes if logo stays super-only — but `assertForbidden` is the same result. To make it meaningful, the next steps switch the gate to middleware and the assertion still holds for `user`. The branding cases will fail (404/405).

- [ ] **Step 3: Add `updateBranding()` and remove logo `isSuper()` checks**

Add method to `SettingsController`:
```php
    /** Branding name/subtitle (Settings -> Branding). Logo upload/delete are separate routes, same permission. */
    public function updateBranding(Request $request): JsonResponse
    {
        $data = $request->validate([
            'brand_name' => ['sometimes', 'required', 'string', 'max:60'],
            'brand_sub' => ['sometimes', 'nullable', 'string', 'max:60'],
        ]);

        foreach ($data as $key => $value) {
            AppSetting::put($key, $value === null ? '' : (string) $value);
        }
        AuditLog::record('Updated branding settings', implode(', ', array_keys($data)));

        return $this->show();
    }
```
In `uploadLogo()` delete the line `abort_unless((bool) $request->user()?->isSuper(), 403);` (currently line 101).
In `deleteLogo()` delete the line `abort_unless((bool) $request->user()?->isSuper(), 403);` (currently line 123).

- [ ] **Step 4: Update routes**

In `routes/api.php`, change the logo routes to add middleware and add the branding route:
```php
    Route::put('settings/branding', [SettingsController::class, 'updateBranding'])
        ->middleware('permission:settings.branding')->name('api.settings.branding');
    Route::post('settings/logo', [SettingsController::class, 'uploadLogo'])
        ->middleware('permission:settings.branding')->name('api.settings.logo');
    Route::delete('settings/logo', [SettingsController::class, 'deleteLogo'])
        ->middleware('permission:settings.branding')->name('api.settings.logo.delete');
```

- [ ] **Step 5: Run to verify pass**

Run: `php artisan test --compact tests/Feature/SettingsSectionPermissionsTest.php`
Expected: PASS (6 tests).

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/SettingsController.php routes/api.php tests/Feature/SettingsSectionPermissionsTest.php
git commit -m "feat(settings): branding + logo gated by settings.branding"
```

---

## Task 5: Split Display endpoint (`PUT /settings/display`)

**Files:**
- Modify: `app/Http/Controllers/Api/SettingsController.php` (add `updateDisplay()`)
- Modify: `routes/api.php`
- Test: `tests/Feature/SettingsSectionPermissionsTest.php` (add cases)

- [ ] **Step 1: Add failing tests**

Append to `SettingsSectionPermissionsTest`:
```php
    public function test_display_requires_settings_display_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->putJson('/api/settings/display', ['theme_accent' => '#123456'])
            ->assertForbidden();
    }

    public function test_granted_user_can_update_display(): void
    {
        $this->actingAs($this->userWith('settings.display'))
            ->putJson('/api/settings/display', ['theme_accent' => '#123456', 'theme_density' => 'compact', 'theme_radius' => 12])
            ->assertOk()
            ->assertJsonPath('data.theme_accent', '#123456')
            ->assertJsonPath('data.theme_radius', 12);
    }

    public function test_display_rejects_invalid_accent(): void
    {
        $this->actingAs($this->userWith('settings.display'))
            ->putJson('/api/settings/display', ['theme_accent' => 'blue'])
            ->assertStatus(422)->assertJsonValidationErrors('theme_accent');
    }
```

- [ ] **Step 2: Run to verify fail**

Run: `php artisan test --compact tests/Feature/SettingsSectionPermissionsTest.php`
Expected: FAIL — `/settings/display` route missing.

- [ ] **Step 3: Add `updateDisplay()`**

Add to `SettingsController`:
```php
    /** System-wide display theme (Settings -> Display). Gated by permission:settings.display. */
    public function updateDisplay(Request $request): JsonResponse
    {
        $data = $request->validate([
            'theme_accent' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'theme_density' => ['sometimes', 'in:compact,normal,cozy'],
            'theme_radius' => ['sometimes', 'integer', 'min:0', 'max:20'],
        ]);

        foreach ($data as $key => $value) {
            AppSetting::put($key, (string) $value);
        }
        AuditLog::record('Updated display settings', implode(', ', array_keys($data)));

        return $this->show();
    }
```

- [ ] **Step 4: Add the route**

```php
    Route::put('settings/display', [SettingsController::class, 'updateDisplay'])
        ->middleware('permission:settings.display')->name('api.settings.display');
```

- [ ] **Step 5: Run to verify pass**

Run: `php artisan test --compact tests/Feature/SettingsSectionPermissionsTest.php`
Expected: PASS (9 tests).

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/SettingsController.php routes/api.php tests/Feature/SettingsSectionPermissionsTest.php
git commit -m "feat(settings): display endpoint gated by settings.display"
```

---

## Task 6: Split Assets endpoint (`PUT /settings/assets`)

**Files:**
- Modify: `app/Http/Controllers/Api/SettingsController.php` (add `updateAssets()`)
- Modify: `routes/api.php`
- Test: `tests/Feature/AssetStatusColorsTest.php` (retarget endpoint + permission)

- [ ] **Step 1: Update the existing test to the new endpoint**

In `tests/Feature/AssetStatusColorsTest.php`:
- Add `use App\Models\RolePermission;` import.
- Replace the three `putJson('/api/settings', [...])` calls with `putJson('/api/settings/assets', [...])`.
- Change `test_non_super_cannot_update_asset_status_colors` to assert a plain user (no permission) gets 403 (already does via `role => 'user'`) — keep as is but point at `/api/settings/assets`.
- Add a granted-user case:
```php
    public function test_granted_user_can_update_asset_colors(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'settings.assets', 'allowed' => true]);

        $this->actingAs($user)
            ->putJson('/api/settings/assets', ['asset_status_colors' => ['deployed' => '#7c3aed']])
            ->assertOk()
            ->assertJsonPath('data.asset_status_colors.deployed', '#7c3aed');
    }
```

- [ ] **Step 2: Run to verify fail**

Run: `php artisan test --compact tests/Feature/AssetStatusColorsTest.php`
Expected: FAIL — `/settings/assets` route missing.

- [ ] **Step 3: Add `updateAssets()`**

Add to `SettingsController`:
```php
    /** Asset status badge colors (Settings -> Assets). Gated by permission:settings.assets. */
    public function updateAssets(Request $request): JsonResponse
    {
        $data = $request->validate([
            'asset_status_colors' => ['required', 'array'],
            'asset_status_colors.*' => ['string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);

        AppSetting::put('asset_status_colors', json_encode($data['asset_status_colors']));
        AuditLog::record('Updated asset settings', 'asset_status_colors');

        return $this->show();
    }
```

- [ ] **Step 4: Add the route**

```php
    Route::put('settings/assets', [SettingsController::class, 'updateAssets'])
        ->middleware('permission:settings.assets')->name('api.settings.assets');
```

- [ ] **Step 5: Run to verify pass**

Run: `php artisan test --compact tests/Feature/AssetStatusColorsTest.php`
Expected: PASS.

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/SettingsController.php routes/api.php tests/Feature/AssetStatusColorsTest.php
git commit -m "feat(settings): asset colors endpoint gated by settings.assets"
```

---

## Task 7: Split SLA endpoint (`PUT /settings/sla`)

**Files:**
- Modify: `app/Http/Controllers/Api/SettingsController.php` (add `updateSla()`)
- Modify: `routes/api.php`
- Test: `tests/Feature/TicketSlaTest.php` (retarget endpoint + permission)

- [ ] **Step 1: Inspect & update the SLA test**

Open `tests/Feature/TicketSlaTest.php`. For every call that saves SLA via `putJson('/api/settings', ['ticket_sla' => ...])`, change the URL to `/api/settings/sla`. Where the test acts as a non-super user expecting 403, keep that. Add `use App\Models\RolePermission;` and a granted case:
```php
    public function test_granted_user_can_update_sla(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'settings.sla', 'allowed' => true]);

        $this->actingAs($user)
            ->putJson('/api/settings/sla', ['ticket_sla' => ['critical' => ['response' => 15, 'resolve' => 4]]])
            ->assertOk();
    }
```
(If `TicketSlaTest` reads SLA from `GET /api/settings` or asserts dashboard SLA, leave those untouched — only the **write** URL changes.)

- [ ] **Step 2: Run to verify fail**

Run: `php artisan test --compact tests/Feature/TicketSlaTest.php`
Expected: FAIL — `/settings/sla` route missing.

- [ ] **Step 3: Add `updateSla()`**

Add to `SettingsController`:
```php
    /** Per-priority ticket SLA targets (Settings -> Ticket & SLA). Gated by permission:settings.sla. */
    public function updateSla(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ticket_sla' => ['required', 'array'],
            'ticket_sla.*.response' => ['required', 'integer', 'min:1', 'max:10080'],
            'ticket_sla.*.resolve' => ['required', 'integer', 'min:1', 'max:8760'],
        ]);

        AppSetting::put('ticket_sla', json_encode($data['ticket_sla']));
        AuditLog::record('Updated SLA settings', 'ticket_sla');

        return $this->show();
    }
```

- [ ] **Step 4: Add the route**

```php
    Route::put('settings/sla', [SettingsController::class, 'updateSla'])
        ->middleware('permission:settings.sla')->name('api.settings.sla');
```

- [ ] **Step 5: Run to verify pass**

Run: `php artisan test --compact tests/Feature/TicketSlaTest.php`
Expected: PASS.

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/SettingsController.php routes/api.php tests/Feature/TicketSlaTest.php
git commit -m "feat(settings): SLA endpoint gated by settings.sla"
```

---

## Task 8: Remove the monolithic `update()` and retarget Email (mail) to `settings.email`

**Files:**
- Modify: `app/Http/Controllers/Api/SettingsController.php` (delete `update()`; swap mail permission)
- Modify: `routes/api.php` (delete `PUT /settings`; add mail middleware)
- Test: `tests/Feature/SettingsSectionPermissionsTest.php` (add mail cases + route-removed case)

- [ ] **Step 1: Add failing tests**

Append to `SettingsSectionPermissionsTest`:
```php
    public function test_mail_settings_require_settings_email_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->getJson('/api/settings/mail')
            ->assertForbidden();
    }

    public function test_granted_user_can_read_mail_settings(): void
    {
        $this->actingAs($this->userWith('settings.email'))
            ->getJson('/api/settings/mail')
            ->assertOk()
            ->assertJsonStructure(['data' => ['host', 'port', 'has_password', 'from_address']]);
    }

    public function test_legacy_combined_settings_route_is_gone(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->putJson('/api/settings', ['company_name' => 'X'])
            ->assertStatus(405); // method not allowed — only GET /settings remains
    }
```

- [ ] **Step 2: Run to verify fail**

Run: `php artisan test --compact tests/Feature/SettingsSectionPermissionsTest.php`
Expected: FAIL — mail GET still requires `system.edit_settings` (now `user` lacks it → 403 passes, but granted-user test fails because `settings.email` isn't the gate yet); `PUT /settings` still exists (200, not 405).

- [ ] **Step 3: Delete `update()` and swap mail permission checks**

In `SettingsController`:
- Delete the entire `update()` method (the monolithic one, currently lines 56-97).
- In `mailSettings()`, `updateMailSettings()`, `testMail()`, delete the three
  `abort_unless((bool) $request->user()?->hasPermission('system.edit_settings'), 403);` lines
  (currently lines 176, 197, 225). Enforcement moves to route middleware.

- [ ] **Step 4: Update routes**

In `routes/api.php`:
- **Delete** `Route::put('settings', [SettingsController::class, 'update'])->name('api.settings.update');` (line 46).
- Add middleware to the mail routes:
```php
    Route::get('settings/mail', [SettingsController::class, 'mailSettings'])
        ->middleware('permission:settings.email')->name('api.settings.mail');
    Route::put('settings/mail', [SettingsController::class, 'updateMailSettings'])
        ->middleware('permission:settings.email')->name('api.settings.mail.update');
    Route::post('settings/mail/test', [SettingsController::class, 'testMail'])
        ->middleware('permission:settings.email')->name('api.settings.mail.test');
```

- [ ] **Step 5: Run to verify pass**

Run: `php artisan test --compact tests/Feature/SettingsSectionPermissionsTest.php`
Expected: PASS (all cases).

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/SettingsController.php routes/api.php tests/Feature/SettingsSectionPermissionsTest.php
git commit -m "feat(settings): drop combined PUT /settings; mail gated by settings.email"
```

---

## Task 9: Retarget Security to `settings.security`

**Files:**
- Modify: `app/Http/Controllers/Api/SettingsController.php` (drop `isSuper()` in `updateSecurity`)
- Modify: `routes/api.php` (add middleware to `PUT /settings/security`)
- Test: `tests/Feature/SecuritySettingsTest.php`

- [ ] **Step 1: Update the test**

In `tests/Feature/SecuritySettingsTest.php`:
- Add `use App\Models\RolePermission;`.
- Keep `test_non_super_cannot_update_security_settings` (a `user` with no permission → 403; still valid).
- Add a granted-user case:
```php
    public function test_granted_user_can_update_security_settings(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'settings.security', 'allowed' => true]);

        $this->actingAs($user)
            ->putJson('/api/settings/security', ['session_timeout_minutes' => 15, 'password_expiry_days' => 0])
            ->assertOk()
            ->assertJsonPath('data.session_timeout_minutes', 15);
    }
```
Leave `GET /api/settings/security` tests unchanged (it stays open to any authed user).

- [ ] **Step 2: Run to verify fail**

Run: `php artisan test --compact tests/Feature/SecuritySettingsTest.php`
Expected: FAIL — granted admin gets 403 (still gated by `isSuper()`).

- [ ] **Step 3: Drop the `isSuper()` check**

In `SettingsController::updateSecurity()` delete the line
`abort_unless((bool) $request->user()?->isSuper(), 403);` (currently line 146).
Leave `security()` (GET) untouched — it stays open.

- [ ] **Step 4: Add the middleware**

In `routes/api.php`, change the security update route (keep GET open):
```php
    Route::get('settings/security', [SettingsController::class, 'security'])->name('api.settings.security');
    Route::put('settings/security', [SettingsController::class, 'updateSecurity'])
        ->middleware('permission:settings.security')->name('api.settings.security.update');
```

- [ ] **Step 5: Run to verify pass**

Run: `php artisan test --compact tests/Feature/SecuritySettingsTest.php`
Expected: PASS.

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/SettingsController.php routes/api.php tests/Feature/SecuritySettingsTest.php
git commit -m "feat(settings): security update gated by settings.security"
```

---

## Task 10: Gate Master Data writes with `settings.masterdata` (reads stay open)

**Files:**
- Modify: `routes/api.php` (split read vs write for 9 resources)
- Modify: `app/Http/Controllers/Api/{Brand,AssetModel,Category,Vendor,Warehouse,Unit,StockStatus,WarrantyType,Location}Controller.php` (remove in-method permission checks)
- Test: `tests/Feature/MasterDataTest.php`

- [ ] **Step 1: Update the test**

In `tests/Feature/MasterDataTest.php`:
- Add a helper for a granted user and a "no permission" user:
```php
    private function masterDataUser(): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'settings.masterdata', 'allowed' => true]);

        return $user;
    }
```
- The existing `test_regular_user_cannot_create_*` cases (role `user`, no permission) stay valid (403).
- Replace `test_non_super_user_granted_manage_warehouse_can_create`: grant `settings.masterdata` instead of `stock.manage_warehouse`:
```php
    public function test_user_granted_masterdata_can_create_warehouse(): void
    {
        $this->actingAs($this->masterDataUser())
            ->postJson('/api/warehouses', ['name' => 'Keeper Store'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Keeper Store');
    }
```
- Add a read-stays-open case:
```php
    public function test_reads_stay_open_without_masterdata_permission(): void
    {
        Brand::create(['name' => 'HP']);
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->getJson('/api/brands')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }
```

- [ ] **Step 2: Run to verify fail**

Run: `php artisan test --compact tests/Feature/MasterDataTest.php`
Expected: FAIL — warehouse create with `settings.masterdata` is 403 (still gated by `stock.manage_warehouse`); a granted user can't create brand yet (still `isSuper()`).

- [ ] **Step 3: Remove in-method permission checks from the 9 controllers**

In each of `BrandController`, `AssetModelController`, `CategoryController`, `VendorController`, `UnitController`, `StockStatusController`, `WarrantyTypeController`, `LocationController`: delete every line
`abort_unless((bool) $request->user()?->isSuper(), 403);` (3 per controller — in store/update/destroy).
In `WarehouseController`: delete every line
`abort_unless((bool) $request->user()?->hasPermission('stock.manage_warehouse'), 403);` (3 lines).

> The gate moves to route middleware in Step 4. Leave validation and all other logic intact.

- [ ] **Step 4: Split routes — reads open, writes gated**

In `routes/api.php`, replace the Master Data block (currently lines 76-83) and move `locations` write here. Read (`index`) stays open; writes go in a `permission:settings.masterdata` group:
```php
    // Master Data — reads open (consumed by Asset/Contract/Stock forms); writes gated.
    Route::get('brands', [BrandController::class, 'index'])->name('api.brands.index');
    Route::get('asset-models', [AssetModelController::class, 'index'])->name('api.asset-models.index');
    Route::get('categories', [CategoryController::class, 'index'])->name('api.categories.index');
    Route::get('vendors', [VendorController::class, 'index'])->name('api.vendors.index');
    Route::get('warehouses', [WarehouseController::class, 'index'])->name('api.warehouses.index');
    Route::get('units', [UnitController::class, 'index'])->name('api.units.index');
    Route::get('stock-statuses', [StockStatusController::class, 'index'])->name('api.stock-statuses.index');
    Route::get('warranty-types', [WarrantyTypeController::class, 'index'])->name('api.warranty-types.index');
    Route::get('locations', [LocationController::class, 'index'])->name('api.locations.index');

    Route::middleware('permission:settings.masterdata')->group(function () {
        Route::apiResource('brands', BrandController::class)->except(['show', 'index']);
        Route::apiResource('asset-models', AssetModelController::class)->except(['show', 'index']);
        Route::apiResource('categories', CategoryController::class)->except(['show', 'index']);
        Route::apiResource('vendors', VendorController::class)->except(['show', 'index']);
        Route::apiResource('warehouses', WarehouseController::class)->except(['show', 'index']);
        Route::apiResource('units', UnitController::class)->except(['show', 'index']);
        Route::apiResource('stock-statuses', StockStatusController::class)->except(['show', 'index']);
        Route::apiResource('warranty-types', WarrantyTypeController::class)->except(['show', 'index']);
        Route::apiResource('locations', LocationController::class)->except(['show', 'index']);
    });
```
Then **delete the old `locations` apiResource line** (currently line 73 under the Employee block) so locations is only defined once, here.

> Note: `stock.manage_warehouse` is now unused by any route. Leave it in the catalog (reserved); it is no longer enforced anywhere. Flagged in the spec Risks.

- [ ] **Step 5: Run to verify pass**

Run: `php artisan test --compact tests/Feature/MasterDataTest.php`
Expected: PASS.

- [ ] **Step 6: Verify no other caller depended on `locations` placement**

Run: `php artisan route:list --path=locations`
Expected: 4 routes (index open + store/put/delete under middleware). No duplicate definitions.

- [ ] **Step 7: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api routes/api.php tests/Feature/MasterDataTest.php
git commit -m "feat(settings): gate master-data writes with settings.masterdata (reads open)"
```

---

## Task 11: Live-DB migration — drop stale `system.edit_settings` rows

**Files:**
- Create: `database/migrations/2026_05_31_000000_drop_edit_settings_permission.php`

- [ ] **Step 1: Create the migration**

```bash
php artisan make:migration drop_edit_settings_permission --no-interaction
```
Then replace its body:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** Removes the retired monolithic settings permission from existing role grants. */
    public function up(): void
    {
        DB::table('role_permissions')->where('permission', 'system.edit_settings')->delete();
    }

    /** No-op: the key is no longer defined in the catalog, so there is nothing to restore. */
    public function down(): void {}
};
```

- [ ] **Step 2: Run the migration**

Run: `php artisan migrate`
Expected: migration runs OK (no data reset).

- [ ] **Step 3: Commit**

```bash
git add database/migrations/*_drop_edit_settings_permission.php
git commit -m "chore(permissions): drop stale system.edit_settings grants (live-DB safe)"
```

---

## Task 12: Frontend — permission labels + LIVE set

**Files:**
- Modify: `resources/js/lib/permission-labels.ts`

- [ ] **Step 1: Replace the settings/system action entries**

In `ACTIONS`, remove `'system.edit_settings'`, `'settings.branding'`, `'settings.sla'`, `'settings.masterdata'`, `'settings.integrations'` and add the 9 keys:
```ts
    'settings.company': { en: 'Company information', th: 'ข้อมูลบริษัท' },
    'settings.branding': { en: 'Branding & logo', th: 'แบรนด์ & โลโก้' },
    'settings.display': { en: 'Display theme', th: 'ธีมการแสดงผล' },
    'settings.masterdata': { en: 'Master Data', th: 'จัดการ Master Data' },
    'settings.email': { en: 'Email (SMTP) settings', th: 'ตั้งค่าอีเมล (SMTP)' },
    'settings.sla': { en: 'Ticket & SLA', th: 'ตั๋ว & SLA' },
    'settings.assets': { en: 'Asset settings', th: 'ตั้งค่าทรัพย์สิน' },
    'settings.workflows': { en: 'Workflow settings', th: 'ตั้งค่าเวิร์กโฟลว์' },
    'settings.security': { en: 'Security policy', th: 'นโยบายความปลอดภัย' },
```

- [ ] **Step 2: Update the LIVE set**

Remove `'system.edit_settings'` from the `LIVE` set and add the 9 keys:
```ts
    'settings.company', 'settings.branding', 'settings.display', 'settings.masterdata',
    'settings.email', 'settings.sla', 'settings.assets', 'settings.workflows', 'settings.security',
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx eslint resources/js/lib/permission-labels.ts`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add resources/js/lib/permission-labels.ts
git commit -m "feat(permissions-ui): live settings.* labels in the permission matrix"
```

---

## Task 13: Frontend — split settings API endpoints + payload types

**Files:**
- Modify: `resources/js/services/settingsApi.ts`

- [ ] **Step 1: Split the payload types**

Replace the `SettingsPayload` type (lines 36-46) with two focused payloads:
```ts
// Company info — saved via PUT /settings/company.
export type CompanyPayload = Pick<
    SettingsData,
    'company_name' | 'legal_name' | 'tax_id' | 'industry' | 'address' | 'country' | 'currency' | 'timezone'
>;

// Branding — saved via PUT /settings/branding.
export type BrandingPayload = Pick<SettingsData, 'brand_name' | 'brand_sub'>;
```

- [ ] **Step 2: Point each method at its own endpoint**

Replace `update`, `updateDisplay`, `updateAssetColors`, `updateTicketSla` (lines 89-111) with:
```ts
    updateCompany: async (payload: CompanyPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SettingsData>>('/settings/company', payload);
        return data.data;
    },

    updateBranding: async (payload: BrandingPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SettingsData>>('/settings/branding', payload);
        return data.data;
    },

    updateDisplay: async (payload: DisplayPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SettingsData>>('/settings/display', payload);
        return data.data;
    },

    updateAssetColors: async (payload: AssetColorsPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SettingsData>>('/settings/assets', payload);
        return data.data;
    },

    updateTicketSla: async (payload: TicketSlaPayload) => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<SettingsData>>('/settings/sla', payload);
        return data.data;
    },
```

- [ ] **Step 3: Verify (will show downstream type errors — expected)**

Run: `npx tsc --noEmit`
Expected: errors in `use-settings.ts` / `pages/settings/index.tsx` referencing the removed `settingsApi.update` and `SettingsPayload`. These are fixed in Tasks 14-15. Do not fix them here.

- [ ] **Step 4: Commit**

```bash
git add resources/js/services/settingsApi.ts
git commit -m "feat(settings-ui): split settingsApi into per-section endpoints"
```

---

## Task 14: Frontend — per-section mutation hooks

**Files:**
- Modify: `resources/js/hooks/use-settings.ts`

- [ ] **Step 1: Replace the import + `useUpdateSettings`**

Update the type import block (lines 2-9) to swap `SettingsPayload` for the new payloads:
```ts
import {
    settingsApi,
    type AssetColorsPayload,
    type BrandingPayload,
    type CompanyPayload,
    type DisplayPayload,
    type SettingsData,
    type TicketSlaPayload,
} from '@/services/settingsApi';
```
Replace `useUpdateSettings` (lines 115-118) with two hooks:
```ts
export function useUpdateCompany() {
    const sync = useSyncStore();
    return useMutation({ mutationFn: (payload: CompanyPayload) => settingsApi.updateCompany(payload), onSuccess: sync });
}

export function useUpdateBranding() {
    const sync = useSyncStore();
    return useMutation({ mutationFn: (payload: BrandingPayload) => settingsApi.updateBranding(payload), onSuccess: sync });
}
```
(`useUpdateDisplay`, `useUpdateAssetColors`, `useUpdateTicketSla`, `useUploadLogo`, `useResetLogo` stay as-is — their `settingsApi` methods now hit the new URLs.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: remaining errors only in `pages/settings/index.tsx` (fixed next task).

- [ ] **Step 3: Commit**

```bash
git add resources/js/hooks/use-settings.ts
git commit -m "feat(settings-ui): per-section mutation hooks (company/branding)"
```

---

## Task 15: Frontend — Settings page: split saves + permission-gated tabs

**Files:**
- Modify: `resources/js/pages/settings/index.tsx`

- [ ] **Step 1: Update imports**

- Replace the `use-settings` import (lines 37-45) `useUpdateSettings` with `useUpdateCompany` and `useUpdateBranding`.
- Update the `settingsApi` type import (line 50): replace `SettingsPayload` with `CompanyPayload, BrandingPayload`.
- Add `useAuth` and `NoAccess`:
```ts
import { useAuth } from '@/hooks/use-auth';
import { NoAccess } from '@/components/auth/require-permission';
```
> Confirm `NoAccess` is exported from `require-permission.tsx`; if it is not a named export, render the same fallback the app uses elsewhere for forbidden screens.

- [ ] **Step 2: Keep combined form state, derive per-section payloads**

The page keeps its combined `form` (it holds both company and branding fields). Add helper builders just before the `return` in `SettingsPage` (after `set`, ~line 133):
```ts
    const companyPayload = (): CompanyPayload => ({
        company_name: form.company_name,
        legal_name: form.legal_name,
        tax_id: form.tax_id,
        industry: form.industry,
        address: form.address,
        country: form.country,
        currency: form.currency,
        timezone: form.timezone,
    });
```
Change `emptyForm`/`form` typing: keep its current shape (it lists brand + company fields). Define a local type for the combined form so it doesn't depend on the removed `SettingsPayload`:
```ts
type SettingsForm = CompanyPayload & BrandingPayload;
const emptyForm: SettingsForm = { /* same fields as before */ };
```
Update `const [form, setForm] = useState<SettingsForm>(emptyForm);` and `const set = <K extends keyof SettingsForm>...`.

- [ ] **Step 3: Wire Company tab to `useUpdateCompany`**

Replace `const update = useUpdateSettings();` (line 113) with `const update = useUpdateCompany();`.
Change the Company tab render (line 177) to send only company fields:
```tsx
                    {section === 'company' && (
                        <CompanyTab form={form} set={set} onSave={() => update.mutate(companyPayload())} saving={update.isPending} saved={update.isSuccess} />
                    )}
```

- [ ] **Step 4: Wire Branding tab to `useUpdateBranding`**

In `BrandingTab` (line 1459-1461), replace `const update = useUpdateSettings();` with `const update = useUpdateBranding();` and change its `save` (line 1511) to send only branding fields:
```ts
        await update.mutateAsync({ brand_name: form.brand_name, brand_sub: form.brand_sub });
```

- [ ] **Step 5: Add the permission gate to the nav**

Add a `perm` to each nav item and filter by `can()`. Replace the `nav` array (lines 135-145) with:
```tsx
    const { can } = useAuth();
    const nav: { id: Section; label: string; icon: typeof Building2; perm: string }[] = [
        { id: 'company', label: t('set_company'), icon: Building2, perm: 'settings.company' },
        { id: 'branding', label: t('set_branding'), icon: Sparkles, perm: 'settings.branding' },
        { id: 'display', label: t('set_display'), icon: MonitorCog, perm: 'settings.display' },
        { id: 'master-data', label: t('set_master_data'), icon: Boxes, perm: 'settings.masterdata' },
        { id: 'email', label: t('set_email'), icon: Mail, perm: 'settings.email' },
        { id: 'tickets', label: t('set_tickets'), icon: Ticket, perm: 'settings.sla' },
        { id: 'assets', label: t('set_assets'), icon: Box, perm: 'settings.assets' },
        { id: 'workflow', label: t('set_workflow'), icon: Workflow, perm: 'settings.workflows' },
        { id: 'security', label: t('set_security'), icon: Shield, perm: 'settings.security' },
    ].filter((n) => can(n.perm));
```

- [ ] **Step 6: Render NoAccess when no sections are visible; keep active section valid**

Right after the `nav` definition, add:
```tsx
    if (nav.length === 0) return <NoAccess />;

    // If the hash/section points at a tab the user can't see, fall back to the first visible one.
    const activeSection = nav.some((n) => n.id === section) ? section : nav[0].id;
```
Then in the tab body (lines 175-185), replace each `section === '...'` comparison with `activeSection === '...'`, and use `activeSection` in the nav button highlight (`section === n.id` → `activeSection === n.id`).

> This keeps super (sees all 9) and a partially-permitted user (sees only their tabs) both working. `can()` returns true for super because the catalog grants super `settings.*` via `Permissions::all()`.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx eslint resources/js/pages/settings/index.tsx`
Expected: clean (fix any unused-import warnings, e.g. drop `SettingsPayload`).

- [ ] **Step 8: Commit**

```bash
git add resources/js/pages/settings/index.tsx
git commit -m "feat(settings-ui): split company/branding saves; hide tabs without permission"
```

---

## Task 16: Frontend — main nav Settings entry gating

**Files:**
- Modify: `resources/js/lib/nav.ts:39`

- [ ] **Step 1: Inspect how nav items gate**

`nav.ts` items use either `permission: '<key>'` or `roles: [...]`. The shell filters items by these. The Settings entry currently uses `permission: 'system.edit_settings'` (now removed).

- [ ] **Step 2: Decide the gate**

A single `permission` field can't express "any of 9". Check the nav renderer (`sidebar.tsx`) for how `permission`/`roles` are evaluated. The simplest robust option that matches the existing model: gate the Settings entry on the most common section, **`settings.company`**, OR switch it to a `roles`-based show plus a `permission`. Preferred: since super always sees admin items and an admin granted any settings tab should see the entry, gate on `permission: 'settings.company'` is too narrow.

Therefore extend the nav item shape minimally: change the Settings entry to:
```ts
            { id: 'settings', label: 'settings', to: '/settings', icon: Settings, permission: 'settings.company' },
```
…only if `sidebar` supports a single key. If finer control is needed, inspect `sidebar.tsx`'s filter and add support for an `anyOf: string[]` field on the nav item, then set:
```ts
            { id: 'settings', label: 'settings', to: '/settings', icon: Settings, anyOf: [
                'settings.company','settings.branding','settings.display','settings.masterdata',
                'settings.email','settings.sla','settings.assets','settings.workflows','settings.security',
            ] },
```

> Implementer: read `resources/js/components/shell/sidebar.tsx` and `resources/js/types` (`NavItem`) first. If `anyOf` is not already supported, add it to the `NavItem` type and to the sidebar filter (mirror the existing `permission`/`roles` checks). The Settings page itself already renders `NoAccess` as a backstop, so a slightly permissive nav entry is acceptable if `anyOf` is out of scope — but prefer `anyOf` for correctness.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add resources/js/lib/nav.ts resources/js/components/shell/sidebar.tsx resources/js/types/index.ts
git commit -m "feat(settings-ui): gate main-nav Settings entry on settings.* permissions"
```

---

## Task 17: Full verification

- [ ] **Step 1: Backend — full suite**

Run: `php artisan test --compact`
Expected: all green. Pay attention to any test that previously hit `PUT /settings` — all such call sites were retargeted in Tasks 6-9.

- [ ] **Step 2: Pint**

Run: `vendor/bin/pint --dirty --format agent`
Expected: no style issues remain.

- [ ] **Step 3: Frontend**

Run: `npx tsc --noEmit`
Run: `npx eslint resources/js`
Expected: both clean.

- [ ] **Step 4: Route sanity**

Run: `php artisan route:list --path=settings`
Expected: `GET settings`, `PUT settings/company|branding|display|assets|sla`, `GET/PUT settings/mail`, `POST settings/mail/test`, `GET/PUT settings/security`, `POST/DELETE settings/logo`. No `PUT settings` (combined).

- [ ] **Step 5: Manual smoke (ask the user to run the app)**

- Log in as super → Settings shows all 9 tabs; each saves.
- Grant a non-super role only `settings.email` via the Permission matrix → that user sees only the Email tab; other tabs hidden; direct nav to Settings works.
- Revoke all `settings.*` → Settings nav entry hidden; visiting `/settings` shows NoAccess.

- [ ] **Step 6: Commit any final fixes**

```bash
git add -p
git commit -m "test(settings): verify granular settings permissions end-to-end"
```

---

## Task 18: README summary

**Files:**
- Modify: `Readme.md`

- [ ] **Step 1: Append a section** summarizing the granular settings permissions (the 9 keys, super-only default, middleware `permission:settings.*`, master-data write gating, the `system.edit_settings` removal + migration). Follow the existing README cadence (one consolidated entry for this phase).

- [ ] **Step 2: Commit**

```bash
git add Readme.md
git commit -m "docs: granular Administration Settings permissions"
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** all 9 keys (Tasks 1, 3-10), middleware (2), migration (11), labels (12), API/hooks/page (13-15), main nav (16), tests per section (3-10), verification (17). ✓
- **Warehouse decision:** folded into `settings.masterdata` (Task 10); `stock.manage_warehouse` left in catalog as reserved/non-enforcing (noted). ✓
- **Reads stay open:** Master Data `index` + `GET /settings` + `GET /settings/security` remain ungated (Tasks 9, 10). ✓
- **Type consistency:** `CompanyPayload`/`BrandingPayload` defined in Task 13 are consumed identically in Tasks 14-15; `useUpdateCompany`/`useUpdateBranding` names match across hook + page. ✓
- **Live DB:** additive migration only; no `migrate:fresh` required (Task 11). ✓
