# Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track which IT resources (email groups, file shares, social/internet platforms) each employee can access, with soft-revoke and a per-employee Access view.

**Architecture:** Three resource tables (`email_groups`, `file_shares`, `social_platforms`) + one polymorphic `access_memberships` table (soft-revoke via `revoked_at`). An `AccessService` centralizes grant/revoke/per-employee queries. Reads gated by `access.view`, writes by `access.manage`. Frontend: an Access Control page (3 sub-tabs + members drawer) and a new "Access" tab in the redesigned employee detail dialog.

**Tech Stack:** Laravel 12 (PHP 8.2), React 19 SPA + TypeScript, TanStack Query, Tailwind v4, Sanctum. Tests: PHPUnit feature tests (sqlite `:memory:`).

**Spec:** `docs/superpowers/specs/2026-06-13-access-control-design.md`

---

## File Structure

**Backend**
- `database/migrations/2026_06_13_100001_create_email_groups_table.php`
- `database/migrations/2026_06_13_100002_create_file_shares_table.php`
- `database/migrations/2026_06_13_100003_create_social_platforms_table.php`
- `database/migrations/2026_06_13_100004_create_access_memberships_table.php`
- `app/Models/EmailGroup.php`, `FileShare.php`, `SocialPlatform.php`, `AccessMembership.php`
- `app/Support/Permissions.php` (modify: add `access` module + defaults)
- `app/Services/AccessService.php`
- `app/Http/Requests/StoreEmailGroupRequest.php`, `StoreFileShareRequest.php`, `StoreSocialPlatformRequest.php`, `StoreAccessMembershipRequest.php`
- `app/Http/Resources/EmailGroupResource.php`, `FileShareResource.php`, `SocialPlatformResource.php`, `AccessMembershipResource.php`, `EmployeeAccessResource.php`
- `app/Http/Controllers/Api/EmailGroupController.php`, `FileShareController.php`, `SocialPlatformController.php`, `AccessController.php`
- `routes/api.php` (modify: add access routes)
- `database/seeders/AccessSeeder.php` + register in `DatabaseSeeder`

**Frontend**
- `resources/js/types/index.ts` (modify: add types)
- `resources/js/services/accessApi.ts`
- `resources/js/hooks/use-access.ts`
- `resources/js/pages/access/index.tsx` (page + 3 sub-tabs)
- `resources/js/components/access/resource-modal.tsx`, `members-drawer.tsx`
- `resources/js/components/employees/employee-view-drawer.tsx` (modify: add Access tab)
- `resources/js/lib/i18n.ts` (modify: keys)
- routing/nav registration (modify wherever the SPA routes + sidebar live)

**Tests**
- `tests/Feature/AccessControlTest.php`, `tests/Feature/AccessMembershipTest.php`, `tests/Feature/EmployeeAccessTest.php`

---

## Task 1: Migrations — the four tables

**Files:**
- Create: the 4 migration files listed above
- Test: `tests/Feature/AccessControlTest.php`

- [ ] **Step 1: Write `email_groups` migration**

Create `database/migrations/2026_06_13_100001_create_email_groups_table.php`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_groups', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();          // MG-####
            $table->string('name');
            $table->string('email')->unique();
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->string('description')->nullable();
            $table->foreignId('owner_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_groups');
    }
};
```

- [ ] **Step 2: Write `file_shares` migration**

Create `database/migrations/2026_06_13_100002_create_file_shares_table.php`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('file_shares', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();          // FS-####
            $table->string('name');
            $table->string('path');
            $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
            $table->string('size_label')->nullable();
            $table->foreignId('owner_employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('file_shares');
    }
};
```

- [ ] **Step 3: Write `social_platforms` migration**

Create `database/migrations/2026_06_13_100003_create_social_platforms_table.php`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_platforms', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();          // SM-####
            $table->string('name');
            $table->string('url')->nullable();
            $table->string('color')->nullable();
            $table->text('policy')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('social_platforms');
    }
};
```

- [ ] **Step 4: Write `access_memberships` migration**

Create `database/migrations/2026_06_13_100004_create_access_memberships_table.php`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('access_memberships', function (Blueprint $table) {
            $table->id();
            $table->morphs('resource'); // resource_type + resource_id (+ index)
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('access_level')->nullable(); // email: Owner/Member · file: Full/Write/Read · social: null
            $table->string('purpose')->nullable();
            $table->date('granted_at');
            $table->foreignId('granted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->date('revoked_at')->nullable();     // soft-revoke; active = null
            $table->timestamps();
            $table->index(['employee_id', 'revoked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('access_memberships');
    }
};
```

- [ ] **Step 5: Write a schema test**

Create `tests/Feature/AccessControlTest.php`:
```php
<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    public function test_access_tables_exist_with_expected_columns(): void
    {
        $this->assertTrue(Schema::hasColumns('email_groups', ['code', 'name', 'email', 'department_id', 'owner_employee_id']));
        $this->assertTrue(Schema::hasColumns('file_shares', ['code', 'name', 'path', 'size_label', 'owner_employee_id']));
        $this->assertTrue(Schema::hasColumns('social_platforms', ['code', 'name', 'url', 'color', 'policy']));
        $this->assertTrue(Schema::hasColumns('access_memberships', ['resource_type', 'resource_id', 'employee_id', 'access_level', 'purpose', 'granted_at', 'revoked_at']));
    }
}
```

- [ ] **Step 6: Run the test (expect PASS — RefreshDatabase runs migrations)**

Run: `php artisan test --filter AccessControlTest::test_access_tables_exist_with_expected_columns`
Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add database/migrations/2026_06_13_1000*_*.php tests/Feature/AccessControlTest.php
git commit -m "feat(access): create email_groups, file_shares, social_platforms, access_memberships tables"
```

---

## Task 2: Permission keys

**Files:**
- Modify: `app/Support/Permissions.php`
- Test: `tests/Feature/AccessControlTest.php`

- [ ] **Step 1: Write the failing test**

Add to `tests/Feature/AccessControlTest.php`:
```php
    public function test_access_permission_keys_are_registered(): void
    {
        $this->assertContains('access.view', \App\Support\Permissions::all());
        $this->assertContains('access.manage', \App\Support\Permissions::all());
        // IT/admin role gets both by default
        $this->assertContains('access.manage', \App\Support\Permissions::defaults()['admin']);
    }
```

- [ ] **Step 2: Run it (expect FAIL — keys missing)**

Run: `php artisan test --filter AccessControlTest::test_access_permission_keys_are_registered`
Expected: FAIL.

- [ ] **Step 3: Add the `access` module to the catalog**

In `app/Support/Permissions.php`, inside `catalog()` add after the `employees` line:
```php
            'access' => ['view', 'manage'],
```

- [ ] **Step 4: Grant to roles in `defaults()`**

In the `'admin'` array add: `'access.view', 'access.manage',`
In the `'hr'` array add: `'access.view',`

- [ ] **Step 5: Run the test (expect PASS)**

Run: `php artisan test --filter AccessControlTest::test_access_permission_keys_are_registered`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add app/Support/Permissions.php tests/Feature/AccessControlTest.php
git commit -m "feat(access): register access.view + access.manage permissions"
```

---

## Task 3: Models

**Files:**
- Create: `app/Models/EmailGroup.php`, `FileShare.php`, `SocialPlatform.php`, `AccessMembership.php`
- Test: `tests/Feature/AccessControlTest.php`

- [ ] **Step 1: Write the failing test**

Add to `tests/Feature/AccessControlTest.php` (imports at top: `use App\Models\{EmailGroup, FileShare, SocialPlatform, AccessMembership, Employee};`):
```php
    public function test_models_auto_code_and_relations(): void
    {
        $g = EmailGroup::create(['name' => 'QA Team', 'email' => 'qa@x.co']);
        $this->assertStringStartsWith('MG-', $g->fresh()->code);

        $fs = FileShare::create(['name' => 'Recipes', 'path' => '\\\\F\\R']);
        $this->assertStringStartsWith('FS-', $fs->fresh()->code);

        $sp = SocialPlatform::create(['name' => 'LINE']);
        $this->assertStringStartsWith('SM-', $sp->fresh()->code);

        $emp = Employee::create(['first_name' => 'A', 'last_name' => 'B']);
        $m = $g->memberships()->create(['employee_id' => $emp->id, 'access_level' => 'Member', 'granted_at' => '2026-01-01']);
        $this->assertTrue($g->memberships()->whereNull('revoked_at')->exists());
        $this->assertSame($emp->id, $m->employee->id);
        $this->assertInstanceOf(EmailGroup::class, $m->resource);
    }
```

- [ ] **Step 2: Run it (expect FAIL — models missing)**

Run: `php artisan test --filter AccessControlTest::test_models_auto_code_and_relations`
Expected: FAIL.

- [ ] **Step 3: Create `EmailGroup` model**

`app/Models/EmailGroup.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class EmailGroup extends Model
{
    protected $fillable = ['code', 'name', 'email', 'department_id', 'description', 'owner_employee_id'];

    protected static function booted(): void
    {
        static::creating(function (EmailGroup $g) {
            if (blank($g->code)) {
                $max = (int) str_replace('MG-', '', (string) static::max('code'));
                $g->code = 'MG-'.str_pad((string) ($max + 1), 4, '0', STR_PAD_LEFT);
            }
        });
    }

    public function memberships(): MorphMany
    {
        return $this->morphMany(AccessMembership::class, 'resource');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'owner_employee_id');
    }
}
```

- [ ] **Step 4: Create `FileShare` model**

`app/Models/FileShare.php` — identical shape, `FS-` prefix, fillable `['code','name','path','department_id','size_label','owner_employee_id']`, same `memberships()`, `department()`, `owner()`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class FileShare extends Model
{
    protected $fillable = ['code', 'name', 'path', 'department_id', 'size_label', 'owner_employee_id'];

    protected static function booted(): void
    {
        static::creating(function (FileShare $fs) {
            if (blank($fs->code)) {
                $max = (int) str_replace('FS-', '', (string) static::max('code'));
                $fs->code = 'FS-'.str_pad((string) ($max + 1), 4, '0', STR_PAD_LEFT);
            }
        });
    }

    public function memberships(): MorphMany
    {
        return $this->morphMany(AccessMembership::class, 'resource');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'owner_employee_id');
    }
}
```

- [ ] **Step 5: Create `SocialPlatform` model**

`app/Models/SocialPlatform.php` (no owner/department):
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class SocialPlatform extends Model
{
    protected $fillable = ['code', 'name', 'url', 'color', 'policy'];

    protected static function booted(): void
    {
        static::creating(function (SocialPlatform $sp) {
            if (blank($sp->code)) {
                $max = (int) str_replace('SM-', '', (string) static::max('code'));
                $sp->code = 'SM-'.str_pad((string) ($max + 1), 4, '0', STR_PAD_LEFT);
            }
        });
    }

    public function memberships(): MorphMany
    {
        return $this->morphMany(AccessMembership::class, 'resource');
    }
}
```

- [ ] **Step 6: Create `AccessMembership` model**

`app/Models/AccessMembership.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class AccessMembership extends Model
{
    protected $fillable = ['resource_type', 'resource_id', 'employee_id', 'access_level', 'purpose', 'granted_at', 'granted_by', 'revoked_at'];

    protected function casts(): array
    {
        return ['granted_at' => 'date', 'revoked_at' => 'date'];
    }

    /** Only memberships that have not been revoked. */
    public function scopeActive(Builder $q): Builder
    {
        return $q->whereNull('revoked_at');
    }

    public function resource(): MorphTo
    {
        return $this->morphTo();
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function grantedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'granted_by');
    }
}
```

- [ ] **Step 7: Register the morph map** so `resource_type` stores short aliases.

In `app/Providers/AppServiceProvider.php` `boot()`, add (import `use Illuminate\Database\Eloquent\Relations\Relation;`):
```php
Relation::enforceMorphMap([
    'email_group'     => \App\Models\EmailGroup::class,
    'file_share'      => \App\Models\FileShare::class,
    'social_platform' => \App\Models\SocialPlatform::class,
]);
```

- [ ] **Step 8: Run the test (expect PASS)**

Run: `php artisan test --filter AccessControlTest::test_models_auto_code_and_relations`
Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git add app/Models/EmailGroup.php app/Models/FileShare.php app/Models/SocialPlatform.php app/Models/AccessMembership.php app/Providers/AppServiceProvider.php tests/Feature/AccessControlTest.php
git commit -m "feat(access): EmailGroup/FileShare/SocialPlatform/AccessMembership models + morph map"
```

---

## Task 4: AccessService

**Files:**
- Create: `app/Services/AccessService.php`
- Test: `tests/Feature/AccessMembershipTest.php`

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/AccessMembershipTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Models\{EmailGroup, Employee};
use App\Services\AccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class AccessMembershipTest extends TestCase
{
    use RefreshDatabase;

    private function svc(): AccessService { return app(AccessService::class); }

    public function test_grant_then_duplicate_active_is_rejected(): void
    {
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);

        $m = $this->svc()->grant($g, $e->id, ['access_level' => 'Member']);
        $this->assertNull($m->revoked_at);

        $this->expectException(ValidationException::class);
        $this->svc()->grant($g, $e->id, ['access_level' => 'Member']);
    }

    public function test_revoke_is_soft_and_allows_regrant(): void
    {
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);

        $m = $this->svc()->grant($g, $e->id, ['access_level' => 'Member']);
        $this->svc()->revoke($m);
        $this->assertNotNull($m->fresh()->revoked_at);
        $this->assertSame(0, $g->memberships()->active()->count());

        // re-grant allowed after revoke
        $m2 = $this->svc()->grant($g, $e->id, ['access_level' => 'Owner']);
        $this->assertNull($m2->revoked_at);
    }
}
```

- [ ] **Step 2: Run it (expect FAIL — service missing)**

Run: `php artisan test --filter AccessMembershipTest`
Expected: FAIL.

- [ ] **Step 3: Implement `AccessService`**

`app/Services/AccessService.php`:
```php
<?php

namespace App\Services;

use App\Models\AccessMembership;
use App\Models\Employee;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class AccessService
{
    /**
     * Grant an employee access to a resource. Rejects a second ACTIVE grant for
     * the same (resource, employee). Returns the membership.
     *
     * @param  array{access_level?: string|null, purpose?: string|null, granted_at?: string|null}  $attrs
     */
    public function grant(Model $resource, int $employeeId, array $attrs): AccessMembership
    {
        $exists = $resource->memberships()->active()->where('employee_id', $employeeId)->exists();
        if ($exists) {
            throw ValidationException::withMessages(['employee_id' => 'This employee already has active access to the resource.']);
        }

        return $resource->memberships()->create([
            'employee_id' => $employeeId,
            'access_level' => $attrs['access_level'] ?? null,
            'purpose' => $attrs['purpose'] ?? null,
            'granted_at' => $attrs['granted_at'] ?? now()->toDateString(),
            'granted_by' => auth()->user()?->id,
        ]);
    }

    /** Soft-revoke (idempotent). */
    public function revoke(AccessMembership $membership): AccessMembership
    {
        if (! $membership->revoked_at) {
            $membership->update(['revoked_at' => now()->toDateString()]);
        }

        return $membership;
    }

    /**
     * Active memberships for an employee grouped by resource type, eager-loaded.
     *
     * @return array{email_group: Collection, file_share: Collection, social_platform: Collection}
     */
    public function employeeAccess(Employee $employee): array
    {
        $all = AccessMembership::query()->active()
            ->where('employee_id', $employee->id)
            ->with('resource')
            ->get();

        return [
            'email_group' => $all->where('resource_type', 'email_group')->values(),
            'file_share' => $all->where('resource_type', 'file_share')->values(),
            'social_platform' => $all->where('resource_type', 'social_platform')->values(),
        ];
    }
}
```

- [ ] **Step 4: Run the test (expect PASS)**

Run: `php artisan test --filter AccessMembershipTest`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add app/Services/AccessService.php tests/Feature/AccessMembershipTest.php
git commit -m "feat(access): AccessService grant/revoke/employeeAccess"
```

---

## Task 5: Form Requests + API Resources

**Files:**
- Create: `app/Http/Requests/StoreEmailGroupRequest.php`, `StoreFileShareRequest.php`, `StoreSocialPlatformRequest.php`, `StoreAccessMembershipRequest.php`
- Create: `app/Http/Resources/EmailGroupResource.php`, `FileShareResource.php`, `SocialPlatformResource.php`, `AccessMembershipResource.php`, `EmployeeAccessResource.php`

- [ ] **Step 1: `StoreEmailGroupRequest`**
```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreEmailGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('access.manage');
    }

    public function rules(): array
    {
        $id = $this->route('email_group')?->id;

        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('email_groups', 'email')->ignore($id)],
            'department_id' => ['nullable', 'exists:departments,id'],
            'description' => ['nullable', 'string', 'max:500'],
            'owner_employee_id' => ['nullable', 'exists:employees,id'],
        ];
    }
}
```

- [ ] **Step 2: `StoreFileShareRequest`**
```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreFileShareRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('access.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'path' => ['required', 'string', 'max:255'],
            'department_id' => ['nullable', 'exists:departments,id'],
            'size_label' => ['nullable', 'string', 'max:50'],
            'owner_employee_id' => ['nullable', 'exists:employees,id'],
        ];
    }
}
```

- [ ] **Step 3: `StoreSocialPlatformRequest`**
```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSocialPlatformRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('access.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'url' => ['nullable', 'string', 'max:255'],
            'color' => ['nullable', 'string', 'max:20'],
            'policy' => ['nullable', 'string', 'max:500'],
        ];
    }
}
```

- [ ] **Step 4: `StoreAccessMembershipRequest`** (access-level rules per resource type)
```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAccessMembershipRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('access.manage');
    }

    public function rules(): array
    {
        // The controller sets $this->resourceType before validation (see Task 6).
        $type = $this->input('_resource_type');
        $levels = match ($type) {
            'email_group' => ['Owner', 'Member'],
            'file_share' => ['Full', 'Write', 'Read'],
            default => [],
        };

        return [
            'employee_id' => ['required', 'exists:employees,id'],
            'access_level' => $levels ? ['required', Rule::in($levels)] : ['nullable'],
            'purpose' => ['nullable', 'string', 'max:255'],
            'granted_at' => ['nullable', 'date'],
        ];
    }
}
```

- [ ] **Step 5: Resources** — create all five.

`EmailGroupResource.php`:
```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\EmailGroup */
class EmailGroupResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'email' => $this->email,
            'department_id' => $this->department_id,
            'department' => $this->whenLoaded('department', fn () => $this->department?->name),
            'description' => $this->description,
            'owner_employee_id' => $this->owner_employee_id,
            'owner' => $this->whenLoaded('owner', fn () => $this->owner?->name),
            'members_count' => $this->whenCounted('activeMemberships', $this->active_memberships_count, $this->memberships()->active()->count()),
        ];
    }
}
```

`FileShareResource.php` — same shape with `path`, `size_label` instead of `email`/`description`:
```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\FileShare */
class FileShareResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'path' => $this->path,
            'department_id' => $this->department_id,
            'department' => $this->whenLoaded('department', fn () => $this->department?->name),
            'size_label' => $this->size_label,
            'owner_employee_id' => $this->owner_employee_id,
            'owner' => $this->whenLoaded('owner', fn () => $this->owner?->name),
            'members_count' => $this->memberships()->active()->count(),
        ];
    }
}
```

`SocialPlatformResource.php`:
```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\SocialPlatform */
class SocialPlatformResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'url' => $this->url,
            'color' => $this->color,
            'policy' => $this->policy,
            'members_count' => $this->memberships()->active()->count(),
        ];
    }
}
```

`AccessMembershipResource.php` (used inside resource member lists + employee access):
```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\AccessMembership */
class AccessMembershipResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'employee' => $this->whenLoaded('employee', fn () => $this->employee?->name),
            'access_level' => $this->access_level,
            'purpose' => $this->purpose,
            'granted_at' => $this->granted_at?->toDateString(),
            'revoked_at' => $this->revoked_at?->toDateString(),
        ];
    }
}
```

`EmployeeAccessResource.php` — wraps the `AccessService::employeeAccess()` shape. It is a plain resource over an array; include resource label per membership:
```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Expects ['email_group'=>Collection,'file_share'=>Collection,'social_platform'=>Collection,'outstanding'=>bool].
 */
class EmployeeAccessResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $map = fn ($items) => collect($items)->map(fn ($m) => [
            'id' => $m->id,
            'resource_id' => $m->resource_id,
            'resource_name' => $m->resource?->name,
            'resource_code' => $m->resource?->code,
            'resource_detail' => $m->resource?->email ?? $m->resource?->path ?? $m->resource?->url,
            'resource_color' => $m->resource?->color,
            'access_level' => $m->access_level,
            'purpose' => $m->purpose,
            'granted_at' => $m->granted_at?->toDateString(),
        ])->values();

        return [
            'email_groups' => $map($this->resource['email_group']),
            'file_shares' => $map($this->resource['file_share']),
            'social' => $map($this->resource['social_platform']),
            'outstanding' => (bool) ($this->resource['outstanding'] ?? false),
        ];
    }
}
```

- [ ] **Step 6: Commit**
```bash
git add app/Http/Requests/Store{EmailGroup,FileShare,SocialPlatform,AccessMembership}Request.php app/Http/Resources/{EmailGroup,FileShare,SocialPlatform,AccessMembership,EmployeeAccess}Resource.php
git commit -m "feat(access): form requests + API resources"
```

---

## Task 6: Controllers + routes (with feature tests)

**Files:**
- Create: `app/Http/Controllers/Api/EmailGroupController.php`, `FileShareController.php`, `SocialPlatformController.php`, `AccessController.php`
- Modify: `routes/api.php`
- Test: `tests/Feature/AccessControlTest.php`, `tests/Feature/EmployeeAccessTest.php`

- [ ] **Step 1: Write failing feature tests**

Add to `tests/Feature/AccessControlTest.php` (top imports: `use App\Models\{User, EmailGroup, Employee};`):
```php
    public function test_manage_permission_required_to_create_group(): void
    {
        // user role lacks access.manage
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->postJson('/api/email-groups', ['name' => 'X', 'email' => 'x@x.co'])->assertForbidden();

        // admin role has it
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $this->postJson('/api/email-groups', ['name' => 'QA', 'email' => 'qa@x.co'])
            ->assertStatus(201)
            ->assertJsonPath('data.code', fn ($c) => str_starts_with($c, 'MG-'));
    }

    public function test_grant_and_soft_revoke_member(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);

        $m = $this->postJson("/api/email-groups/{$g->id}/members", ['employee_id' => $e->id, 'access_level' => 'Member'])
            ->assertStatus(201)->json('data.id');

        $this->postJson("/api/email-groups/{$g->id}/members/{$m}/revoke")->assertOk();
        $this->assertNotNull(\App\Models\AccessMembership::find($m)->revoked_at);
    }

    public function test_cannot_delete_group_with_active_members(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);
        $g->memberships()->create(['employee_id' => $e->id, 'access_level' => 'Member', 'granted_at' => '2026-01-01']);

        $this->deleteJson("/api/email-groups/{$g->id}")->assertStatus(422)->assertJsonPath('message', 'resource_has_members');
    }
```

Create `tests/Feature/EmployeeAccessTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Models\{User, EmailGroup, Employee};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeeAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_employee_access_endpoint_groups_active_memberships(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);
        $g->memberships()->create(['employee_id' => $e->id, 'access_level' => 'Member', 'granted_at' => '2026-01-01']);

        $this->getJson("/api/employees/{$e->id}/access")
            ->assertOk()
            ->assertJsonCount(1, 'data.email_groups')
            ->assertJsonPath('data.outstanding', false);
    }

    public function test_resigned_employee_access_is_flagged_outstanding(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B', 'status' => 'resigned']);
        $g->memberships()->create(['employee_id' => $e->id, 'access_level' => 'Member', 'granted_at' => '2026-01-01']);

        $this->getJson("/api/employees/{$e->id}/access")->assertOk()->assertJsonPath('data.outstanding', true);
    }
}
```

- [ ] **Step 2: Run them (expect FAIL — routes/controllers missing)**

Run: `php artisan test --filter "AccessControlTest|EmployeeAccessTest"`
Expected: FAIL.

- [ ] **Step 3: `EmailGroupController`** (registry CRUD + member actions + delete-guard)
```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAccessMembershipRequest;
use App\Http\Requests\StoreEmailGroupRequest;
use App\Http\Resources\AccessMembershipResource;
use App\Http\Resources\EmailGroupResource;
use App\Models\AccessMembership;
use App\Models\EmailGroup;
use App\Services\AccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmailGroupController extends Controller
{
    public function index(): JsonResponse
    {
        return EmailGroupResource::collection(EmailGroup::with(['department', 'owner'])->orderBy('code')->get())->response();
    }

    public function store(StoreEmailGroupRequest $request): JsonResponse
    {
        $g = EmailGroup::create($request->validated());

        return (new EmailGroupResource($g))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function update(StoreEmailGroupRequest $request, EmailGroup $emailGroup): JsonResponse
    {
        $emailGroup->update($request->validated());

        return (new EmailGroupResource($emailGroup))->additional(['message' => 'success'])->response();
    }

    public function destroy(EmailGroup $emailGroup): JsonResponse
    {
        if ($emailGroup->memberships()->active()->exists()) {
            return response()->json(['message' => 'resource_has_members'], 422);
        }
        $emailGroup->delete();

        return response()->json(['message' => 'success']);
    }

    public function members(EmailGroup $emailGroup): JsonResponse
    {
        $members = $emailGroup->memberships()->active()->with('employee')->get();

        return AccessMembershipResource::collection($members)->response();
    }

    public function addMember(StoreAccessMembershipRequest $request, EmailGroup $emailGroup, AccessService $svc): JsonResponse
    {
        $request->merge(['_resource_type' => 'email_group']);
        $data = $request->validated();
        $m = $svc->grant($emailGroup, (int) $data['employee_id'], $data);

        return (new AccessMembershipResource($m->load('employee')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function revokeMember(EmailGroup $emailGroup, AccessMembership $membership, AccessService $svc): JsonResponse
    {
        $svc->revoke($membership);

        return response()->json(['message' => 'success']);
    }
}
```

> NOTE: `StoreAccessMembershipRequest::rules()` reads `_resource_type`; since `merge()` runs in the controller AFTER the request resolves, instead set it via `prepareForValidation`. Simplest robust approach: in `StoreAccessMembershipRequest` add:
> ```php
> protected function prepareForValidation(): void
> {
>     // resource type derived from the route name prefix (email-groups|file-shares|social-platforms)
>     $path = $this->path();
>     $type = str_contains($path, 'email-groups') ? 'email_group'
>         : (str_contains($path, 'file-shares') ? 'file_share' : 'social_platform');
>     $this->merge(['_resource_type' => $type]);
> }
> ```
> Then remove the `$request->merge(...)` line from each controller. Apply this in Step 3 before running tests.

- [ ] **Step 4: `FileShareController`** — same as EmailGroupController with `FileShare`, `StoreFileShareRequest`, `FileShareResource`, route-model param `$fileShare`. Member methods identical (grant uses `file_share` type via prepareForValidation).
```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAccessMembershipRequest;
use App\Http\Requests\StoreFileShareRequest;
use App\Http\Resources\AccessMembershipResource;
use App\Http\Resources\FileShareResource;
use App\Models\AccessMembership;
use App\Models\FileShare;
use App\Services\AccessService;
use Illuminate\Http\JsonResponse;

class FileShareController extends Controller
{
    public function index(): JsonResponse
    {
        return FileShareResource::collection(FileShare::with(['department', 'owner'])->orderBy('code')->get())->response();
    }

    public function store(StoreFileShareRequest $request): JsonResponse
    {
        $fs = FileShare::create($request->validated());

        return (new FileShareResource($fs))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function update(StoreFileShareRequest $request, FileShare $fileShare): JsonResponse
    {
        $fileShare->update($request->validated());

        return (new FileShareResource($fileShare))->additional(['message' => 'success'])->response();
    }

    public function destroy(FileShare $fileShare): JsonResponse
    {
        if ($fileShare->memberships()->active()->exists()) {
            return response()->json(['message' => 'resource_has_members'], 422);
        }
        $fileShare->delete();

        return response()->json(['message' => 'success']);
    }

    public function members(FileShare $fileShare): JsonResponse
    {
        return AccessMembershipResource::collection($fileShare->memberships()->active()->with('employee')->get())->response();
    }

    public function addMember(StoreAccessMembershipRequest $request, FileShare $fileShare, AccessService $svc): JsonResponse
    {
        $data = $request->validated();
        $m = $svc->grant($fileShare, (int) $data['employee_id'], $data);

        return (new AccessMembershipResource($m->load('employee')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function revokeMember(FileShare $fileShare, AccessMembership $membership, AccessService $svc): JsonResponse
    {
        $svc->revoke($membership);

        return response()->json(['message' => 'success']);
    }
}
```

- [ ] **Step 5: `SocialPlatformController`** — same shape with `SocialPlatform`, `StoreSocialPlatformRequest`, `SocialPlatformResource`, param `$socialPlatform`; members have null access_level + optional purpose.
```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAccessMembershipRequest;
use App\Http\Requests\StoreSocialPlatformRequest;
use App\Http\Resources\AccessMembershipResource;
use App\Http\Resources\SocialPlatformResource;
use App\Models\AccessMembership;
use App\Models\SocialPlatform;
use App\Services\AccessService;
use Illuminate\Http\JsonResponse;

class SocialPlatformController extends Controller
{
    public function index(): JsonResponse
    {
        return SocialPlatformResource::collection(SocialPlatform::orderBy('code')->get())->response();
    }

    public function store(StoreSocialPlatformRequest $request): JsonResponse
    {
        $sp = SocialPlatform::create($request->validated());

        return (new SocialPlatformResource($sp))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function update(StoreSocialPlatformRequest $request, SocialPlatform $socialPlatform): JsonResponse
    {
        $socialPlatform->update($request->validated());

        return (new SocialPlatformResource($socialPlatform))->additional(['message' => 'success'])->response();
    }

    public function destroy(SocialPlatform $socialPlatform): JsonResponse
    {
        if ($socialPlatform->memberships()->active()->exists()) {
            return response()->json(['message' => 'resource_has_members'], 422);
        }
        $socialPlatform->delete();

        return response()->json(['message' => 'success']);
    }

    public function members(SocialPlatform $socialPlatform): JsonResponse
    {
        return AccessMembershipResource::collection($socialPlatform->memberships()->active()->with('employee')->get())->response();
    }

    public function addMember(StoreAccessMembershipRequest $request, SocialPlatform $socialPlatform, AccessService $svc): JsonResponse
    {
        $data = $request->validated();
        $m = $svc->grant($socialPlatform, (int) $data['employee_id'], $data);

        return (new AccessMembershipResource($m->load('employee')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function revokeMember(SocialPlatform $socialPlatform, AccessMembership $membership, AccessService $svc): JsonResponse
    {
        $svc->revoke($membership);

        return response()->json(['message' => 'success']);
    }
}
```

- [ ] **Step 6: `AccessController`** (per-employee access)
```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\EmployeeAccessResource;
use App\Models\Employee;
use App\Services\AccessService;
use Illuminate\Http\JsonResponse;

class AccessController extends Controller
{
    public function employee(Employee $employee, AccessService $svc): JsonResponse
    {
        $grouped = $svc->employeeAccess($employee);
        $grouped['outstanding'] = $employee->status?->value === 'resigned'
            && ($grouped['email_group']->isNotEmpty() || $grouped['file_share']->isNotEmpty() || $grouped['social_platform']->isNotEmpty());

        return (new EmployeeAccessResource($grouped))->response();
    }
}
```

- [ ] **Step 7: Routes** — add to `routes/api.php` inside the `auth:sanctum` group:
```php
    // Access Control — reads gated by access.view, writes by access.manage
    Route::middleware('permission:access.view')->group(function () {
        Route::get('email-groups', [\App\Http\Controllers\Api\EmailGroupController::class, 'index']);
        Route::get('file-shares', [\App\Http\Controllers\Api\FileShareController::class, 'index']);
        Route::get('social-platforms', [\App\Http\Controllers\Api\SocialPlatformController::class, 'index']);
        Route::get('email-groups/{emailGroup}/members', [\App\Http\Controllers\Api\EmailGroupController::class, 'members']);
        Route::get('file-shares/{fileShare}/members', [\App\Http\Controllers\Api\FileShareController::class, 'members']);
        Route::get('social-platforms/{socialPlatform}/members', [\App\Http\Controllers\Api\SocialPlatformController::class, 'members']);
        Route::get('employees/{employee}/access', [\App\Http\Controllers\Api\AccessController::class, 'employee']);
    });
    Route::middleware('permission:access.manage')->group(function () {
        Route::apiResource('email-groups', \App\Http\Controllers\Api\EmailGroupController::class)->except(['index', 'show']);
        Route::apiResource('file-shares', \App\Http\Controllers\Api\FileShareController::class)->except(['index', 'show']);
        Route::apiResource('social-platforms', \App\Http\Controllers\Api\SocialPlatformController::class)->except(['index', 'show']);
        Route::post('email-groups/{emailGroup}/members', [\App\Http\Controllers\Api\EmailGroupController::class, 'addMember']);
        Route::post('email-groups/{emailGroup}/members/{membership}/revoke', [\App\Http\Controllers\Api\EmailGroupController::class, 'revokeMember']);
        Route::post('file-shares/{fileShare}/members', [\App\Http\Controllers\Api\FileShareController::class, 'addMember']);
        Route::post('file-shares/{fileShare}/members/{membership}/revoke', [\App\Http\Controllers\Api\FileShareController::class, 'revokeMember']);
        Route::post('social-platforms/{socialPlatform}/members', [\App\Http\Controllers\Api\SocialPlatformController::class, 'addMember']);
        Route::post('social-platforms/{socialPlatform}/members/{membership}/revoke', [\App\Http\Controllers\Api\SocialPlatformController::class, 'revokeMember']);
    });
```
> Place the member GET routes BEFORE `apiResource` is not required (different verbs/paths), but keep the `{membership}` route param named `membership` so `AccessMembership` route-model-binds (it will by type-hint).

- [ ] **Step 8: Run the tests (expect PASS)**

Run: `php artisan test --filter "AccessControlTest|EmployeeAccessTest"`
Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git add app/Http/Controllers/Api/{EmailGroup,FileShare,SocialPlatform,Access}Controller.php app/Http/Requests/StoreAccessMembershipRequest.php routes/api.php tests/Feature/AccessControlTest.php tests/Feature/EmployeeAccessTest.php
git commit -m "feat(access): registry CRUD + member grant/revoke + per-employee access endpoint"
```

---

## Task 7: Demo seeder

**Files:**
- Create: `database/seeders/AccessSeeder.php`
- Modify: `database/seeders/DatabaseSeeder.php` (call AccessSeeder after OrgSeeder)

- [ ] **Step 1: Write `AccessSeeder`** (mirror a subset of the design's data.js)
```php
<?php

namespace Database\Seeders;

use App\Models\AccessMembership;
use App\Models\EmailGroup;
use App\Models\Employee;
use App\Models\FileShare;
use App\Models\SocialPlatform;
use Illuminate\Database\Seeder;

class AccessSeeder extends Seeder
{
    public function run(): void
    {
        $emp = Employee::orderBy('id')->pluck('id')->all();
        if (count($emp) < 3) {
            return; // org not seeded
        }

        $qa = EmailGroup::updateOrCreate(['email' => 'qa-team@inaba.co.th'], ['name' => 'QA Team']);
        $it = EmailGroup::updateOrCreate(['email' => 'it-helpdesk@inaba.co.th'], ['name' => 'IT Helpdesk']);
        $qa->memberships()->firstOrCreate(['employee_id' => $emp[0]], ['access_level' => 'Owner', 'granted_at' => '2024-01-15']);
        $qa->memberships()->firstOrCreate(['employee_id' => $emp[1]], ['access_level' => 'Member', 'granted_at' => '2024-02-01']);

        $fs = FileShare::updateOrCreate(['path' => '\\\\FILES\\Recipes\\Plant1'], ['name' => 'Plant 1 Recipes', 'size_label' => '48 GB']);
        $fs->memberships()->firstOrCreate(['employee_id' => $emp[1]], ['access_level' => 'Read', 'granted_at' => '2024-03-04']);

        foreach ([['LINE', '#06C755', 'line.me'], ['Facebook', '#1877F2', 'facebook.com'], ['YouTube', '#FF0000', 'youtube.com']] as [$n, $c, $u]) {
            SocialPlatform::updateOrCreate(['name' => $n], ['color' => $c, 'url' => $u, 'policy' => 'Marketing & official use only']);
        }
        SocialPlatform::where('name', 'LINE')->first()
            ->memberships()->firstOrCreate(['employee_id' => $emp[2]], ['purpose' => 'HR announcements', 'granted_at' => '2024-01-05']);
    }
}
```

- [ ] **Step 2: Register in `DatabaseSeeder::run()`** after the OrgSeeder call:
```php
$this->call(AccessSeeder::class);
```

- [ ] **Step 3: Verify seeding works**

Run: `php artisan migrate:fresh --seed`
Expected: completes; `php artisan tinker --execute="echo App\Models\EmailGroup::count();"` prints ≥ 2.

- [ ] **Step 4: Commit**
```bash
git add database/seeders/AccessSeeder.php database/seeders/DatabaseSeeder.php
git commit -m "feat(access): demo seeder for registries + members"
```

---

## Task 8: Frontend types + API + hooks

**Files:**
- Modify: `resources/js/types/index.ts`
- Create: `resources/js/services/accessApi.ts`, `resources/js/hooks/use-access.ts`

- [ ] **Step 1: Add types** to `resources/js/types/index.ts`:
```ts
export interface EmailGroup {
    id: number;
    code: string;
    name: string;
    email: string;
    department_id: number | null;
    department?: string | null;
    description?: string | null;
    owner_employee_id: number | null;
    owner?: string | null;
    members_count?: number;
}

export interface FileShare {
    id: number;
    code: string;
    name: string;
    path: string;
    department_id: number | null;
    department?: string | null;
    size_label?: string | null;
    owner_employee_id: number | null;
    owner?: string | null;
    members_count?: number;
}

export interface SocialPlatform {
    id: number;
    code: string;
    name: string;
    url?: string | null;
    color?: string | null;
    policy?: string | null;
    members_count?: number;
}

export interface AccessMember {
    id: number;
    employee_id: number;
    employee?: string | null;
    access_level: string | null;
    purpose: string | null;
    granted_at: string | null;
    revoked_at: string | null;
}

export interface EmployeeAccessRow {
    id: number;
    resource_id: number;
    resource_name: string | null;
    resource_code: string | null;
    resource_detail: string | null;
    resource_color: string | null;
    access_level: string | null;
    purpose: string | null;
    granted_at: string | null;
}

export interface EmployeeAccess {
    email_groups: EmployeeAccessRow[];
    file_shares: EmployeeAccessRow[];
    social: EmployeeAccessRow[];
    outstanding: boolean;
}

export type AccessKind = 'email-groups' | 'file-shares' | 'social-platforms';
```

- [ ] **Step 2: Create `accessApi.ts`** (mirror `orgApi.ts` `mutate`/`ensureCsrf` pattern):
```ts
import type { AccessKind, AccessMember, ApiEnvelope, EmailGroup, EmployeeAccess, FileShare, SocialPlatform } from '@/types';
import { ensureCsrf, http } from './http';

async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export const accessApi = {
    emailGroups: () => http.get<ApiEnvelope<EmailGroup[]>>('/email-groups').then((r) => r.data.data),
    fileShares: () => http.get<ApiEnvelope<FileShare[]>>('/file-shares').then((r) => r.data.data),
    socialPlatforms: () => http.get<ApiEnvelope<SocialPlatform[]>>('/social-platforms').then((r) => r.data.data),

    members: (kind: AccessKind, id: number) =>
        http.get<ApiEnvelope<AccessMember[]>>(`/${kind}/${id}/members`).then((r) => r.data.data),

    createResource: (kind: AccessKind, payload: Record<string, unknown>) => mutate<EmailGroup | FileShare | SocialPlatform>('post', `/${kind}`, payload),
    updateResource: (kind: AccessKind, id: number, payload: Record<string, unknown>) => mutate('put', `/${kind}/${id}`, payload),
    removeResource: (kind: AccessKind, id: number) => mutate<void>('delete', `/${kind}/${id}`),

    addMember: (kind: AccessKind, id: number, payload: { employee_id: number; access_level?: string | null; purpose?: string | null }) =>
        mutate<AccessMember>('post', `/${kind}/${id}/members`, payload),
    revokeMember: (kind: AccessKind, id: number, membershipId: number) =>
        mutate<void>('post', `/${kind}/${id}/members/${membershipId}/revoke`),

    employeeAccess: (employeeId: number) =>
        http.get<ApiEnvelope<EmployeeAccess>>(`/employees/${employeeId}/access`).then((r) => r.data.data),
};
```

- [ ] **Step 3: Create `use-access.ts`** (React Query, mirror `use-org.ts`):
```ts
import { accessApi } from '@/services/accessApi';
import type { AccessKind } from '@/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const useEmailGroups = () => useQuery({ queryKey: ['email-groups'], queryFn: accessApi.emailGroups });
export const useFileShares = () => useQuery({ queryKey: ['file-shares'], queryFn: accessApi.fileShares });
export const useSocialPlatforms = () => useQuery({ queryKey: ['social-platforms'], queryFn: accessApi.socialPlatforms });

export const useResourceMembers = (kind: AccessKind, id: number | null) =>
    useQuery({ queryKey: [kind, id, 'members'], queryFn: () => accessApi.members(kind, id as number), enabled: id != null });

export const useEmployeeAccess = (employeeId: number | null) =>
    useQuery({ queryKey: ['employee-access', employeeId], queryFn: () => accessApi.employeeAccess(employeeId as number), enabled: employeeId != null });

export function useAccessMutations(kind: AccessKind) {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: [kind] });
        qc.invalidateQueries({ queryKey: ['employee-access'] });
    };
    return {
        create: useMutation({ mutationFn: (p: Record<string, unknown>) => accessApi.createResource(kind, p), onSuccess: invalidate }),
        update: useMutation({ mutationFn: (v: { id: number; payload: Record<string, unknown> }) => accessApi.updateResource(kind, v.id, v.payload), onSuccess: invalidate }),
        remove: useMutation({ mutationFn: (id: number) => accessApi.removeResource(kind, id), onSuccess: invalidate }),
        addMember: useMutation({ mutationFn: (v: { id: number; payload: { employee_id: number; access_level?: string | null; purpose?: string | null } }) => accessApi.addMember(kind, v.id, v.payload), onSuccess: invalidate }),
        revokeMember: useMutation({ mutationFn: (v: { id: number; membershipId: number }) => accessApi.revokeMember(kind, v.id, v.membershipId), onSuccess: invalidate }),
    };
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit` → Expected: exit 0.
```bash
git add resources/js/types/index.ts resources/js/services/accessApi.ts resources/js/hooks/use-access.ts
git commit -m "feat(access): frontend types, accessApi, use-access hooks"
```

---

## Task 9: Access Control page (3 sub-tabs)

**Files:**
- Create: `resources/js/pages/access/index.tsx`, `resources/js/components/access/resource-modal.tsx`
- Modify: SPA route table + sidebar (follow the existing pattern — locate where `pages/employees/index.tsx` is registered as a route and add an `/access` route + a sidebar item gated by `access.view`).

- [ ] **Step 1: Locate routing + sidebar**

Run: `grep -rn "pages/employees" resources/js/{App.tsx,app.tsx,router*.tsx,routes*.tsx} resources/js/components/shell 2>/dev/null`
Read the file that maps routes and the sidebar config; note the pattern (path, element, permission gate).

- [ ] **Step 2: Build the page** — `resources/js/pages/access/index.tsx`. Three sub-tabs, each a `DataTable` (follow `resources/js/components/shared/data-table.tsx` usage in `pages/employees/index.tsx`):
```tsx
import { ResourceModal } from '@/components/access/resource-modal';
import { MembersDrawer } from '@/components/access/members-drawer';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { useEmailGroups, useFileShares, useSocialPlatforms } from '@/hooks/use-access';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/stores/auth';
import type { AccessKind, EmailGroup, FileShare, SocialPlatform } from '@/types';
import { Plus } from 'lucide-react';
import { useState } from 'react';

type Tab = AccessKind;

export default function AccessControlPage() {
    const t = useT();
    const canManage = useAuthStore((s) => s.can?.('access.manage')) ?? false;
    const [tab, setTab] = useState<Tab>('email-groups');
    const [editing, setEditing] = useState<{ kind: AccessKind; row: EmailGroup | FileShare | SocialPlatform | null } | null>(null);
    const [members, setMembers] = useState<{ kind: AccessKind; id: number; name: string } | null>(null);

    const emailGroups = useEmailGroups();
    const fileShares = useFileShares();
    const social = useSocialPlatforms();

    const tabs: { id: Tab; label: string }[] = [
        { id: 'email-groups', label: t('access_email_groups') },
        { id: 'file-shares', label: t('access_file_shares') },
        { id: 'social-platforms', label: t('access_social') },
    ];

    const egCols: Column<EmailGroup>[] = [
        { key: 'code', header: t('pos_code'), render: (r) => <span className="text-muted-foreground font-mono text-xs">{r.code}</span> },
        { key: 'name', header: t('pos_title'), render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'email', header: 'Email', render: (r) => <span className="font-mono text-xs">{r.email}</span> },
        { key: 'members', header: t('access_members'), align: 'right', render: (r) => r.members_count ?? 0 },
    ];
    const fsCols: Column<FileShare>[] = [
        { key: 'code', header: t('pos_code'), render: (r) => <span className="text-muted-foreground font-mono text-xs">{r.code}</span> },
        { key: 'name', header: t('pos_title'), render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'path', header: t('access_path'), render: (r) => <span className="font-mono text-xs">{r.path}</span> },
        { key: 'members', header: t('access_members'), align: 'right', render: (r) => r.members_count ?? 0 },
    ];
    const spCols: Column<SocialPlatform>[] = [
        { key: 'code', header: t('pos_code'), render: (r) => <span className="text-muted-foreground font-mono text-xs">{r.code}</span> },
        { key: 'name', header: t('pos_title'), render: (r) => (
            <span className="inline-flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color ?? 'var(--muted)' }} />{r.name}</span>
        ) },
        { key: 'policy', header: t('access_policy'), render: (r) => <span className="text-muted-foreground text-xs">{r.policy}</span> },
        { key: 'members', header: t('access_members'), align: 'right', render: (r) => r.members_count ?? 0 },
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-1 border-b border-border">
                {tabs.map((tb) => (
                    <button key={tb.id} onClick={() => setTab(tb.id)}
                        className={`relative px-3 pb-2 pt-1 text-sm font-medium ${tab === tb.id ? 'text-brand' : 'text-muted-foreground hover:text-foreground'}`}>
                        {tb.label}
                        {tab === tb.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded" />}
                    </button>
                ))}
                {canManage && (
                    <Button className="ml-auto" onClick={() => setEditing({ kind: tab, row: null })}>
                        <Plus className="h-4 w-4" /> {t('access_add')}
                    </Button>
                )}
            </div>

            {tab === 'email-groups' && <DataTable columns={egCols} rows={emailGroups.data ?? []} rowKey={(r) => r.id} onRowClick={(r) => setMembers({ kind: 'email-groups', id: r.id, name: r.name })} />}
            {tab === 'file-shares' && <DataTable columns={fsCols} rows={fileShares.data ?? []} rowKey={(r) => r.id} onRowClick={(r) => setMembers({ kind: 'file-shares', id: r.id, name: r.name })} />}
            {tab === 'social-platforms' && <DataTable columns={spCols} rows={social.data ?? []} rowKey={(r) => r.id} onRowClick={(r) => setMembers({ kind: 'social-platforms', id: r.id, name: r.name })} />}

            <ResourceModal open={!!editing} kind={editing?.kind ?? 'email-groups'} row={editing?.row ?? null} onClose={() => setEditing(null)} />
            <MembersDrawer target={members} canManage={canManage} onClose={() => setMembers(null)} />
        </div>
    );
}
```
> If `useAuthStore().can` does not exist, use the project's actual permission check (grep `can(` / `hasPermission` in `resources/js/stores` and match it). Confirm in Step 1.

- [ ] **Step 3: Build `resource-modal.tsx`** — a Dialog form per kind (fields differ by kind). Use `useAccessMutations(kind)`. Fields: email-groups → name, email, description, owner (SearchableSelect of employees), department; file-shares → name, path, size_label, owner, department; social-platforms → name, url, color, policy. Follow `position-modal.tsx` structure for create/update + `SearchableSelect` for pickers. (Write concrete fields per kind; reuse `Field`, `Input`, `Dialog`.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` → Expected: exit 0 (after MembersDrawer exists — build it in Task 10; temporarily stub the import or do Task 10 first if tsc fails on the missing module).

- [ ] **Step 5: Commit**
```bash
git add resources/js/pages/access/index.tsx resources/js/components/access/resource-modal.tsx <route+sidebar files>
git commit -m "feat(access): Access Control page with 3 registry sub-tabs + resource modal"
```

---

## Task 10: Members drawer (grant / level / revoke)

**Files:**
- Create: `resources/js/components/access/members-drawer.tsx`

- [ ] **Step 1: Build the drawer** — right `Sheet` (mirror existing Sheet usage). Lists active members (via `useResourceMembers`), with: add-member row (employee `SearchableSelect` + access-level select for email/file, purpose input for social), per-member level display + revoke button (uses `useAccessMutations(kind).revokeMember`). Gate add/revoke behind `canManage`.
```tsx
import { SearchableSelect, type SearchOption } from '@/components/shared/searchable-select';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useEmployees } from '@/hooks/use-org';
import { useAccessMutations, useResourceMembers } from '@/hooks/use-access';
import { useT } from '@/lib/i18n';
import type { AccessKind } from '@/types';
import { useMemo, useState } from 'react';

const LEVELS: Record<string, string[]> = { 'email-groups': ['Owner', 'Member'], 'file-shares': ['Full', 'Write', 'Read'], 'social-platforms': [] };

export function MembersDrawer({ target, canManage, onClose }: { target: { kind: AccessKind; id: number; name: string } | null; canManage: boolean; onClose: () => void }) {
    const t = useT();
    const kind = target?.kind ?? 'email-groups';
    const { data: members = [] } = useResourceMembers(kind, target?.id ?? null);
    const { data: employees = [] } = useEmployees();
    const { addMember, revokeMember } = useAccessMutations(kind);
    const [empId, setEmpId] = useState('');
    const [level, setLevel] = useState('');
    const [purpose, setPurpose] = useState('');

    const opts = useMemo<SearchOption[]>(() => employees.map((e) => ({ value: String(e.id), label: e.name, sub: e.code, search: `${e.name} ${e.code}` })), [employees]);
    const levels = LEVELS[kind];

    const add = async () => {
        if (!empId) return;
        await addMember.mutateAsync({ id: target!.id, payload: { employee_id: Number(empId), access_level: levels.length ? level || levels[levels.length - 1] : null, purpose: purpose || null } });
        setEmpId(''); setLevel(''); setPurpose('');
    };

    return (
        <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="w-[440px] sm:max-w-[440px]">
                {target && (
                    <>
                        <SheetHeader><SheetTitle>{target.name} · {t('access_members')}</SheetTitle></SheetHeader>
                        <div className="mt-4 space-y-2">
                            {members.map((m) => (
                                <div key={m.id} className="border-border flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">{m.employee}</div>
                                        <div className="text-muted-foreground text-xs">{m.access_level ?? m.purpose ?? '—'} · {m.granted_at}</div>
                                    </div>
                                    {canManage && <Button variant="outline" size="sm" className="text-destructive" onClick={() => revokeMember.mutate({ id: target.id, membershipId: m.id })}>{t('access_revoke')}</Button>}
                                </div>
                            ))}
                            {members.length === 0 && <div className="text-muted-foreground bg-muted/40 rounded-lg py-6 text-center text-sm">{t('access_no_members')}</div>}
                        </div>
                        {canManage && (
                            <div className="border-border mt-4 space-y-2 border-t pt-4">
                                <SearchableSelect value={empId} onChange={setEmpId} options={opts} placeholder={t('access_pick_employee')} clearable />
                                {levels.length > 0 ? (
                                    <select className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm" value={level} onChange={(e) => setLevel(e.target.value)}>
                                        <option value="">{levels[levels.length - 1]}</option>
                                        {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                ) : (
                                    <input className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm" placeholder={t('access_purpose')} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
                                )}
                                <Button className="w-full" disabled={!empId || addMember.isPending} onClick={add}>{t('access_add_member')}</Button>
                            </div>
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` → exit 0.
```bash
git add resources/js/components/access/members-drawer.tsx
git commit -m "feat(access): members drawer (grant / level / revoke)"
```

---

## Task 11: "Access" tab in the employee detail dialog

**Files:**
- Modify: `resources/js/components/employees/employee-view-drawer.tsx`

- [ ] **Step 1: Add the data hook + tab**

In `employee-view-drawer.tsx`:
1. Import: `import { useEmployeeAccess } from '@/hooks/use-access';` and icons `Mail, Folder, Globe, Shield` from lucide.
2. After the existing hooks add: `const { data: access } = useEmployeeAccess(employee?.id ?? null);`
3. Extend the tab union: `useState<'overview' | 'org' | 'access'>('overview')`.
4. Add a third tab button after `org`:
```tsx
{ id: 'access' as const, label: L('สิทธิ์เข้าถึง', 'Access'), icon: <Shield className="h-[15px] w-[15px]" />, count: (access ? access.email_groups.length + access.file_shares.length + access.social.length : 0) },
```

- [ ] **Step 2: Render the Access pane** — add after the `tab === 'org'` block:
```tsx
{tab === 'access' && (
    <div className="space-y-5">
        {access?.outstanding && (
            <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium">
                <TriangleAlert className="h-4 w-4" />
                {L('พนักงานลาออกแล้ว — สิทธิ์เหล่านี้ยังเปิดอยู่ ควรถอน', 'Resigned — these accesses are still active and should be revoked')}
            </div>
        )}
        {[
            { key: 'email_groups' as const, label: L('กลุ่มอีเมล', 'Email groups'), icon: <Mail className="h-3.5 w-3.5" /> },
            { key: 'file_shares' as const, label: L('ไฟล์แชร์', 'File shares'), icon: <Folder className="h-3.5 w-3.5" /> },
            { key: 'social' as const, label: L('โซเชียล/อินเทอร์เน็ต', 'Social / internet'), icon: <Globe className="h-3.5 w-3.5" /> },
        ].map((grp) => {
            const rows = access?.[grp.key] ?? [];
            if (rows.length === 0) return null;
            return (
                <div key={grp.key} className="space-y-2">
                    <div className="text-muted-foreground flex items-center gap-2 text-[12.5px] font-bold">
                        {grp.icon}
                        {grp.label}
                        <span className="bg-muted inline-grid h-[17px] min-w-[17px] place-items-center rounded-full px-1.5 font-mono text-[10.5px] font-bold">{rows.length}</span>
                    </div>
                    {rows.map((r) => (
                        <div key={r.id} className="border-border bg-card flex items-center gap-3 rounded-xl border px-3 py-2.5">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.resource_color ?? 'var(--brand)' }} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{r.resource_name}</div>
                                <div className="text-muted-foreground truncate font-mono text-[11px]">{r.resource_detail ?? r.resource_code}</div>
                            </div>
                            <span className="text-muted-foreground shrink-0 text-xs">{r.access_level ?? r.purpose ?? '—'}</span>
                        </div>
                    ))}
                </div>
            );
        })}
        {access && access.email_groups.length + access.file_shares.length + access.social.length === 0 && (
            <div className="text-muted-foreground py-12 text-center text-sm">{L('ไม่มีสิทธิ์เข้าถึง', 'No access permissions')}</div>
        )}
    </div>
)}
```
> The `access.view` gate is server-side (endpoint returns 403 → `access` stays undefined → tab count 0, pane empty). That is acceptable; optionally hide the tab when the viewer lacks `access.view` if a client permission flag is available.

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → exit 0.
```bash
git add resources/js/components/employees/employee-view-drawer.tsx
git commit -m "feat(access): Access tab in employee detail (grouped memberships + resign outstanding banner)"
```

---

## Task 12: i18n + final verification

**Files:**
- Modify: `resources/js/lib/i18n.ts`

- [ ] **Step 1: Add EN keys** (in the EN block, near `pos_*`):
```ts
    access_title: 'Access Control',
    access_email_groups: 'Email groups',
    access_file_shares: 'File shares',
    access_social: 'Social / internet',
    access_members: 'Members',
    access_no_members: 'No members yet',
    access_add: 'Add',
    access_add_member: 'Add member',
    access_revoke: 'Revoke',
    access_path: 'Path',
    access_policy: 'Policy',
    access_purpose: 'Purpose',
    access_pick_employee: 'Select employee',
```

- [ ] **Step 2: Add the matching TH keys** (in the TH block):
```ts
    access_title: 'การเข้าถึง',
    access_email_groups: 'กลุ่มอีเมล',
    access_file_shares: 'ไฟล์แชร์',
    access_social: 'โซเชียล/อินเทอร์เน็ต',
    access_members: 'สมาชิก',
    access_no_members: 'ยังไม่มีสมาชิก',
    access_add: 'เพิ่ม',
    access_add_member: 'เพิ่มสมาชิก',
    access_revoke: 'ถอนสิทธิ์',
    access_path: 'พาธ',
    access_policy: 'นโยบาย',
    access_purpose: 'วัตถุประสงค์',
    access_pick_employee: 'เลือกพนักงาน',
```

- [ ] **Step 3: Full verification**

Run, expecting all to pass:
```bash
php artisan test
npx tsc --noEmit
npx eslint resources/js/pages/access resources/js/components/access resources/js/components/employees/employee-view-drawer.tsx resources/js/services/accessApi.ts resources/js/hooks/use-access.ts
npm run build
```
Expected: `php artisan test` all green (incl. the 3 new Access test files), tsc 0, eslint 0, build OK.

- [ ] **Step 4: Final commit**
```bash
git add resources/js/lib/i18n.ts
git commit -m "feat(access): i18n keys (EN/TH) for Access Control"
```

---

## Out of scope (future work — not in this plan)
- Access **requests** + approval workflow (the Request/Workflow module). The `AccessService::grant()` API is the integration point: an approved request calls it.
- Membership change-history/audit beyond soft-revoke.

## Notes for the implementer
- Follow existing patterns: auto-code (`Section`/`Position`), delete-guard (`SectionController`), Form Request `authorize()` via `hasPermission`, route middleware `permission:<key>`, React Query hooks (`use-org.ts`), `DataTable`/`Sheet`/`SearchableSelect` shared components.
- Run `php artisan test` after each backend task; `npx tsc --noEmit` after each frontend task.
- Verify the exact SPA route/sidebar registration pattern (Task 9 Step 1) and the client permission check (`access.view`/`access.manage`) before wiring nav — match what the codebase already does.
