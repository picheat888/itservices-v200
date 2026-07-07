# Contract Lifecycle Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยนสถานะสัญญาที่เลย `end_date` จาก auto-"expired" เป็น **overdue**, เพิ่ม action **Expired** ที่ admin สั่งเองแบบถาวร, generalize write-off guard, ตัด auto-renew, และคุม Cancel/Expired ด้วย permission ใหม่.

**Architecture:** สถานะยังคงเป็น derived attribute บน `Contract` (ไม่มีคอลัมน์ status). เพิ่มคอลัมน์ `expired_at` (timestamp, ถาวร) คู่กับ `cancelled_at` เดิม. Precedence: expired → cancelled → active → overdue. Backend = Laravel service/controller/resource + PHPUnit. Frontend = React + TS (ไม่มี JS test runner → verify ด้วย `npx tsc`/`npm run build`).

**Tech Stack:** PHP 8.2 / Laravel 12 / PHPUnit 11 / MariaDB / React 19 / TypeScript / Tailwind 4

## Global Constraints

- Status precedence (verbatim): `expired_at !== null` → `expired` › `cancelled_at !== null` → `cancelled` › `daysRemaining() > 0` → `active` › else → `overdue`.
- `expired_at` ตั้งครั้งเดียว ไม่เคลียร์ (ถาวร, ไม่มี un-expire). `cancelled_at` ยัง reversible (toggle) เหมือนเดิม.
- Write-off guard ใช้กับ **สัญญาทุกประเภทที่มี asset ผูก** (ไม่ใช่เฉพาะ hardware) และใช้กับ **ทั้ง cancel และ expire**.
- Permission: `contracts.cancel` คุม Cancel/Reactivate; `contracts.expire` คุม Expired. role `admin` **ไม่ได้รับ** 2 ตัวนี้โดยดีฟอลต์; super bypass เสมอ.
- Email template `contract.expired_alert`: **คง key เดิม**, เปลี่ยนเฉพาะ wording เป็น "overdue".
- ห้าม hardcode string ใน React component — ใช้ `useT()` (คีย์ที่ `lang/<locale>/<module>.ts`).
- รัน `vendor/bin/pint --dirty --format agent` หลังแก้ไฟล์ PHP ทุกครั้งก่อน commit.
- Commit เฉพาะไฟล์ที่เกี่ยวกับ task นั้น (ห้าม `git add -A`).

## File Structure

**Backend (แก้ไข)**
- `database/migrations/2026_07_07_*_convert_contract_lifecycle.php` — CREATE
- `app/Models/Contract/Contract.php` — status/isInReminder/fillable/casts
- `app/Services/Contract/ContractService.php` — assertNoPendingAssets/expire/toggleCancel/import
- `app/Http/Controllers/Api/Contract/ContractController.php` — expire/cancel/index/summary
- `app/Http/Requests/Contract/StoreContractRequest.php` — drop auto_renew
- `app/Http/Resources/Contract/ContractResource.php` — add expired_at / drop auto_renew
- `app/Services/Contract/ContractExpiryAlertService.php` — exclude expired_at
- `app/Support/EmailTemplates.php` — relabel expired→overdue
- `app/Support/Permissions.php` — catalog + defaults
- `routes/api.php` — expire route

**Frontend (แก้ไข)**
- `resources/js/shared/types/index.ts` — ContractStatus / Contract fields
- `resources/js/modules/contract/api/contractApi.ts` + `hooks/use-contracts.ts` — expire + drop auto_renew
- `resources/js/modules/contract/components/contract-detail-drawer.tsx` — expire button/guard/badges
- `resources/js/modules/contract/components/contract-form-drawer.tsx` — drop auto_renew toggle
- `resources/js/modules/contract/pages/index.tsx` — badges/DaysCell/gating
- `resources/js/lang/{en,th}/contract.ts` `+ permission.ts + notification.ts` — copy
- `resources/js/modules/permission/lib/permission-labels.ts` — new perm keys

**Tests**
- `tests/Unit/ContractStatusTest.php` — CREATE
- `tests/Feature/ContractLifecycleTest.php` — CREATE
- แก้ `tests/Feature/ContractApiTest.php`, `tests/Feature/ContractExpiryAlertTest.php` เท่าที่กระทบ

---

### Task 1: Migration + Model status/precedence

**Files:**
- Create: `database/migrations/2026_07_07_090000_convert_contract_lifecycle.php`
- Modify: `app/Models/Contract/Contract.php`
- Test: `tests/Unit/ContractStatusTest.php` (create)

**Interfaces:**
- Produces: `contracts.expired_at` column (nullable timestamp); `contracts.auto_renew` removed; `Contract::status` returns `'active'|'overdue'|'cancelled'|'expired'`; `Contract::isInReminder()` returns false when `expired_at` set.

- [ ] **Step 1: Write the failing unit test**

Create `tests/Unit/ContractStatusTest.php`:

```php
<?php

namespace Tests\Unit;

use App\Models\Contract\Contract;
use App\Models\Settings\Vendor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContractStatusTest extends TestCase
{
    use RefreshDatabase;

    private function contract(array $overrides = []): Contract
    {
        $vendor = Vendor::create(['name' => 'V-'.uniqid()]);

        return Contract::create(array_merge([
            'vendor_id' => $vendor->id,
            'name' => 'Test',
            'title' => 'Test',
            'type' => 'software',
            'start_date' => '2025-01-01',
            'end_date' => '2027-01-01',
            'value' => 100,
            'billing_cycle' => 'yearly',
        ], $overrides));
    }

    public function test_future_end_date_is_active(): void
    {
        $this->assertSame('active', $this->contract(['end_date' => now()->addYear()])->status);
    }

    public function test_past_end_date_is_overdue_not_expired(): void
    {
        $this->assertSame('overdue', $this->contract(['end_date' => now()->subDay()])->status);
    }

    public function test_cancelled_at_beats_dates(): void
    {
        $c = $this->contract(['end_date' => now()->subDay(), 'cancelled_at' => now()]);
        $this->assertSame('cancelled', $c->status);
    }

    public function test_expired_at_beats_everything(): void
    {
        $c = $this->contract(['end_date' => now()->addYear(), 'cancelled_at' => now(), 'expired_at' => now()]);
        $this->assertSame('expired', $c->status);
    }

    public function test_expired_contract_is_not_in_reminder(): void
    {
        $c = $this->contract(['end_date' => now()->addDays(5), 'notify_7' => true, 'expired_at' => now()]);
        $this->assertFalse($c->isInReminder());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact tests/Unit/ContractStatusTest.php`
Expected: FAIL — `expired` never returned / `expired_at` column missing (`Unknown column 'expired_at'`).

- [ ] **Step 3: Create the migration**

Run: `php artisan make:migration convert_contract_lifecycle --no-interaction`
แล้วเขียนเนื้อในไฟล์ที่ถูกสร้าง (ปรับชื่อ timestamp ให้ตรงไฟล์จริง):

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->timestamp('expired_at')->nullable()->after('cancelled_at');
            $table->dropColumn('auto_renew');
        });
    }

    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->boolean('auto_renew')->default(false)->after('billing_cycle');
            $table->dropColumn('expired_at');
        });
    }
};
```

- [ ] **Step 4: Update the model**

In `app/Models/Contract/Contract.php`:

แก้ `$fillable` — เปลี่ยน `'value', 'billing_cycle', 'auto_renew', 'cancelled_at',` เป็น:

```php
        'value', 'billing_cycle', 'cancelled_at', 'expired_at',
```

แก้ `casts()` — ลบบรรทัด `'auto_renew' => 'boolean',` และเพิ่ม `'expired_at' => 'datetime',` ถัดจาก `'cancelled_at' => 'datetime',`:

```php
            'cancelled_at' => 'datetime',
            'expired_at' => 'datetime',
```

แทนที่ method `status()` ทั้งก้อนด้วย:

```php
    /** Derived lifecycle status: expired (manual, permanent) › cancelled › active/overdue by date. */
    protected function status(): Attribute
    {
        return Attribute::get(function () {
            if ($this->expired_at !== null) {
                return 'expired';
            }

            if ($this->cancelled_at !== null) {
                return 'cancelled';
            }

            return $this->daysRemaining() > 0 ? 'active' : 'overdue';
        });
    }
```

แก้ต้น `isInReminder()` — เปลี่ยน guard:

```php
        if ($this->cancelled_at !== null || $this->expired_at !== null) {
            return false;
        }
```

- [ ] **Step 5: Run migration + test to verify pass**

Run: `php artisan migrate --no-interaction && php artisan test --compact tests/Unit/ContractStatusTest.php`
Expected: PASS (5 tests).

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add database/migrations app/Models/Contract/Contract.php tests/Unit/ContractStatusTest.php
git commit -m "feat(contract): add expired_at, derive overdue/expired status (drop auto_renew col)"
```

---

### Task 2: Service — generalized guard, expire(), import cleanup

**Files:**
- Modify: `app/Services/Contract/ContractService.php`
- Test: `tests/Feature/ContractLifecycleTest.php` (create)

**Interfaces:**
- Consumes: `Contract` model from Task 1.
- Produces: `ContractService::expire(Contract): Contract` (throws `ValidationException` if already expired or has pending assets); `ContractService::toggleCancel(Contract)` uses the generalized guard.

- [ ] **Step 1: Write the failing feature test**

Create `tests/Feature/ContractLifecycleTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Settings\Vendor;
use App\Services\Contract\ContractService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ContractLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private function contract(array $overrides = []): Contract
    {
        $vendor = Vendor::create(['name' => 'V-'.uniqid()]);

        return Contract::create(array_merge([
            'vendor_id' => $vendor->id, 'name' => 'T', 'title' => 'T', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2027-01-01', 'value' => 100, 'billing_cycle' => 'yearly',
        ], $overrides));
    }

    public function test_expire_sets_expired_at(): void
    {
        $c = $this->contract();
        $c = app(ContractService::class)->expire($c);
        $this->assertNotNull($c->expired_at);
        $this->assertSame('expired', $c->status);
    }

    public function test_expire_twice_throws(): void
    {
        $c = $this->contract(['expired_at' => now()]);
        $this->expectException(ValidationException::class);
        app(ContractService::class)->expire($c);
    }

    public function test_expire_blocked_by_pending_assets_any_type(): void
    {
        $c = $this->contract(['type' => 'software']);
        Asset::create(['tag' => 'A-1', 'category_id' => null, 'status' => 'in_use', 'contract_id' => $c->id]);
        $this->expectException(ValidationException::class);
        app(ContractService::class)->expire($c);
    }
}
```

> NOTE: ถ้า `Asset::create` ต้องการ field เพิ่ม (เช่น `type`) ให้เปิด `app/Models/Asset/Asset.php` ดู `$fillable`/NOT NULL columns แล้วเติมให้ครบ; ประเด็นของ test คือมี asset ที่ `status !== 'writeoff'` ผูกกับ contract.

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact tests/Feature/ContractLifecycleTest.php`
Expected: FAIL — `Call to undefined method ...::expire()`.

- [ ] **Step 3: Rename guard + add expire()**

In `app/Services/Contract/ContractService.php`:

แทนที่ method `toggleCancel()` และ `assertCancellable()` ทั้งสองก้อน ด้วยโค้ดนี้ (เพิ่ม `expire()` และ `assertNoPendingAssets()`):

```php
    /**
     * Toggle a contract's cancelled state: cancel an active contract, or
     * reactivate one that was previously cancelled. Used by the detail drawer.
     */
    public function toggleCancel(Contract $contract): Contract
    {
        // Guard only the active → cancelled transition; reactivation is always allowed.
        if ($contract->cancelled_at === null) {
            $this->assertNoPendingAssets($contract);
        }

        $contract->update([
            'cancelled_at' => $contract->cancelled_at === null ? Carbon::now() : null,
        ]);

        return $contract->fresh();
    }

    /**
     * Mark a contract as expired — a permanent, admin-driven close-out. Unlike
     * cancel this cannot be undone. Every linked asset must be written off first.
     *
     * @throws ValidationException
     */
    public function expire(Contract $contract): Contract
    {
        if ($contract->expired_at !== null) {
            throw ValidationException::withMessages([
                'contract' => 'This contract has already been marked as expired.',
            ]);
        }

        $this->assertNoPendingAssets($contract);

        $contract->update(['expired_at' => Carbon::now()]);

        return $contract->fresh();
    }

    /**
     * A contract with linked assets can only be closed (cancelled or expired)
     * once every linked asset has been written off — otherwise tracked hardware
     * would be left pointing at a dead contract. Applies to all contract types.
     *
     * @throws ValidationException
     */
    private function assertNoPendingAssets(Contract $contract): void
    {
        $pending = $contract->assets()->where('status', '!=', AssetStatus::Writeoff->value)->count();

        if ($pending > 0) {
            throw ValidationException::withMessages([
                'contract' => "All {$pending} linked asset(s) must be written off before this contract can be closed.",
            ]);
        }
    }
```

ลบ `use App\Enums\Contract\ContractType;` ที่ตอนบนไฟล์ (เลิกใช้แล้ว — pint จะ flag ถ้าปล่อยไว้). `use App\Enums\Asset\AssetStatus;` และ `use Illuminate\Support\Carbon;` และ `use Illuminate\Validation\ValidationException;` ยังคงต้องมี.

- [ ] **Step 4: Remove auto_renew from importRows()**

In `importRows()` ลบบรรทัด:

```php
                'auto_renew' => in_array(strtolower(trim($row['auto_renew'] ?? '')), ['1', 'true', 'yes'], true),
```

- [ ] **Step 4b: Clean the demo seeder (references the dropped column)**

In `database/seeders/ContractSeeder.php`:
- ลบ key `'auto_renew' => $autoRenew,` ในบล็อก insert (`Contract::create([...])` / array ที่ส่งเข้า) — ราวบรรทัด 77.
- ตัวแปร `$autoRenew` ที่ destructure มาจาก `$coverage` แต่ละแถวจะกลายเป็น unused. เพื่อไม่ให้เหลือ dead var: เอา element `auto_renew` ออกจากทุกแถวของ `$coverage` **และ** ออกจาก destructuring pattern (ปรับ comment บรรทัด 46 ให้ตรง). ถ้าเสี่ยงพลาด ให้เก็บ element ไว้แต่เปลี่ยนตัวรับเป็น placeholder ที่ไม่ถูกใช้ต่อ — ขอแค่ **ไม่มี** key `auto_renew` ไปถึง `Contract::create()` อีก.
- ตรวจว่าไม่มีคำว่า `auto_renew` เหลือในไฟล์: `grep -n auto_renew database/seeders/ContractSeeder.php` → ต้องว่าง.

- [ ] **Step 5: Run test to verify it passes**

Run: `php artisan test --compact tests/Feature/ContractLifecycleTest.php`
Expected: PASS (3 tests).

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/Contract/ContractService.php database/seeders/ContractSeeder.php tests/Feature/ContractLifecycleTest.php
git commit -m "feat(contract): add expire() service + generalize write-off guard to all types"
```

---

### Task 3: Permissions catalog + defaults

**Files:**
- Modify: `app/Support/Permissions.php`
- Test: `tests/Feature/ContractLifecycleTest.php` (append)

**Interfaces:**
- Produces: permission keys `contracts.cancel`, `contracts.expire` exist in catalog; role `admin` default set excludes both.

- [ ] **Step 1: Append failing test**

เพิ่ม 2 method ใน `tests/Feature/ContractLifecycleTest.php`:

```php
    public function test_new_contract_permissions_exist(): void
    {
        $all = \App\Support\Permissions::all();
        $this->assertContains('contracts.cancel', $all);
        $this->assertContains('contracts.expire', $all);
    }

    public function test_admin_default_excludes_cancel_and_expire(): void
    {
        $adminDefaults = \App\Support\Permissions::defaults()['admin'];
        $this->assertNotContains('contracts.cancel', $adminDefaults);
        $this->assertNotContains('contracts.expire', $adminDefaults);
    }
```

- [ ] **Step 2: Run to verify fail**

Run: `php artisan test --compact --filter='new_contract_permissions_exist|admin_default_excludes'`
Expected: FAIL — keys not in catalog.

- [ ] **Step 3: Add keys to catalog**

In `app/Support/Permissions.php` `catalog()` แก้บรรทัด contracts:

```php
            'contracts' => ['view', 'create', 'edit', 'import', 'renew', 'alerts', 'cancel', 'expire'],
```

> `defaults()['admin']` ปัจจุบันมี `contracts.view/create/edit/import/renew/alerts` อยู่แล้ว และ **ไม่มี** cancel/expire — ปล่อยไว้ตามเดิม (test ข้อ 2 จะผ่านทันที). ตรวจว่าไม่ได้เผลอเติม cancel/expire ให้ admin.

- [ ] **Step 4: Run to verify pass**

Run: `php artisan test --compact --filter='new_contract_permissions_exist|admin_default_excludes'`
Expected: PASS.

- [ ] **Step 5: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Support/Permissions.php tests/Feature/ContractLifecycleTest.php
git commit -m "feat(contract): add contracts.cancel + contracts.expire permissions"
```

---

### Task 4: Route + Controller (expire endpoint, cancel perm, overdue tabs/summary)

**Files:**
- Modify: `routes/api.php`, `app/Http/Controllers/Api/Contract/ContractController.php`
- Test: `tests/Feature/ContractLifecycleTest.php` (append)

**Interfaces:**
- Consumes: `ContractService::expire()`, permissions from Tasks 2-3.
- Produces: `POST /api/contracts/{contract}/expire` (name `api.contracts.expire`); `summary()` returns `overdue` + `expired` counts.

- [ ] **Step 1: Append failing feature test**

เพิ่มใน `tests/Feature/ContractLifecycleTest.php` (ต้อง `use App\Models\User;` — เพิ่ม import ที่หัวไฟล์):

```php
    public function test_expire_endpoint_requires_permission(): void
    {
        $user = User::factory()->create(['role' => 'admin']); // admin ไม่มี contracts.expire
        $c = $this->contract(['end_date' => now()->subDay()]);
        $this->actingAs($user)->postJson("/api/contracts/{$c->id}/expire")->assertForbidden();
    }

    public function test_super_can_expire_and_it_is_permanent(): void
    {
        $super = User::factory()->create(['role' => 'super']);
        $c = $this->contract(['end_date' => now()->subDay()]);

        $this->actingAs($super)->postJson("/api/contracts/{$c->id}/expire")
            ->assertOk()->assertJsonPath('data.status', 'expired');

        // second attempt is rejected (permanent)
        $this->actingAs($super)->postJson("/api/contracts/{$c->id}/expire")->assertStatus(422);
    }

    public function test_summary_separates_overdue_and_expired(): void
    {
        $super = User::factory()->create(['role' => 'super']);
        $this->contract(['end_date' => now()->subDay()]);                      // overdue
        $this->contract(['end_date' => now()->subDay(), 'expired_at' => now()]); // expired

        $this->actingAs($super)->getJson('/api/contracts/summary')
            ->assertOk()
            ->assertJsonPath('overdue', 1)
            ->assertJsonPath('expired', 1);
    }
```

- [ ] **Step 2: Run to verify fail**

Run: `php artisan test --compact tests/Feature/ContractLifecycleTest.php`
Expected: FAIL — route missing (404/405) และ `overdue` path ไม่มีใน summary.

- [ ] **Step 3: Add the route**

In `routes/api.php` ถัดจากบรรทัด cancel เดิม เพิ่ม:

```php
    Route::post('contracts/{contract}/expire', [ContractController::class, 'expire'])->name('api.contracts.expire');
```

- [ ] **Step 4: Controller — cancel perm + expire method**

In `ContractController.php` แก้ `cancel()` เปลี่ยน permission และ docblock:

```php
    /** Toggles a contract's cancelled state. Requires the contracts.cancel permission. */
    public function cancel(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.cancel'), 403);
```

เพิ่ม method ใหม่ถัดจาก `cancel()`:

```php
    /** Permanently marks a contract as expired (admin close-out). Requires contracts.expire. */
    public function expire(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.expire'), 403);

        $contract = $this->service->expire($contract);
        AuditLog::record('Expired contract', "{$contract->name} ({$contract->code})");

        return (new ContractResource($contract))
            ->additional(['message' => 'success'])->response();
    }
```

- [ ] **Step 5: Controller — summary overdue/expired + list terminal sink**

In `summary()` แทนที่บล็อกคำนวณ (บรรทัด `$live = ...` ถึง `$cancelled = ...`) ด้วย:

```php
        $terminal = fn ($c) => $c->cancelled_at !== null || $c->expired_at !== null;
        $live = $contracts->reject($terminal);
        $expiring = $live->filter(fn ($c) => $c->isInReminder());
        $overdue = $live->filter(fn ($c) => $c->daysRemaining() <= 0);
        // "Active" = healthy contracts only — exclude those already inside their
        // reminder window so active/expiring/overdue stay mutually exclusive.
        $active = $live->filter(fn ($c) => $c->daysRemaining() > 0 && ! $c->isInReminder());
        $cancelled = $contracts->filter(fn ($c) => $c->cancelled_at !== null && $c->expired_at === null);
        $expired = $contracts->filter(fn ($c) => $c->expired_at !== null);
```

และแก้ return array — เปลี่ยน `'expired' => $expired->count(),` เดิมให้เป็นทั้งสองคีย์:

```php
            'overdue' => $overdue->count(),
            'expired' => $expired->count(),
```

In `index()` เปลี่ยนทุก `orderByRaw('cancelled_at IS NOT NULL')` (6 จุดใน match) เป็น:

```php
'(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)'
```

และในบล็อก `tab === 'expired'` เพิ่ม `->whereNull('expired_at')` เพื่อให้ tab นี้ = overdue (live, ยังไม่ปิด):

```php
        if ($request->query('tab') === 'expired') {
            // Overdue = still live (not cancelled, not expired) but the end date has already passed.
            $query->whereNull('cancelled_at')
                ->whereNull('expired_at')
                ->whereDate('end_date', '<=', now());
        }
```

และในบล็อก `tab === 'expiring'` เพิ่ม `->whereNull('expired_at')` ต่อจาก `->whereNull('cancelled_at')`.

- [ ] **Step 5b: Drop auto_renew from the import-template CSV**

In `ContractController.php` ราวบรรทัด 249-250 (method download import-template) เอา `'auto_renew'` ออกจาก `$headers` และเอาค่าที่ตรงกัน (`'0'`) ออกจาก `$sample` เพื่อให้จำนวน column ตรงกัน:

```php
        $headers = ['code', 'vendor', 'name', 'type', 'start_date', 'end_date', 'value', 'billing_cycle', 'notes'];
        $sample = ['', 'Microsoft', 'Microsoft 365 — 100 seats', 'software', '2025-01-01', '2026-01-01', '150000', 'yearly', ''];
```

- [ ] **Step 6: Run to verify pass**

Run: `php artisan test --compact tests/Feature/ContractLifecycleTest.php`
Expected: PASS (ทั้งไฟล์).

- [ ] **Step 7: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add routes/api.php app/Http/Controllers/Api/Contract/ContractController.php tests/Feature/ContractLifecycleTest.php
git commit -m "feat(contract): expire endpoint, cancel gated by contracts.cancel, summary overdue/expired"
```

---

### Task 5: Request + Resource (drop auto_renew, expose expired_at)

**Files:**
- Modify: `app/Http/Requests/Contract/StoreContractRequest.php`, `app/Http/Resources/Contract/ContractResource.php`
- Test: `tests/Feature/ContractApiTest.php` (append)

**Interfaces:**
- Produces: contract JSON has `expired_at`, no `auto_renew`.

- [ ] **Step 1: Append failing test**

เพิ่มใน `tests/Feature/ContractApiTest.php`:

```php
    public function test_contract_json_has_expired_at_and_no_auto_renew(): void
    {
        $this->actingAs($this->super());
        $vendor = Vendor::create(['name' => 'ACME Co']);
        $c = Contract::create([
            'vendor_id' => $vendor->id, 'name' => 'X', 'title' => 'X', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2027-01-01', 'value' => 100, 'billing_cycle' => 'yearly',
        ]);

        $this->getJson("/api/contracts/{$c->id}")
            ->assertOk()
            ->assertJsonPath('data.expired_at', null)
            ->assertJsonMissingPath('data.auto_renew');
    }
```

- [ ] **Step 2: Run to verify fail**

Run: `php artisan test --compact --filter=contract_json_has_expired_at`
Expected: FAIL — `auto_renew` still present.

- [ ] **Step 3: Update the Form Request**

In `StoreContractRequest.php` ลบบรรทัด rule:

```php
            'auto_renew' => ['sometimes', 'boolean'],
```

- [ ] **Step 4: Update the Resource**

In `ContractResource.php` ลบบรรทัด `'auto_renew' => $this->auto_renew,` และเพิ่ม `expired_at` ถัดจาก `cancelled_at`:

```php
            'cancelled_at' => $this->cancelled_at?->toDateString(),
            'expired_at' => $this->expired_at?->toDateString(),
```

- [ ] **Step 5: Run to verify pass**

Run: `php artisan test --compact --filter=contract_json_has_expired_at`
Expected: PASS.

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Requests/Contract/StoreContractRequest.php app/Http/Resources/Contract/ContractResource.php tests/Feature/ContractApiTest.php
git commit -m "feat(contract): expose expired_at, drop auto_renew from request+resource"
```

---

### Task 6: Alert service excludes expired contracts

**Files:**
- Modify: `app/Services/Contract/ContractExpiryAlertService.php`
- Test: `tests/Feature/ContractExpiryAlertTest.php` (append)

**Interfaces:**
- Produces: `run()` skips contracts with `expired_at` set (no bell/no email).

- [ ] **Step 1: Read the existing alert test setup**

Read `tests/Feature/ContractExpiryAlertTest.php` เพื่อเลียนแบบ helper การสร้าง contract + recipient (user ที่มี `contracts.alerts`). ใช้ pattern เดิมของไฟล์นั้นในการเขียน test ใหม่.

- [ ] **Step 2: Append failing test**

เพิ่ม test (ปรับ helper ให้ตรงกับไฟล์):

```php
    public function test_expired_contracts_do_not_alert(): void
    {
        // recipient with contracts.alerts (reuse this file's existing helper/setup)
        $this->makeAlertRecipient();

        // an overdue contract with reminders on + already marked expired by admin
        $vendor = \App\Models\Settings\Vendor::create(['name' => 'V']);
        \App\Models\Contract\Contract::create([
            'vendor_id' => $vendor->id, 'name' => 'Done', 'title' => 'Done', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => now()->subDay(), 'value' => 1, 'billing_cycle' => 'yearly',
            'notify_7' => true, 'expired_at' => now(),
        ]);

        $belled = app(\App\Services\Contract\ContractExpiryAlertService::class)->run(true);
        $this->assertSame(0, $belled);
    }
```

> ถ้าไฟล์ไม่มี helper `makeAlertRecipient()` ให้สร้าง user แบบเดียวกับ test อื่นในไฟล์ที่ให้ `hasPermission('contracts.alerts')` = true (ดู setup เดิม).

- [ ] **Step 3: Run to verify fail**

Run: `php artisan test --compact --filter=expired_contracts_do_not_alert`
Expected: FAIL — belled = 1 (expired contract ยังถูกเตือน).

- [ ] **Step 4: Add the filter**

In `ContractExpiryAlertService::run()` แก้ query:

```php
        $contracts = Contract::whereNull('cancelled_at')
            ->whereNull('expired_at')
            ->get()
            ->filter(fn (Contract $c) => $c->enabledReminderDays() !== [])
            ->filter(fn (Contract $c) => $c->isInReminder() || $c->daysRemaining() <= 0);
```

- [ ] **Step 5: Run to verify pass**

Run: `php artisan test --compact tests/Feature/ContractExpiryAlertTest.php`
Expected: PASS (test ใหม่ + test เดิมทั้งหมดยังผ่าน).

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/Contract/ContractExpiryAlertService.php tests/Feature/ContractExpiryAlertTest.php
git commit -m "feat(contract): stop alerting on admin-expired contracts"
```

---

### Task 7: Email template relabel expired→overdue

**Files:**
- Modify: `app/Support/EmailTemplates.php`

**Interfaces:**
- Produces: `contract.expired_alert` template copy reads "overdue" (key unchanged).

- [ ] **Step 1: Update the template copy**

In `app/Support/EmailTemplates.php` แก้ entry `contract.expired_alert` (คง `'key' => 'contract.expired_alert'`):

```php
                'key' => 'contract.expired_alert',
                'name' => 'Contract overdue',
                'subject' => 'Contract {{contract.vendor}} is overdue ({{contract.days_overdue}} days past end date)',
                'body_html' => '<p>Hi {{user.first_name}},</p>
<p>The contract <strong>{{contract.name}}</strong> with {{contract.vendor}} passed its end date <strong>{{contract.days_overdue}}</strong> days ago (on {{contract.end_date}}) and is still open. Please renew it or close it out (mark as expired).</p>
<p style="color:#64748b">Reference: <strong>{{contract.code}}</strong></p>',
```

> คงชื่อ merge variable `contract.days_overdue` เดิม (service ส่งค่ามาให้แล้ว).

- [ ] **Step 2: Verify wording**

Run: `php artisan test --compact tests/Feature/ContractExpiryAlertTest.php`
Expected: PASS (ไม่มี test ผูกกับ wording; รันเพื่อยืนยันไม่พังโครง).

> การอัปเดต seed นี้กระทบเฉพาะค่า default; ถ้า DB มี row เดิมอยู่แล้ว ผู้ดูแลรีเซ็ต template ได้จากหน้า Settings (นอก scope).

- [ ] **Step 3: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Support/EmailTemplates.php
git commit -m "feat(contract): relabel expiry-past email as overdue"
```

---

### Task 8: Frontend types + api + hooks

**Files:**
- Modify: `resources/js/shared/types/index.ts`, `resources/js/modules/contract/api/contractApi.ts`, `resources/js/modules/contract/hooks/use-contracts.ts`

**Interfaces:**
- Produces: `ContractStatus = 'active'|'overdue'|'cancelled'|'expired'`; `Contract.expired_at: string|null` (no `auto_renew`); `contractApi.expire(id)`; `useContractMutations().expire`.

- [ ] **Step 1: Update shared types**

In `resources/js/shared/types/index.ts`:

```ts
export type ContractStatus = 'active' | 'overdue' | 'cancelled' | 'expired';
```

ใน interface `Contract`: ลบ `auto_renew: boolean;` และเพิ่มถัดจาก field วันที่ (ใกล้ `status`): `expired_at: string | null;` (และตรวจว่ามี `cancelled_at: string | null;` อยู่ — ถ้ายังไม่มีให้เพิ่มด้วย).

- [ ] **Step 2: Update api + payload**

In `contractApi.ts`:
- ใน `ContractPayload` ลบ `auto_renew?: boolean;`
- เพิ่ม method ถัดจาก `cancel`:

```ts
    expire: (id: number) => mutate<Contract>('post', `/contracts/${id}/expire`),
```

- [ ] **Step 3: Update hook**

In `use-contracts.ts` ถัดจาก `cancel:` เพิ่ม:

```ts
        expire: useMutation({ mutationFn: (id: number) => contractApi.expire(id), onSuccess: invalidate }),
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: อาจมี error ในไฟล์ที่ยังอ้าง `auto_renew` (drawer/form) — จะแก้ใน Task 9-10. ยืนยันว่า error เหลือเฉพาะที่ `auto_renew` ในไฟล์เหล่านั้น (ไม่ใช่ error อื่น).

- [ ] **Step 5: Commit**

```bash
git add resources/js/shared/types/index.ts resources/js/modules/contract/api/contractApi.ts resources/js/modules/contract/hooks/use-contracts.ts
git commit -m "feat(contract-ui): add overdue/expired status + expire mutation, drop auto_renew type"
```

---

### Task 9: Detail drawer — expire button, guard, badges

**Files:**
- Modify: `resources/js/modules/contract/components/contract-detail-drawer.tsx`

**Interfaces:**
- Consumes: `useContractMutations().expire`, `Contract.expired_at`, `ContractStatus`.
- Produces: gated **Expired** button with pre-overdue warning; generalized write-off guard; Renew hidden when expired; auto_renew KV removed.

- [ ] **Step 1: Props + permissions + mutations**

เพิ่ม props `canCancel`, `canExpire` ให้ component (ต่อจาก `canEdit`) และดึง `expire` จาก mutations:

```tsx
    canEdit,
    canCancel,
    canExpire,
}: {
    contract: Contract | null;
    onClose: () => void;
    onEdit: (c: Contract) => void;
    canEdit: boolean;
    canCancel: boolean;
    canExpire: boolean;
}) {
```

```tsx
    const { cancel, expire } = useContractMutations();
```

เพิ่ม import icon: แก้บรรทัด import lucide เพิ่ม `Archive`:

```tsx
import { Archive, Ban, Clock, Cog, FileText, Laptop, type LucideIcon, Package, SquarePen, Wifi } from 'lucide-react';
```

- [ ] **Step 2: Generalize the cancel guard + add expire handler**

แทนที่ `handleCancel` เดิม (เช็ค `c.type === 'hardware'`) ด้วยเวอร์ชัน generalize และเพิ่ม `handleExpire`:

```tsx
    /** Any contract with linked assets must have them all written off before it can be closed. */
    const assertAssetsClear = async (): Promise<boolean> => {
        const pending = c.linked_assets.filter((a) => a.status !== 'writeoff');
        if (pending.length > 0) {
            await confirm({
                variant: 'warn',
                hideCancel: true,
                title: lang === 'th' ? 'ยังปิดสัญญาไม่ได้' : 'Cannot close yet',
                description:
                    lang === 'th'
                        ? `ต้อง write-off ทรัพย์สินที่ผูกกับสัญญานี้ให้ครบก่อน ยังเหลืออีก ${pending.length} รายการ`
                        : `Every linked asset must be written off first. ${pending.length} asset(s) still need write-off.`,
                confirmText: lang === 'th' ? 'เข้าใจแล้ว' : 'Got it',
            });
            return false;
        }
        return true;
    };

    /** Cancel = reversible early termination. */
    const handleCancel = async () => {
        if (!(await assertAssetsClear())) return;
        await confirm({
            variant: 'danger',
            title: lang === 'th' ? 'ยืนยันยกเลิกสัญญา?' : 'Cancel this contract?',
            entity: { name: c.name, sub: c.code },
            confirmText: t('contract_cancel'),
            action: async () => {
                await cancel.mutateAsync(c.id);
                onClose();
            },
        });
    };

    /** Expired = permanent admin close-out; warn extra when ending before the end date. */
    const handleExpire = async () => {
        if (!(await assertAssetsClear())) return;
        const early = c.status !== 'overdue'; // not yet past end date
        await confirm({
            variant: 'danger',
            title: t('contract_expire'),
            entity: { name: c.name, sub: c.code },
            description: early ? t('contract_expire_early_warn') : t('contract_expire_permanent_note'),
            confirmText: t('contract_expire'),
            action: async () => {
                await expire.mutateAsync(c.id);
                onClose();
            },
        });
    };
```

- [ ] **Step 3: Remove auto_renew KV row**

ลบบล็อก KV `contract_auto_renew` (ราวบรรทัด 226-229):

```tsx
                                <KV
                                    label={t('contract_auto_renew')}
                                    value={c.auto_renew ? (lang === 'th' ? 'ใช่' : 'Yes') : lang === 'th' ? 'ไม่' : 'No'}
                                />
```

- [ ] **Step 4: Footer — Cancel + Expired buttons, gated; hide Renew when expired**

แทนที่บล็อก footer (`{canEdit && !cancelled && (...)}`) ด้วย:

```tsx
                {/* Footer — Cancel / Expired (left) · Edit (right). Hidden entirely once terminal. */}
                {c.status !== 'cancelled' && c.status !== 'expired' && (canCancel || canExpire || canEdit) && (
                    <div className="border-border/60 bg-muted/30 flex items-center gap-2 border-t px-6 py-3">
                        {canCancel && (
                            <Button variant="destructive" onClick={handleCancel} disabled={cancel.isPending}>
                                <Ban className="h-4 w-4" />
                                {t('contract_cancel')}
                            </Button>
                        )}
                        {canExpire && (
                            <Button variant="outline" onClick={handleExpire} disabled={expire.isPending}>
                                <Archive className="h-4 w-4" />
                                {t('contract_expire')}
                            </Button>
                        )}
                        {canEdit && (
                            <Button variant="outline" className="ml-auto" onClick={() => onEdit(c)}>
                                <SquarePen className="h-4 w-4" />
                                {t('edit')}
                            </Button>
                        )}
                    </div>
                )}
```

> หมายเหตุ: ตัวแปร `cancelled` เดิม (บรรทัด ~115 `const cancelled = c.status === 'cancelled';`) ยังใช้กับ badge/KV อื่นได้ ปล่อยไว้. ถ้ามีการอ้าง Renew ในไฟล์นี้ ให้ครอบเงื่อนไข `c.status !== 'expired'` (ตรวจด้วยการค้นหา `renew` ในไฟล์ — ถ้าไม่มีก็ข้าม).

- [ ] **Step 5: Status badge label/tone supports overdue + expired**

หา `statusLabel`/`tone` ใน component (ใช้ตัวแปร `cancelled`) แล้วแทนที่ด้วยเวอร์ชันครบสถานะ:

```tsx
    const tone =
        c.status === 'cancelled' ? 'gray' : c.status === 'expired' ? 'gray' : c.status === 'overdue' ? 'red' : c.in_reminder ? 'amber' : 'green';
    const statusLabel =
        c.status === 'cancelled'
            ? t('contract_cancelled')
            : c.status === 'expired'
              ? t('contract_expired')
              : c.status === 'overdue'
                ? t('contract_overdue')
                : lang === 'th'
                  ? 'ใช้งาน'
                  : 'Active';
```

และ `daysBadge` เดิมที่ซ่อนเมื่อ `cancelled` → ซ่อนเมื่อ terminal:

```tsx
    const terminal = c.status === 'cancelled' || c.status === 'expired';
    const daysBadge = terminal ? null : (
```

(อัปเดตการอ้าง `cancelled` ที่ใช้กับ daysBadge/KV `contract_cancelled_on` ให้ยังทำงาน — `contract_cancelled_on` แสดงเมื่อ `c.status === 'cancelled' && c.cancelled_at`).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: ไฟล์ drawer ไม่มี error แล้ว (อาจเหลือ error ที่ผู้เรียก `<ContractDetailDrawer>` ยังไม่ส่ง `canCancel/canExpire` — แก้ใน Task 11; และ form-drawer auto_renew — Task 10).

- [ ] **Step 7: Commit**

```bash
git add resources/js/modules/contract/components/contract-detail-drawer.tsx
git commit -m "feat(contract-ui): expire action + permanent-close guard in detail drawer"
```

---

### Task 10: Form drawer — remove auto_renew toggle

**Files:**
- Modify: `resources/js/modules/contract/components/contract-form-drawer.tsx`

- [ ] **Step 1: Remove field from state shape + defaults + hydrate + submit**

ลบทุกการอ้าง `auto_renew` ในไฟล์:
- ใน type ของ `form` state: ลบ `auto_renew: boolean;`
- ใน default object: ลบ `auto_renew: false,`
- ในบล็อก hydrate ตอน edit (`editing`): ลบ `auto_renew: editing.auto_renew,`
- ในบล็อก payload ตอน submit: ลบ `auto_renew: form.auto_renew,`

- [ ] **Step 2: Remove the toggle UI**

ลบทั้ง `<Field label={t('contract_auto_renew')}>...</Field>` (ราวบรรทัด 678-696 — เริ่มจาก `<Field label={t('contract_auto_renew')}>` จนปิด `</Field>` ของบล็อกนั้น). ตรวจว่า layout grid รอบ ๆ ยังสมดุล (ถ้าเป็น 2-col grid ให้ดูว่าไม่มีช่องค้าง — ถ้าจำเป็นปรับ field ข้างเคียงให้เต็มแถว).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ที่เกี่ยวกับ `auto_renew` แล้ว.

- [ ] **Step 4: Commit**

```bash
git add resources/js/modules/contract/components/contract-form-drawer.tsx
git commit -m "feat(contract-ui): remove auto-renew toggle from contract form"
```

---

### Task 11: List page — badges, DaysCell, gating

**Files:**
- Modify: `resources/js/modules/contract/pages/index.tsx`

**Interfaces:**
- Consumes: `ContractStatus`, `canCancel`/`canExpire` passed to `ContractDetailDrawer`.

- [ ] **Step 1: Add permission gates**

ถัดจาก `const canImport = ...` (บรรทัด ~117) เพิ่ม:

```tsx
    const canCancel = isSuper || perms.includes('contracts.cancel');
    const canExpire = isSuper || perms.includes('contracts.expire');
```

- [ ] **Step 2: Pass gates to the drawer**

หา `<ContractDetailDrawer ... canEdit={canEdit} .../>` แล้วเพิ่ม props:

```tsx
                canEdit={canEdit}
                canCancel={canCancel}
                canExpire={canExpire}
```

- [ ] **Step 3: DaysCell overdue + expired**

แทนที่ function `DaysCell` ด้วย:

```tsx
/** Days-remaining cell: gray when cancelled/expired, blue far out, amber inside the reminder window, red once overdue. */
function DaysCell({ days, inReminder, status }: { days: number; inReminder: boolean; status: ContractStatus }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (status === 'cancelled') return <StatusBadge tone="gray">{t('contract_cancelled')}</StatusBadge>;
    if (status === 'expired') return <StatusBadge tone="gray">{t('contract_expired')}</StatusBadge>;
    if (days <= 0) return <StatusBadge tone="red">{lang === 'th' ? `เกินกำหนด ${-days} วัน` : `${-days}d overdue`}</StatusBadge>;
    if (inReminder)
        return (
            <StatusBadge tone="amber">
                {days} {lang === 'th' ? 'วัน' : 'days'}
            </StatusBadge>
        );
    return <StatusBadge tone="blue">{days}d</StatusBadge>;
}
```

- [ ] **Step 4: Row status badge**

แทนที่ badge สถานะในแถว (บรรทัด ~653-665) ด้วย:

```tsx
                <StatusBadge
                    tone={
                        c.status === 'cancelled' || c.status === 'expired' ? 'gray' : c.status === 'overdue' ? 'red' : 'green'
                    }
                >
                    {c.status === 'cancelled'
                        ? t('contract_cancelled')
                        : c.status === 'expired'
                          ? t('contract_expired')
                          : c.status === 'overdue'
                            ? t('contract_overdue')
                            : lang === 'th'
                              ? 'ใช้งาน'
                              : 'Active'}
                </StatusBadge>
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่ (0 error).

- [ ] **Step 6: Commit**

```bash
git add resources/js/modules/contract/pages/index.tsx
git commit -m "feat(contract-ui): overdue/expired badges + cancel/expire gating on list"
```

---

### Task 12: i18n copy + permission labels

**Files:**
- Modify: `resources/js/lang/en/contract.ts`, `resources/js/lang/th/contract.ts`, `resources/js/lang/en/permission.ts`, `resources/js/lang/th/permission.ts`, `resources/js/lang/en/notification.ts`, `resources/js/lang/th/notification.ts`, `resources/js/modules/permission/lib/permission-labels.ts`

**Interfaces:**
- Produces: all `useT()` keys referenced in Tasks 9-11 exist for en+th.

- [ ] **Step 1: Contract keys (en)**

In `resources/js/lang/en/contract.ts` เพิ่มคีย์ (ลบ `contract_auto_renew` ออกได้ เพราะเลิกใช้แล้ว):

```ts
    "contract_overdue": "Overdue",
    "contract_expired": "Expired",
    "contract_expire": "Mark as expired",
    "contract_expire_early_warn": "This contract has not reached its end date yet. Marking it expired closes it permanently — this cannot be undone.",
    "contract_expire_permanent_note": "This permanently closes the contract and cannot be undone.",
```

- [ ] **Step 2: Contract keys (th)**

In `resources/js/lang/th/contract.ts`:

```ts
    "contract_overdue": "เกินกำหนด",
    "contract_expired": "สิ้นสุดแล้ว",
    "contract_expire": "สิ้นสุดสัญญา",
    "contract_expire_early_warn": "สัญญานี้ยังไม่ถึงวันสิ้นสุด การกดสิ้นสุดจะปิดสัญญาอย่างถาวร — ย้อนกลับไม่ได้",
    "contract_expire_permanent_note": "การสิ้นสุดสัญญานี้เป็นการปิดถาวร ย้อนกลับไม่ได้",
```

- [ ] **Step 3: Permission action labels**

In `resources/js/lang/en/permission.ts` ถัดจาก `perm_act_contracts.renew`:

```ts
    "perm_act_contracts.cancel": "Cancel/reactivate contracts",
    "perm_act_contracts.expire": "Mark contracts as expired",
```

In `resources/js/lang/th/permission.ts`:

```ts
    "perm_act_contracts.cancel": "ยกเลิก/เปิดใช้สัญญาอีกครั้ง",
    "perm_act_contracts.expire": "สิ้นสุดสัญญา (ปิดถาวร)",
```

- [ ] **Step 4: Permission label ordering**

In `resources/js/modules/permission/lib/permission-labels.ts` ถัดจาก `'contracts.alerts',` เพิ่ม:

```ts
    'contracts.cancel',
    'contracts.expire',
```

- [ ] **Step 5: Notification copy relabel**

In `resources/js/lang/en/notification.ts` เปลี่ยน `notif_contract_expired`:

```ts
    "notif_contract_expired": "Overdue by {days} days — review, renew or close",
```

In `resources/js/lang/th/notification.ts`:

```ts
    "notif_contract_expired": "เกินกำหนดมาแล้ว {days} วัน — โปรดตรวจสอบ ต่ออายุ หรือปิดสัญญา",
```

- [ ] **Step 5b: Update the contract-import hint (drops auto_renew column)**

คีย์ `import_contract_hint` อยู่ใน `resources/js/lang/en/employee.ts` และ `resources/js/lang/th/employee.ts` (บรรทัด ~51) และยังระบุคอลัมน์ `auto_renew (1/0)`. เอา `auto_renew (1/0)` ออกให้ตรงกับ import-template ใหม่:

en:
```ts
    "import_contract_hint": "Columns: code (optional), vendor, name, type, start_date, end_date, value, billing_cycle, notes",
```
th: แก้สตริงเดียวกันให้ตัดคอลัมน์ auto_renew ออกด้วย (คงรูปแบบภาษาไทยเดิม).

ตรวจว่าไม่มี `auto_renew` เหลือใน `lang/` เลย: `grep -rn auto_renew resources/js/lang` → ต้องว่าง (รวมถึง `contract_auto_renew` ที่ลบไปแล้วใน Step 1-2).

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่าน (ทุกคีย์ที่อ้างมีครบ; ถ้า lang เป็น typed dict ตรวจว่าไม่มี key หายจาก locale ใด locale หนึ่ง).

- [ ] **Step 7: Commit**

```bash
git add resources/js/lang/en/contract.ts resources/js/lang/th/contract.ts resources/js/lang/en/permission.ts resources/js/lang/th/permission.ts resources/js/lang/en/notification.ts resources/js/lang/th/notification.ts resources/js/lang/en/employee.ts resources/js/lang/th/employee.ts resources/js/modules/permission/lib/permission-labels.ts
git commit -m "feat(contract-ui): i18n for overdue/expired + cancel/expire permission labels"
```

---

### Task 13: Full regression + README

**Files:**
- Modify: `Readme.md`

- [ ] **Step 1: Run the whole contract + permission suite**

Run: `php artisan test --compact --filter='Contract|Permission'`
Expected: PASS ทั้งหมด. ถ้ามี test เดิมที่ assert `auto_renew` หรือ `status === 'expired'` (แบบ date-passed) ให้แก้ให้ตรง semantics ใหม่ (overdue) — แก้เฉพาะ assertion, ห้ามลบ test.

- [ ] **Step 2: Full suite**

Run: `php artisan test --compact`
Expected: PASS. แก้ fallout ที่เกิดจากการลบ `auto_renew` / เปลี่ยน `expired`→`overdue` เท่าที่จำเป็น.

- [ ] **Step 3: Frontend build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 error.

- [ ] **Step 4: Update README**

เพิ่มสรุป phase นี้ท้าย `Readme.md` (1 ย่อหน้า): เปลี่ยน derived status เป็น active/overdue/cancelled/expired, เพิ่ม action Expired (ถาวร) + permission `contracts.cancel`/`contracts.expire`, generalize write-off guard ทุกประเภท, ตัด auto-renew, alert relabel overdue.

- [ ] **Step 5: Commit**

```bash
git add Readme.md
git commit -m "docs: summarize contract lifecycle rework (overdue/expired/permissions)"
```

---

## Self-Review Notes

- **Spec coverage:** §2 status→Task1; §3 DB→Task1; §4.1→Task1; §4.2→Task2; §4.3→Task4; §4.4→Task5; §4.5→Task5; §4.6→Task6; §4.7→Task7; §4.8→Task3; §4.9→Task4; §5.1→Task8; §5.2→Task8; §5.3→Task9; §5.4→Task10; §5.5→Task11; §5.6+5.7→Task12; §6 rules→Tasks 2/4/9; §7 tests→Tasks1-6,13.
- **Type consistency:** `assertNoPendingAssets` (Task2) referenced only in Task2; `expire()`/`expire` mutation consistent Tasks 2/4/8/9; `canCancel`/`canExpire` consistent Tasks 9/11; status strings `'overdue'`/`'expired'` consistent across Tasks 1/8/9/11.
- **Known follow-up (out of scope):** reactivate-from-cancelled has no dedicated UI button today; the `contracts.cancel`-gated endpoint already supports it if surfaced later.
