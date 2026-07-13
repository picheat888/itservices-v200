# Access Directory + Software Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the "Access Control" module to "Access Directory" and add a fourth resource type, **Software**, with licence-seat counting.

**Architecture:** Mirror the existing Access domain exactly. Software is a new polymorphic parent of `AccessMembership` (same as EmailGroup / FileShare / SocialPlatform). Reads gated by `access.view`, writes by `access.manage` (unchanged). Backend follows Model → Migration → Enum → Request → Resource → Controller → Routes; frontend follows types → api → hooks → page/modal. Backend is TDD (PHPUnit); frontend is verified with `npx tsc --noEmit` (no JS test runner in this repo).

**Tech Stack:** Laravel 12 (PHP 8.2), PHPUnit 11, React 19 + TypeScript, TanStack Query, Tailwind v4.

## Global Constraints

- Domain grouping: files live under `App\<Layer>\Access\` (backend) and `resources/js/modules/access/` (frontend).
- No business logic in controllers — grant/revoke go through `App\Services\Access\AccessService`.
- All API responses use API Resources / the standard envelope (`{ data, message }`).
- DB columns `snake_case`; methods `camelCase`; components `PascalCase`.
- UI strings via `useT()` — no hardcoded strings. Keys live in `resources/js/lang/{en,th}/access.ts` and `.../permission.ts`.
- Morph type strings are the enforced morph-map aliases: `email_group`, `file_share`, `social_platform`, and the new `software`.
- Run `vendor/bin/pint --dirty --format agent` after PHP changes; `npx tsc --noEmit` after TS changes.
- The app runs on live data — migrations must be additive; never reset the DB.

---

### Task 1: Software backend foundation (enum + migration + model + morph map)

**Files:**
- Create: `app/Enums/Access/SoftwareLicenseType.php`
- Create: `database/migrations/2026_07_13_100000_create_softwares_table.php`
- Create: `app/Models/Access/Software.php`
- Modify: `app/Providers/AppServiceProvider.php` (morph map block, ~line 38-42)
- Test: `tests/Feature/AccessSoftwareTest.php`

**Interfaces:**
- Produces:
  - `App\Enums\Access\SoftwareLicenseType` (string-backed: `Perpetual='perpetual'`, `Subscription='subscription'`, `Free='free'`, `OpenSource='open_source'`).
  - `App\Models\Access\Software` with `$fillable = ['code','name','publisher','version','license_type','seats','department_id','notes']`, auto `code` `SW-0001`, `memberships(): MorphMany`, `department(): BelongsTo`, `license_type` cast to the enum, `seats` cast to `integer`.
  - Morph alias `'software' => Software::class`.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/AccessSoftwareTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Enums\Access\SoftwareLicenseType;
use App\Models\Access\Software;
use App\Models\Employee\Employee;
use App\Models\User;
use App\Models\Permission\RolePermission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccessSoftwareTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_software_auto_generates_a_sequential_code(): void
    {
        $a = Software::create(['name' => 'Adobe Acrobat', 'license_type' => 'subscription']);
        $b = Software::create(['name' => 'AutoCAD', 'license_type' => 'perpetual']);

        $this->assertSame('SW-0001', $a->code);
        $this->assertSame('SW-0002', $b->code);
    }

    public function test_software_casts_license_type_to_the_enum(): void
    {
        $s = Software::create(['name' => 'Chrome', 'license_type' => 'free']);

        $this->assertSame(SoftwareLicenseType::Free, $s->fresh()->license_type);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter=AccessSoftwareTest`
Expected: FAIL — class `App\Enums\Access\SoftwareLicenseType` / `App\Models\Access\Software` not found.

- [ ] **Step 3: Create the enum**

`app/Enums/Access/SoftwareLicenseType.php`:

```php
<?php

namespace App\Enums\Access;

/** How a piece of software is licensed. */
enum SoftwareLicenseType: string
{
    case Perpetual = 'perpetual';
    case Subscription = 'subscription';
    case Free = 'free';
    case OpenSource = 'open_source';
}
```

- [ ] **Step 4: Create the migration**

`database/migrations/2026_07_13_100000_create_softwares_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('softwares', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('publisher')->nullable();
            $table->string('version')->nullable();
            $table->string('license_type')->default('subscription');
            $table->unsignedInteger('seats')->nullable();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('softwares');
    }
};
```

- [ ] **Step 5: Create the model**

`app/Models/Access/Software.php`:

```php
<?php

namespace App\Models\Access;

use App\Enums\Access\SoftwareLicenseType;
use App\Models\Employee\Department;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Software extends Model
{
    protected $fillable = ['code', 'name', 'publisher', 'version', 'license_type', 'seats', 'department_id', 'notes'];

    protected function casts(): array
    {
        return [
            'license_type' => SoftwareLicenseType::class,
            'seats' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Software $sw) {
            if (blank($sw->code)) {
                $max = (int) str_replace('SW-', '', (string) static::max('code'));
                $sw->code = 'SW-'.str_pad((string) ($max + 1), 4, '0', STR_PAD_LEFT);
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
}
```

- [ ] **Step 6: Register the morph alias**

In `app/Providers/AppServiceProvider.php`, add the line to the `Relation::enforceMorphMap([...])` array (keep alphabetical-ish with the others):

```php
        Relation::enforceMorphMap([
            'email_group' => EmailGroup::class,
            'file_share' => FileShare::class,
            'social_platform' => SocialPlatform::class,
            'software' => \App\Models\Access\Software::class,
        ]);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `php artisan test --compact --filter=AccessSoftwareTest`
Expected: PASS (2 tests).

- [ ] **Step 8: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Enums/Access/SoftwareLicenseType.php database/migrations/2026_07_13_100000_create_softwares_table.php app/Models/Access/Software.php app/Providers/AppServiceProvider.php tests/Feature/AccessSoftwareTest.php
git commit -m "feat(access): add Software model, enum, migration and morph alias"
```

---

### Task 2: Software API (request + resource + controller + routes)

**Files:**
- Create: `app/Http/Requests/Access/StoreSoftwareRequest.php`
- Create: `app/Http/Resources/Access/SoftwareResource.php`
- Create: `app/Http/Controllers/Api/Access/SoftwareController.php`
- Modify: `routes/api.php` (Access Control block, ~line 199-219)
- Test: `tests/Feature/AccessSoftwareTest.php` (extend)

**Interfaces:**
- Consumes: `Software` model, `AccessService` (`grant`, `revoke`), `AccessMembershipResource`, `StoreAccessMembershipRequest` (all existing).
- Produces: REST endpoints — `GET /api/software`, `POST /api/software`, `PUT /api/software/{software}`, `DELETE /api/software/{software}`, `GET /api/software/{software}/members`, `POST /api/software/{software}/members`, `POST /api/software/{software}/members/{membership}/revoke`. `SoftwareResource` exposes `id, code, name, publisher, version, license_type (string), seats, department_id, department, members, members_count, seats_used`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/Feature/AccessSoftwareTest.php` (inside the class):

```php
    public function test_manager_can_create_software(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/software', [
            'name' => 'Adobe Acrobat Pro',
            'publisher' => 'Adobe',
            'version' => '2024',
            'license_type' => 'subscription',
            'seats' => 10,
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Adobe Acrobat Pro')
            ->assertJsonPath('data.license_type', 'subscription')
            ->assertJsonPath('data.seats', 10)
            ->assertJsonPath('data.seats_used', 0)
            ->assertJsonPath('data.code', fn ($c) => is_string($c) && str_starts_with($c, 'SW-'));
    }

    public function test_create_software_requires_a_valid_license_type(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/software', ['name' => 'X', 'license_type' => 'bogus'])
            ->assertStatus(422)->assertJsonValidationErrors('license_type');
    }

    public function test_reads_require_access_view(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));
        $this->getJson('/api/software')->assertForbidden();
    }

    public function test_writes_require_access_manage(): void
    {
        $viewer = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $viewer->role_id, 'permission' => 'access.view', 'allowed' => true]);
        $this->actingAs($viewer);

        // Can read...
        $this->getJson('/api/software')->assertOk();
        // ...but not write.
        $this->postJson('/api/software', ['name' => 'X', 'license_type' => 'free'])->assertForbidden();
    }

    public function test_seats_used_counts_active_members_and_over_seat_grant_is_allowed(): void
    {
        $this->actingAs($this->super());
        $sw = Software::create(['name' => 'Photoshop', 'license_type' => 'subscription', 'seats' => 1]);
        $e1 = Employee::create(['code' => 'EMP-SW1', 'first_name' => 'A', 'last_name' => 'One']);
        $e2 = Employee::create(['code' => 'EMP-SW2', 'first_name' => 'B', 'last_name' => 'Two']);

        $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e1->id])->assertCreated();
        // Over the single seat — still allowed (soft, not blocked).
        $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e2->id])->assertCreated();

        $this->getJson('/api/software')->assertOk()->assertJsonPath('data.0.seats_used', 2);
    }

    public function test_revoking_a_member_decrements_seats_used(): void
    {
        $this->actingAs($this->super());
        $sw = Software::create(['name' => 'Slack', 'license_type' => 'free']);
        $e = Employee::create(['code' => 'EMP-SW3', 'first_name' => 'C', 'last_name' => 'Three']);
        $res = $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e->id])->assertCreated()->json('data.id');

        $this->postJson("/api/software/{$sw->id}/members/{$res}/revoke")->assertOk();
        $this->getJson('/api/software')->assertOk()->assertJsonPath('data.0.seats_used', 0);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact --filter=AccessSoftwareTest`
Expected: FAIL — no route matches `/api/software`.

- [ ] **Step 3: Create the Form Request**

`app/Http/Requests/Access/StoreSoftwareRequest.php`:

```php
<?php

namespace App\Http\Requests\Access;

use App\Enums\Access\SoftwareLicenseType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Enum;

class StoreSoftwareRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('access.manage');
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'publisher' => ['nullable', 'string', 'max:255'],
            'version' => ['nullable', 'string', 'max:100'],
            'license_type' => ['required', new Enum(SoftwareLicenseType::class)],
            'seats' => ['nullable', 'integer', 'min:0'],
            'department_id' => ['nullable', 'integer', Rule::exists('departments', 'id')],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
```

- [ ] **Step 4: Create the Resource**

`app/Http/Resources/Access/SoftwareResource.php`:

```php
<?php

namespace App\Http\Resources\Access;

use App\Models\Access\Software;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Software */
class SoftwareResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $seatsUsed = $this->relationLoaded('memberships')
            ? $this->memberships->count()
            : $this->memberships()->active()->count();

        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'publisher' => $this->publisher,
            'version' => $this->version,
            'license_type' => $this->license_type?->value,
            'seats' => $this->seats,
            'seats_used' => $seatsUsed,
            'department_id' => $this->department_id,
            'department' => $this->department?->name,
            'members' => $this->whenLoaded('memberships', fn () => $this->memberships->map(fn ($m) => [
                'id' => $m->id,
                'employee_id' => $m->employee_id,
                'name' => $m->employee?->name,
                'purpose' => $m->purpose,
            ])->values()),
            'members_count' => $seatsUsed,
        ];
    }
}
```

- [ ] **Step 5: Create the Controller**

`app/Http/Controllers/Api/Access/SoftwareController.php`:

```php
<?php

namespace App\Http\Controllers\Api\Access;

use App\Http\Controllers\Controller;
use App\Http\Requests\Access\StoreAccessMembershipRequest;
use App\Http\Requests\Access\StoreSoftwareRequest;
use App\Http\Resources\Access\AccessMembershipResource;
use App\Http\Resources\Access\SoftwareResource;
use App\Models\Access\AccessMembership;
use App\Models\Access\Software;
use App\Services\Access\AccessService;
use Illuminate\Http\JsonResponse;

class SoftwareController extends Controller
{
    /** List all software with their active members + department. */
    public function index(): JsonResponse
    {
        return SoftwareResource::collection(
            Software::with(['department', 'memberships' => fn ($q) => $q->active()->with('employee')])->orderBy('code')->get()
        )->response();
    }

    /** Create a new software entry. */
    public function store(StoreSoftwareRequest $request): JsonResponse
    {
        $sw = Software::create($request->validated());

        return (new SoftwareResource($sw))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Update an existing software entry. */
    public function update(StoreSoftwareRequest $request, Software $software): JsonResponse
    {
        $software->update($request->validated());

        return (new SoftwareResource($software))->additional(['message' => 'success'])->response();
    }

    /** Delete a software entry, guarding against active members. */
    public function destroy(Software $software): JsonResponse
    {
        if ($software->memberships()->active()->exists()) {
            return response()->json(['message' => 'resource_has_members'], 422);
        }
        $software->delete();

        return response()->json(['message' => 'success']);
    }

    /** List the active members (licence holders) of a software entry. */
    public function members(Software $software): JsonResponse
    {
        return AccessMembershipResource::collection($software->memberships()->active()->with('employee')->get())->response();
    }

    /** Grant an employee a licence for the software. */
    public function addMember(StoreAccessMembershipRequest $request, Software $software, AccessService $svc): JsonResponse
    {
        $data = $request->validated();
        $m = $svc->grant($software, (int) $data['employee_id'], $data);

        return (new AccessMembershipResource($m->load('employee')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Soft-revoke an employee's licence. */
    public function revokeMember(Software $software, AccessMembership $membership, AccessService $svc): JsonResponse
    {
        $svc->revoke($membership);

        return response()->json(['message' => 'success']);
    }
}
```

- [ ] **Step 6: Register the routes**

In `routes/api.php`, inside the existing Access Control block:

Add to the `permission:access.view` group (after the social-platforms reads):

```php
        Route::get('software', [SoftwareController::class, 'index']);
        Route::get('software/{software}/members', [SoftwareController::class, 'members']);
```

Add to the `permission:access.manage` group (after the social-platforms writes):

```php
        Route::apiResource('software', SoftwareController::class)->except(['index', 'show']);
        Route::post('software/{software}/members', [SoftwareController::class, 'addMember']);
        Route::post('software/{software}/members/{membership}/revoke', [SoftwareController::class, 'revokeMember']);
```

And add the import at the top of `routes/api.php` next to the other Access controllers:

```php
use App\Http\Controllers\Api\Access\SoftwareController;
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `php artisan test --compact --filter=AccessSoftwareTest`
Expected: PASS (all tests including the new API tests).

- [ ] **Step 8: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Requests/Access/StoreSoftwareRequest.php app/Http/Resources/Access/SoftwareResource.php app/Http/Controllers/Api/Access/SoftwareController.php routes/api.php tests/Feature/AccessSoftwareTest.php
git commit -m "feat(access): Software CRUD + membership API gated by access.view/manage"
```

---

### Task 3: Employee software access aggregation

**Files:**
- Modify: `app/Services/Access/AccessService.php` (`employeeAccess`, ~line 50-62)
- Modify: `app/Http/Controllers/Api/Access/AccessController.php` (`employee`, outstanding flag)
- Modify: `app/Http/Resources/Access/EmployeeAccessResource.php`
- Test: `tests/Feature/AccessSoftwareTest.php` (extend)

**Interfaces:**
- Consumes: `AccessService::grant`, morph alias `software`.
- Produces: `employeeAccess()` returns a `'software'` key (Collection of active software memberships). `EmployeeAccessResource` output gains a `software` array (rows shaped like the others). `outstanding` includes software.

- [ ] **Step 1: Write the failing test**

Append to `tests/Feature/AccessSoftwareTest.php`:

```php
    public function test_employee_access_endpoint_includes_software(): void
    {
        $this->actingAs($this->super());
        $sw = Software::create(['name' => 'Jira', 'license_type' => 'subscription']);
        $e = Employee::create(['code' => 'EMP-SW9', 'first_name' => 'D', 'last_name' => 'Four']);
        $this->postJson("/api/software/{$sw->id}/members", ['employee_id' => $e->id])->assertCreated();

        $this->getJson("/api/employees/{$e->id}/access")
            ->assertOk()
            ->assertJsonPath('data.software.0.resource_name', 'Jira')
            ->assertJsonPath('data.software.0.resource_code', fn ($c) => is_string($c) && str_starts_with($c, 'SW-'));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter=test_employee_access_endpoint_includes_software`
Expected: FAIL — `data.software` path missing.

- [ ] **Step 3: Add the software group to the service**

In `app/Services/Access/AccessService.php`, update `employeeAccess()`'s return array and docblock:

```php
    /**
     * Active memberships for an employee grouped by resource type, eager-loaded.
     *
     * @return array{email_group: Collection, file_share: Collection, social_platform: Collection, software: Collection}
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
            'software' => $all->where('resource_type', 'software')->values(),
        ];
    }
```

- [ ] **Step 4: Include software in the outstanding flag**

In `app/Http/Controllers/Api/Access/AccessController.php`, update the `outstanding` computation:

```php
        $grouped['outstanding'] = $employee->status?->value === 'resigned'
            && ($grouped['email_group']->isNotEmpty() || $grouped['file_share']->isNotEmpty()
                || $grouped['social_platform']->isNotEmpty() || $grouped['software']->isNotEmpty());
```

- [ ] **Step 5: Add software to the resource output**

In `app/Http/Resources/Access/EmployeeAccessResource.php`, update the `$map` closure's `resource_detail` to include software (publisher), the docblock, and add the `software` key:

```php
        $map = fn ($items) => collect($items)->map(fn ($m) => [
            'id' => $m->id,
            'resource_id' => $m->resource_id,
            'resource_name' => $m->resource?->name,
            'resource_code' => $m->resource?->code,
            'resource_detail' => $m->resource?->email ?? $m->resource?->path ?? $m->resource?->url ?? $m->resource?->publisher,
            'resource_color' => $m->resource?->color,
            'access_level' => $m->access_level,
            'purpose' => $m->purpose,
            'granted_at' => $m->granted_at?->toDateString(),
        ])->values();

        return [
            'email_groups' => $map($this->resource['email_group']),
            'file_shares' => $map($this->resource['file_share']),
            'social' => $map($this->resource['social_platform']),
            'software' => $map($this->resource['software']),
            'outstanding' => (bool) ($this->resource['outstanding'] ?? false),
        ];
```

Also update the class docblock line to list `software`:

```php
/**
 * Expects ['email_group'=>Collection,'file_share'=>Collection,'social_platform'=>Collection,'software'=>Collection,'outstanding'=>bool].
 */
```

- [ ] **Step 6: Run test to verify it passes**

Run: `php artisan test --compact --filter=AccessSoftwareTest`
Expected: PASS (all AccessSoftwareTest tests).

- [ ] **Step 7: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/Access/AccessService.php app/Http/Controllers/Api/Access/AccessController.php app/Http/Resources/Access/EmployeeAccessResource.php tests/Feature/AccessSoftwareTest.php
git commit -m "feat(access): include software in per-employee access aggregation"
```

---

### Task 4: Frontend types, API, hooks + module rename

**Files:**
- Modify: `resources/js/shared/types/index.ts` (Access types, ~line 628-705)
- Modify: `resources/js/modules/access/api/accessApi.ts`
- Modify: `resources/js/modules/access/hooks/use-access.ts`
- Modify: `resources/js/lang/en/access.ts`, `resources/js/lang/th/access.ts`
- Modify: `resources/js/lang/en/permission.ts`, `resources/js/lang/th/permission.ts` (`perm_mod_access`)
- Verify: `npx tsc --noEmit`

**Interfaces:**
- Produces: `Software` type; `AccessKind` includes `'software'`; `EmployeeAccess.software: EmployeeAccessRow[]`; `accessApi.software()`; `useSoftware()` hook; renamed i18n keys `access_title`, `access_sub`, `perm_mod_access`, plus new software keys.

- [ ] **Step 1: Add the `Software` type and extend `AccessKind` + `EmployeeAccess`**

In `resources/js/shared/types/index.ts`, after the `SocialPlatform` interface add:

```typescript
export type SoftwareLicenseType = 'perpetual' | 'subscription' | 'free' | 'open_source';

export interface Software {
    id: number;
    code: string;
    name: string;
    publisher?: string | null;
    version?: string | null;
    license_type: SoftwareLicenseType;
    seats?: number | null;
    seats_used?: number;
    department_id: number | null;
    department?: string | null;
    members?: AccessMemberPreview[];
    members_count?: number;
}
```

Change the `EmployeeAccess` interface to add `software`:

```typescript
export interface EmployeeAccess {
    email_groups: EmployeeAccessRow[];
    file_shares: EmployeeAccessRow[];
    social: EmployeeAccessRow[];
    software: EmployeeAccessRow[];
    outstanding: boolean;
}
```

Change the `AccessKind` union:

```typescript
export type AccessKind = 'email-groups' | 'file-shares' | 'social-platforms' | 'software';
```

- [ ] **Step 2: Add the API method**

In `resources/js/modules/access/api/accessApi.ts`, extend the imports and add `software`:

Change the type import line to include `Software`:

```typescript
import type { AccessKind, AccessMember, ApiEnvelope, EmailGroup, EmployeeAccess, FileShare, SocialPlatform, Software } from '@/shared/types';
```

Add inside the `accessApi` object, next to `socialPlatforms`:

```typescript
    software: () => http.get<ApiEnvelope<Software[]>>('/software').then((r) => r.data.data),
```

And widen the `createResource` return union:

```typescript
    createResource: (kind: AccessKind, payload: Record<string, unknown>) => mutate<EmailGroup | FileShare | SocialPlatform | Software>('post', `/${kind}`, payload),
```

- [ ] **Step 3: Add the hook**

In `resources/js/modules/access/hooks/use-access.ts`, next to `useSocialPlatforms`:

```typescript
export const useSoftware = () => useQuery({ queryKey: ['software'], queryFn: accessApi.software });
```

- [ ] **Step 4: Rename the module strings + add software i18n (English)**

In `resources/js/lang/en/access.ts`, change:

```typescript
    "access_title": "Access Directory",
    "access_sub": "Manage email groups, file shares, social access and software licences",
```

Add these new keys (anywhere in the object):

```typescript
    "access_software": "Software",
    "access_new_software": "New Software",
    "access_search_software": "Search software…",
    "access_publisher": "Publisher",
    "access_version": "Version",
    "access_license_type": "License",
    "access_seats": "Seats",
    "access_notes": "Notes",
    "access_lic_perpetual": "Perpetual",
    "access_lic_subscription": "Subscription",
    "access_lic_free": "Free",
    "access_lic_open_source": "Open source",
```

- [ ] **Step 5: Rename the module strings + add software i18n (Thai)**

In `resources/js/lang/th/access.ts`, change:

```typescript
    "access_title": "ทะเบียนการเข้าถึง",
    "access_sub": "จัดการกลุ่มอีเมล การแชร์ไฟล์ การเข้าถึงโซเชียล และ license ซอฟต์แวร์",
```

Add:

```typescript
    "access_software": "ซอฟต์แวร์",
    "access_new_software": "เพิ่มซอฟต์แวร์",
    "access_search_software": "ค้นหาซอฟต์แวร์…",
    "access_publisher": "ผู้ผลิต",
    "access_version": "เวอร์ชัน",
    "access_license_type": "ประเภท License",
    "access_seats": "จำนวน License",
    "access_notes": "หมายเหตุ",
    "access_lic_perpetual": "ซื้อขาด",
    "access_lic_subscription": "รายเดือน/รายปี",
    "access_lic_free": "ฟรี",
    "access_lic_open_source": "โอเพนซอร์ส",
```

- [ ] **Step 6: Rename the Permission module label**

In `resources/js/lang/en/permission.ts` change `"perm_mod_access": "Access Control"` → `"perm_mod_access": "Access Directory"`.
In `resources/js/lang/th/permission.ts` change the `perm_mod_access` value to `"ทะเบียนการเข้าถึง"`.

(If a `perm_mod_access` key does not exist, skip — the label falls back to the raw module key.)

- [ ] **Step 7: Verify типecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean). Type errors here mean a consumer of `AccessKind` / `EmployeeAccess` needs updating — Tasks 5 and 6 cover the two known consumers (access page, employee drawer). If tsc flags those two files, proceed to those tasks; it should otherwise be clean.

- [ ] **Step 8: Commit**

```bash
git add resources/js/shared/types/index.ts resources/js/modules/access/api/accessApi.ts resources/js/modules/access/hooks/use-access.ts resources/js/lang/en/access.ts resources/js/lang/th/access.ts resources/js/lang/en/permission.ts resources/js/lang/th/permission.ts
git commit -m "feat(access): frontend types/api/hooks for Software + rename to Access Directory"
```

---

### Task 5: Access page — Software tab, table, KPI and modal fields

**Files:**
- Modify: `resources/js/modules/access/pages/index.tsx`
- Modify: `resources/js/modules/access/components/resource-modal.tsx`
- Verify: `npx tsc --noEmit`, then `npm run build`

**Interfaces:**
- Consumes: `useSoftware` (Task 4), `Software` type, `access_software` / field i18n keys, `useAccessMutations('software')`.
- Produces: a Software tab in the registry with a table (Name · Publisher · License · Seats used/total · Department · Members · Manage), a KPI tile, a `+ New Software` button, and software fields in the create/edit modal.

- [ ] **Step 1: Wire the software query + rows into the page**

In `resources/js/modules/access/pages/index.tsx`:

Add `Software` to the type import and `useSoftware` to the hooks import:

```typescript
import type { AccessKind, EmailGroup, FileShare, SocialPlatform, Software } from '@/shared/types';
import { useEmailGroups, useFileShares, useSocialPlatforms, useSoftware } from '../hooks/use-access';
```

Add `Package` to the lucide import:

```typescript
import { Eye, Folder, Globe, Layers, Package, Plus, Search, Users } from 'lucide-react';
```

After `const social = useSocialPlatforms();` add:

```typescript
    const software = useSoftware();
```

After `const spRows = useMemo(...)` add:

```typescript
    const swRows = useMemo(() => software.data ?? [], [software.data]);
```

Update `totalGrants` to include software:

```typescript
    const totalGrants = useMemo(
        () => [...egRows, ...fsRows, ...spRows, ...swRows].reduce((sum, r) => sum + (r.members_count ?? 0), 0),
        [egRows, fsRows, spRows, swRows],
    );
```

- [ ] **Step 2: Add the tab, KPI, new-label and search filter**

Add a tab entry to the `tabs` array:

```typescript
        { id: 'software', label: t('access_software'), count: swRows.length },
```

Add to the `newLabel` record:

```typescript
        'software': t('access_new_software'),
```

Add a KPI card in the KPI row (`<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">` → change to `lg:grid-cols-5` and add):

```tsx
                <StatCard label={t('access_software')} value={swRows.length} icon={Package} />
```

Add a filtered-rows memo next to `filteredFs`:

```typescript
    const filteredSw = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? swRows.filter((s) => `${s.name} ${s.publisher ?? ''} ${s.department ?? ''}`.toLowerCase().includes(q)) : swRows;
    }, [swRows, search]);
```

Add an open handler next to `openSocial`:

```typescript
    const openSoftware = (s: Software) =>
        setMembers({ kind: 'software', id: s.id, name: s.name, detail: s.publisher, metaLabel: t('access_license_type'), metaValue: s.license_type });
```

Update the toolbar's search-visibility condition (currently `tab !== 'social-platforms'`) to also show for software, and its placeholder/counts. Change the condition to:

```tsx
                {tab !== 'social-platforms' && (
```

remains (software is a table, so search shows). Update the count line at the bottom of the toolbar to handle software:

```tsx
                        <div className="text-muted-foreground ml-auto font-mono text-xs">
                            {(tab === 'email-groups' ? filteredEg.length : tab === 'file-shares' ? filteredFs.length : filteredSw.length)} {t('access_of')}{' '}
                            {tab === 'email-groups' ? egRows.length : tab === 'file-shares' ? fsRows.length : swRows.length}
                        </div>
```

and the placeholder:

```tsx
                                placeholder={tab === 'email-groups' ? t('access_search_groups') : tab === 'file-shares' ? t('access_search_shares') : t('access_search_software')}
```

- [ ] **Step 3: Add the software table block**

After the file-shares table block (before the social-platform grid block), add:

```tsx
                {/* Software table */}
                {tab === 'software' &&
                    (software.isLoading ? (
                        <div className="p-4">
                            <TableSkeleton />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr>
                                        <th className={thClass}>{t('access_name')}</th>
                                        <th className={thClass}>{t('access_publisher')}</th>
                                        <th className={thClass}>{t('access_license_type')}</th>
                                        <th className={thClass}>{t('access_seats')}</th>
                                        <th className={thClass}>{t('access_members')}</th>
                                        <th className={`${thClass} text-right`}>{t('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSw.map((s) => {
                                        const used = s.seats_used ?? s.members?.length ?? 0;
                                        const over = s.seats != null && used > s.seats;
                                        return (
                                            <tr key={s.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => openSoftware(s)}>
                                                <td className={tdClass}>
                                                    <NameCell icon={Package} color="#2563eb" name={s.name} sub={s.version} />
                                                </td>
                                                <td className={tdClass}>{s.publisher ?? '—'}</td>
                                                <td className={tdClass}>{t(`access_lic_${s.license_type}`)}</td>
                                                <td className={`${tdClass} font-mono text-[12.5px] ${over ? 'text-destructive font-semibold' : ''}`}>
                                                    {used}
                                                    {s.seats != null ? `/${s.seats}` : ''}
                                                </td>
                                                <td className={tdClass}>
                                                    <AvatarStack members={s.members ?? []} />
                                                </td>
                                                <td className={`${tdClass} text-right`}>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openSoftware(s);
                                                        }}
                                                    >
                                                        <Users className="h-3.5 w-3.5" /> {t('access_manage_members')}
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ))}
```

- [ ] **Step 4: Add software fields to the modal**

In `resources/js/modules/access/components/resource-modal.tsx`:

Add `Software` + `SoftwareLicenseType` to the type import; add to the `AnyResource` union:

```typescript
import type { AccessKind, EmailGroup, FileShare, SocialPlatform, Software, SoftwareLicenseType } from '@/shared/types';

type AnyResource = EmailGroup | FileShare | SocialPlatform | Software;
```

Extend `FormState` and `empty` with the software fields:

```typescript
type FormState = {
    name: string;
    email: string;
    description: string;
    path: string;
    size_label: string;
    url: string;
    color: string;
    policy: string;
    owner_employee_id: string;
    department_id: string;
    publisher: string;
    version: string;
    license_type: SoftwareLicenseType;
    seats: string;
    notes: string;
};

const empty: FormState = {
    name: '', email: '', description: '', path: '', size_label: '', url: '', color: '', policy: '',
    owner_employee_id: '', department_id: '',
    publisher: '', version: '', license_type: 'subscription', seats: '', notes: '',
};
```

In `fromRow`, before the final social return, add a software branch:

```typescript
    if (kind === 'software') {
        const r = row as Software;
        return {
            ...empty,
            name: r.name,
            publisher: r.publisher ?? '',
            version: r.version ?? '',
            license_type: r.license_type,
            seats: r.seats != null ? String(r.seats) : '',
            notes: '',
            department_id: r.department_id ? String(r.department_id) : '',
        };
    }
```

In `toPayload`, before the final social return, add:

```typescript
    if (kind === 'software') {
        return {
            name: form.name.trim(),
            publisher: form.publisher.trim() || null,
            version: form.version.trim() || null,
            license_type: form.license_type,
            seats: form.seats.trim() === '' ? null : Number(form.seats),
            department_id: form.department_id ? Number(form.department_id) : null,
            notes: form.notes.trim() || null,
        };
    }
```

Extend `valid` — software just needs a name:

```typescript
    const valid =
        kind === 'email-groups'
            ? !!form.name.trim() && !!form.email.trim()
            : kind === 'file-shares'
              ? !!form.name.trim() && !!form.path.trim()
              : !!form.name.trim();
```

(no change needed — social & software both require only `name`; the existing `else` already covers `!!form.name.trim()`.)

Add `'software'` to `titleByKind`:

```typescript
        'software': t('access_software'),
```

Add the software field block after the social-platforms block:

```tsx
                    {kind === 'software' && (
                        <>
                            <Field label={t('access_publisher')}>
                                <Input value={form.publisher} onChange={(e) => set('publisher', e.target.value)} placeholder="Adobe" />
                            </Field>
                            <Field label={t('access_version')}>
                                <Input value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="2024" />
                            </Field>
                            <Field label={t('access_license_type')}>
                                <select
                                    value={form.license_type}
                                    onChange={(e) => set('license_type', e.target.value)}
                                    className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                                >
                                    <option value="subscription">{t('access_lic_subscription')}</option>
                                    <option value="perpetual">{t('access_lic_perpetual')}</option>
                                    <option value="free">{t('access_lic_free')}</option>
                                    <option value="open_source">{t('access_lic_open_source')}</option>
                                </select>
                            </Field>
                            <Field label={t('access_seats')}>
                                <Input type="number" min="0" value={form.seats} onChange={(e) => set('seats', e.target.value)} placeholder="10" />
                            </Field>
                            <Field label={t('access_department')}>
                                <SearchableSelect value={form.department_id} onChange={(v) => set('department_id', v)} options={departmentOptions} clearable />
                            </Field>
                            <Field label={t('access_notes')}>
                                <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                            </Field>
                        </>
                    )}
```

Note: `set` is typed `(k: keyof FormState, v: string)`; the `license_type` select passes a string, which is fine — cast at usage isn't needed because `FormState.license_type` is a union of string literals and the payload uses it directly. If tsc complains, change the select handler to `set('license_type', e.target.value as SoftwareLicenseType)` — but `set` stores into `FormState`, so widen `set`'s value type is unnecessary; instead the `license_type` field in `FormState` accepts the assignment through `toPayload`. If tsc errors on the `set('license_type', ...)` call, use a local setter: `onChange={(e) => setForm((f) => ({ ...f, license_type: e.target.value as SoftwareLicenseType }))}`.

- [ ] **Step 5: Verify typecheck + build**

Run: `npx tsc --noEmit`
Expected: clean (no output).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add resources/js/modules/access/pages/index.tsx resources/js/modules/access/components/resource-modal.tsx
git commit -m "feat(access): Software tab, table, KPI and modal fields on the Access page"
```

---

### Task 6: Employee view drawer — software access section

**Files:**
- Modify: `resources/js/modules/employee/components/employee-view-drawer.tsx`
- Verify: `npx tsc --noEmit`

**Interfaces:**
- Consumes: `EmployeeAccess.software` (Task 3/4), `useAccessMutations('software')`, `access_software` i18n key.
- Produces: a Software group in the employee's Access section (list + revoke), included in the access counts.

- [ ] **Step 1: Add the software mutation + group**

In `resources/js/modules/employee/components/employee-view-drawer.tsx`:

Add a software mutation next to `socialMut` (~line 110):

```typescript
    const softwareMut = useAccessMutations('software');
```

Add a group entry to the access-groups array (after the `social` entry, ~line 175):

```typescript
        {
            key: 'software' as const,
            kind: 'software' as AccessKind,
            mut: softwareMut,
            // (match the label/icon shape used by the sibling entries — see the `social` entry above)
        },
```

Add software to `mutByKey` (~line 182):

```typescript
    const mutByKey = { email_groups: emailGroupMut, file_shares: fileShareMut, social: socialMut, software: softwareMut } as const;
```

Include software in the `revoking` flag (~line 183):

```typescript
    const revoking = emailGroupMut.revokeMember.isPending || fileShareMut.revokeMember.isPending || socialMut.revokeMember.isPending || softwareMut.revokeMember.isPending;
```

Update the two access-count expressions (~line 448 and ~line 574) to add software:

```typescript
                                              count: access ? access.email_groups.length + access.file_shares.length + access.social.length + access.software.length : 0,
```

```tsx
                                    {access && access.email_groups.length + access.file_shares.length + access.social.length + access.software.length === 0 && (
```

> When editing this file, open it and match the exact shape of the existing `social` group object (label key, icon, `rows={access.social}`) — replicate it as a `software` group with `rows={access.software}` and label `t('access_software')`. The three sibling groups are the template; the software group is a fourth identical entry.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add resources/js/modules/employee/components/employee-view-drawer.tsx
git commit -m "feat(access): show software licences in the employee access panel"
```

---

### Task 7: Full verification + migrate

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

Run: `php artisan test --compact`
Expected: all pass (including the new `AccessSoftwareTest`).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean + successful build.

- [ ] **Step 3: Apply the migration to the running DB**

Run: `php artisan migrate --force`
Expected: `create_softwares_table` runs. (Additive — no existing data touched.)

- [ ] **Step 4: Manual smoke (optional but recommended)**

Open `/access` in the app: the header reads "Access Directory", a Software tab appears, `+ New Software` creates an entry with a `SW-` code, the members drawer grants/revokes a licence, and seats show `used/total`. Open an employee with a software licence — the Access panel lists it.

---

## Notes for the implementer

- The three existing resource types (email-groups, file-shares, social-platforms) are your reference implementation at every step — when a step says "mirror X", the named file already exists and compiles.
- `AccessKind` string values map 1:1 to route URIs: `software` → `/api/software`.
- `seats` is display-only; over-seat grants must succeed (a test asserts this). Do not add server-side seat enforcement.
- Do not touch the `access.view` / `access.manage` permission definitions — they already gate the new routes.
