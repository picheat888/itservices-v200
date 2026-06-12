# Org Approval Chain (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute and display an employee's approval chain by climbing the manager reporting tree, stopping at the VP-level ceiling.

**Architecture:** Approach A — a single self-referencing `employees.manager_id` reporting tree is the source of truth. `ApprovalChainService` climbs `manager_id` from a submitter, collecting each manager until it includes the first whose `positions.level` reaches the configured ceiling (VP). `positions.level` exists only as that ceiling test. Tree is kept acyclic by save-time validation plus a runtime guard. Org-chart visualization is deferred to a Phase-2 plan.

**Tech Stack:** Laravel 12 (PHP 8.2), PHPUnit, Eloquent; React 19 + TypeScript, TanStack Query, Tailwind. Spec: `docs/superpowers/specs/2026-06-08-org-approval-chain-design.md`.

---

## File Structure

**Backend**
- `database/migrations/*_add_level_to_positions_table.php` — new column.
- `database/migrations/*_add_manager_id_to_employees_table.php` — new self-FK.
- `app/Models/Position.php` — add `level` to `$fillable`.
- `app/Models/Employee.php` — add `manager_id` to `$fillable`, add `manager()` + `subordinates()` relations + `isDescendantOf()` helper.
- `app/Services/ApprovalChainService.php` — NEW: `chainFor()`.
- `app/Http/Requests/StoreEmployeeRequest.php` — add `manager_id` rule + cycle validation.
- `app/Http/Resources/ApproverNodeResource.php` — NEW: serialize an approver.
- `app/Http/Controllers/Api/EmployeeController.php` — add `approvalChain()`.
- `app/Http/Controllers/Api/PositionController.php` — accept `level` on store/update.
- `app/Http/Controllers/Api/SettingsController.php` — add `approval()` + `updateApproval()`.
- `routes/api.php` — chain route + approval settings routes.
- Tests: `tests/Feature/ApprovalChainTest.php` (NEW), additions to `tests/Feature/EmployeeApiTest.php`.

**Frontend**
- `resources/js/types/index.ts` — `Position.level`, `Employee.manager_id`, `ApproverNode`.
- `resources/js/services/orgApi.ts` — `EmployeePayload.manager_id`, `positionApi` level, `employeeApi.approvalChain()`.
- `resources/js/hooks/use-org.ts` — `useApprovalChain(id)`.
- `resources/js/components/employees/position-modal.tsx` — `level` input.
- `resources/js/components/employees/add-employee-drawer.tsx` — Manager picker.
- `resources/js/components/employees/employee-view-drawer.tsx` — chain display.
- `resources/js/services/settingsApi.ts` + `resources/js/pages/settings/index.tsx` — Approval ceiling setting under Master Data.

---

## Task 1: `positions.level` column

**Files:**
- Create: `database/migrations/2026_06_08_150000_add_level_to_positions_table.php`
- Modify: `app/Models/Position.php`
- Test: `tests/Feature/ApprovalChainTest.php`

- [ ] **Step 1: Create the migration**

```bash
php artisan make:migration add_level_to_positions_table --no-interaction
```

- [ ] **Step 2: Write the migration body** (use the generated filename)

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('positions', function (Blueprint $table) {
            $table->unsignedTinyInteger('level')->default(1)->after('title');
        });
    }

    public function down(): void
    {
        Schema::table('positions', function (Blueprint $table) {
            $table->dropColumn('level');
        });
    }
};
```

- [ ] **Step 3: Add `level` to `Position::$fillable`** in `app/Models/Position.php`

```php
protected $fillable = ['code', 'title', 'level'];
```

- [ ] **Step 4: Write the failing test** — create `tests/Feature/ApprovalChainTest.php`

```php
<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Position;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApprovalChainTest extends TestCase
{
    use RefreshDatabase;

    public function test_position_stores_a_level(): void
    {
        $p = Position::create(['title' => 'Manager', 'level' => 3]);

        $this->assertSame(3, $p->fresh()->level);
    }
}
```

- [ ] **Step 5: Run the migration + test**

Run: `php artisan migrate --no-interaction && php artisan test --compact --filter=test_position_stores_a_level`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add database/migrations app/Models/Position.php tests/Feature/ApprovalChainTest.php
git commit -m "feat(org): add level to positions"
```

---

## Task 2: `employees.manager_id` + relations

**Files:**
- Create: `database/migrations/2026_06_08_150100_add_manager_id_to_employees_table.php`
- Modify: `app/Models/Employee.php`
- Test: `tests/Feature/ApprovalChainTest.php`

- [ ] **Step 1: Create the migration**

```bash
php artisan make:migration add_manager_id_to_employees_table --no-interaction
```

- [ ] **Step 2: Write the migration body**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->foreignId('manager_id')->nullable()->after('position_id')
                ->constrained('employees')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropConstrainedForeignId('manager_id');
        });
    }
};
```

- [ ] **Step 3: Update `app/Models/Employee.php`** — add `manager_id` to `$fillable`, add relations + a descendant helper. Add `manager_id` to the existing `$fillable` array, then add these methods inside the class:

```php
/** This employee's direct manager (null at the top of the tree). */
public function manager(): BelongsTo
{
    return $this->belongsTo(Employee::class, 'manager_id');
}

/** Employees who report directly to this one. */
public function subordinates(): HasMany
{
    return $this->hasMany(Employee::class, 'manager_id');
}

/**
 * True when $other sits somewhere below this employee in the reporting tree
 * (used to reject a manager assignment that would create a cycle). Walks up
 * from $other; a repeat id ends the walk defensively.
 */
public function isAncestorOf(Employee $other): bool
{
    $seen = [];
    $current = $other->manager;
    while ($current !== null && ! in_array($current->id, $seen, true)) {
        if ($current->id === $this->id) {
            return true;
        }
        $seen[] = $current->id;
        $current = $current->manager;
    }

    return false;
}
```

`HasMany` is already imported; add `use Illuminate\Database\Eloquent\Relations\HasMany;` if missing (it is already present per the current file).

- [ ] **Step 4: Write the failing test** — append to `ApprovalChainTest`

```php
public function test_manager_and_subordinate_relations(): void
{
    $boss = Employee::create(['name' => 'Boss']);
    $staff = Employee::create(['name' => 'Staff', 'manager_id' => $boss->id]);

    $this->assertSame($boss->id, $staff->manager->id);
    $this->assertTrue($boss->subordinates->contains($staff));
    $this->assertTrue($boss->isAncestorOf($staff->fresh()));
    $this->assertFalse($staff->isAncestorOf($boss->fresh()));
}
```

- [ ] **Step 5: Run migration + test**

Run: `php artisan migrate --no-interaction && php artisan test --compact --filter=test_manager_and_subordinate_relations`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add database/migrations app/Models/Employee.php tests/Feature/ApprovalChainTest.php
git commit -m "feat(org): add manager_id self-relation to employees"
```

---

## Task 3: `ApprovalChainService::chainFor`

**Files:**
- Create: `app/Services/ApprovalChainService.php`
- Test: `tests/Feature/ApprovalChainTest.php`

- [ ] **Step 1: Write the failing tests** — append to `ApprovalChainTest`

```php
private function positionAt(int $level): Position
{
    return Position::create(['title' => "L{$level}", 'level' => $level]);
}

public function test_chain_climbs_managers_and_stops_at_the_ceiling(): void
{
    // Levels: staff 1 -> supervisor 2 -> manager 3 -> vp 4 -> ceo 5
    $ceo = Employee::create(['name' => 'CEO', 'position_id' => $this->positionAt(5)->id]);
    $vp = Employee::create(['name' => 'VP', 'position_id' => $this->positionAt(4)->id, 'manager_id' => $ceo->id]);
    $mgr = Employee::create(['name' => 'Mgr', 'position_id' => $this->positionAt(3)->id, 'manager_id' => $vp->id]);
    $sup = Employee::create(['name' => 'Sup', 'position_id' => $this->positionAt(2)->id, 'manager_id' => $mgr->id]);
    $staff = Employee::create(['name' => 'Staff', 'position_id' => $this->positionAt(1)->id, 'manager_id' => $sup->id]);

    // Ceiling = 4 (VP). Chain stops at VP, CEO excluded.
    \App\Models\AppSetting::put('approval_ceiling_level', '4');

    $chain = app(\App\Services\ApprovalChainService::class)->chainFor($staff);

    $this->assertSame(['Sup', 'Mgr', 'VP'], $chain->pluck('name')->all());
}

public function test_chain_is_empty_when_no_manager(): void
{
    $solo = Employee::create(['name' => 'Solo', 'position_id' => $this->positionAt(1)->id]);

    $this->assertCount(0, app(\App\Services\ApprovalChainService::class)->chainFor($solo));
}

public function test_manager_without_level_does_not_stop_the_climb(): void
{
    \App\Models\AppSetting::put('approval_ceiling_level', '4');
    $vp = Employee::create(['name' => 'VP', 'position_id' => $this->positionAt(4)->id]);
    $mid = Employee::create(['name' => 'Mid', 'manager_id' => $vp->id]); // no position -> level 0
    $staff = Employee::create(['name' => 'Staff', 'manager_id' => $mid->id]);

    $chain = app(\App\Services\ApprovalChainService::class)->chainFor($staff);

    $this->assertSame(['Mid', 'VP'], $chain->pluck('name')->all());
}

public function test_chain_terminates_on_a_cycle(): void
{
    \App\Models\AppSetting::put('approval_ceiling_level', '9');
    $a = Employee::create(['name' => 'A']);
    $b = Employee::create(['name' => 'B', 'manager_id' => $a->id]);
    $a->update(['manager_id' => $b->id]); // A <-> B loop

    $chain = app(\App\Services\ApprovalChainService::class)->chainFor($a);

    // Climbs B then A(self repeat) -> stops; never infinite-loops.
    $this->assertSame(['B'], $chain->pluck('name')->all());
}
```

- [ ] **Step 2: Run to verify failure**

Run: `php artisan test --compact --filter=ApprovalChainTest`
Expected: FAIL (class `ApprovalChainService` not found).

- [ ] **Step 3: Implement `app/Services/ApprovalChainService.php`**

```php
<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\Employee;
use App\Models\Position;
use Illuminate\Support\Collection;

class ApprovalChainService
{
    /**
     * Resolve an employee's approval chain by climbing the manager reporting
     * tree. Each manager is collected in order (direct manager first). The walk
     * stops once it includes the first manager whose position level reaches the
     * configured VP ceiling, or at the tree root, or on a detected cycle.
     *
     * @return Collection<int, Employee>
     */
    public function chainFor(Employee $employee): Collection
    {
        $ceiling = $this->ceilingLevel();
        $chain = collect();
        $seen = [$employee->id];
        $current = $employee;

        while (true) {
            $manager = $current->manager()->with('position')->first();
            if ($manager === null || in_array($manager->id, $seen, true)) {
                break;
            }

            $chain->push($manager);
            $seen[] = $manager->id;

            if (($manager->position?->level ?? 0) >= $ceiling) {
                break;
            }

            $current = $manager;
        }

        return $chain;
    }

    /**
     * The level treated as VP — the configured value, or the highest position
     * level present when unset (so the top tier caps the chain by default).
     */
    public function ceilingLevel(): int
    {
        $configured = AppSetting::get('approval_ceiling_level');
        if ($configured !== null && $configured !== '') {
            return (int) $configured;
        }

        return (int) (Position::max('level') ?? 1);
    }
}
```

- [ ] **Step 4: Run tests**

Run: `php artisan test --compact --filter=ApprovalChainTest`
Expected: PASS (all chain tests).

- [ ] **Step 5: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/ApprovalChainService.php tests/Feature/ApprovalChainTest.php
git commit -m "feat(org): approval-chain resolver climbing manager_id to the VP ceiling"
```

---

## Task 4: Cycle-safe `manager_id` validation on save

**Files:**
- Modify: `app/Http/Requests/StoreEmployeeRequest.php`
- Test: `tests/Feature/EmployeeApiTest.php`

- [ ] **Step 1: Add the rule + cycle check to `StoreEmployeeRequest`**

Add `'manager_id'` to the `rules()` array:

```php
'manager_id' => ['nullable', 'exists:employees,id'],
```

Then add a `withValidator()` method to the class (reject self / descendant — only relevant when editing an existing employee):

```php
use Illuminate\Validation\Validator;
use App\Models\Employee;

/**
 * A manager may not be the employee itself, nor anyone who already reports
 * (directly or indirectly) to it — either would create a cycle in the tree.
 */
public function withValidator(Validator $validator): void
{
    $validator->after(function (Validator $v) {
        $employee = $this->route('employee');
        $managerId = $this->input('manager_id');
        if (! $employee || blank($managerId)) {
            return;
        }
        if ((int) $managerId === $employee->id) {
            $v->errors()->add('manager_id', 'An employee cannot be their own manager.');

            return;
        }
        $manager = Employee::find($managerId);
        if ($manager && $employee->isAncestorOf($manager)) {
            $v->errors()->add('manager_id', 'That person reports to this employee — it would create a loop.');
        }
    });
}
```

- [ ] **Step 2: Write the failing tests** — append to `tests/Feature/EmployeeApiTest.php` (uses its existing `super()`/`actingAs` helpers; confirm an `employees.edit`-capable actor)

```php
public function test_employee_cannot_be_their_own_manager(): void
{
    $this->actingAs($this->super());
    $e = \App\Models\Employee::create(['name' => 'Solo']);

    $this->putJson("/api/employees/{$e->id}", ['name' => 'Solo', 'manager_id' => $e->id])
        ->assertStatus(422)
        ->assertJsonValidationErrors('manager_id');
}

public function test_manager_cannot_be_a_descendant(): void
{
    $this->actingAs($this->super());
    $boss = \App\Models\Employee::create(['name' => 'Boss']);
    $staff = \App\Models\Employee::create(['name' => 'Staff', 'manager_id' => $boss->id]);

    // Making the boss report to its own subordinate must fail.
    $this->putJson("/api/employees/{$boss->id}", ['name' => 'Boss', 'manager_id' => $staff->id])
        ->assertStatus(422)
        ->assertJsonValidationErrors('manager_id');
}

public function test_valid_manager_is_accepted(): void
{
    $this->actingAs($this->super());
    $boss = \App\Models\Employee::create(['name' => 'Boss']);
    $staff = \App\Models\Employee::create(['name' => 'Staff']);

    $this->putJson("/api/employees/{$staff->id}", ['name' => 'Staff', 'manager_id' => $boss->id])
        ->assertOk();
    $this->assertSame($boss->id, $staff->fresh()->manager_id);
}
```

If `EmployeeApiTest` has no `super()` helper, add one mirroring `ContractApiTest`:
`private function super(): User { return User::factory()->create(['role' => 'super']); }` (import `App\Models\User`).

- [ ] **Step 3: Run tests**

Run: `php artisan test --compact tests/Feature/EmployeeApiTest.php`
Expected: PASS (new + existing tests).

- [ ] **Step 4: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Requests/StoreEmployeeRequest.php tests/Feature/EmployeeApiTest.php
git commit -m "feat(org): validate manager_id against self and descendants"
```

---

## Task 5: Approval-chain API endpoint + resource

**Files:**
- Create: `app/Http/Resources/ApproverNodeResource.php`
- Modify: `app/Http/Controllers/Api/EmployeeController.php`, `routes/api.php`
- Test: `tests/Feature/ApprovalChainTest.php`

- [ ] **Step 1: Create `app/Http/Resources/ApproverNodeResource.php`**

```php
<?php

namespace App\Http\Resources;

use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Employee */
class ApproverNodeResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'name_th' => $this->name_th,
            'position' => $this->position?->title,
            'level' => $this->position?->level,
            'department' => $this->department?->name,
            'status' => $this->status instanceof \App\Enums\EmployeeStatus ? $this->status->value : (string) $this->status,
        ];
    }
}
```

- [ ] **Step 2: Add `approvalChain()` to `EmployeeController`** (inject the service in the action signature; constructor already injects `EmployeeService`)

```php
use App\Http\Resources\ApproverNodeResource;
use App\Services\ApprovalChainService;

/** Returns the employee's approval chain (direct manager first, up to the VP ceiling). */
public function approvalChain(Request $request, Employee $employee, ApprovalChainService $chain): JsonResponse
{
    abort_unless((bool) $request->user()?->hasPermission('employees.view'), 403);

    $approvers = $chain->chainFor($employee)->load(['position', 'department']);

    return ApproverNodeResource::collection($approvers)->additional(['message' => 'success'])->response();
}
```

- [ ] **Step 3: Add the route** in `routes/api.php` — place it BEFORE `Route::apiResource('employees', ...)` so it isn't shadowed:

```php
Route::get('employees/{employee}/approval-chain', [EmployeeController::class, 'approvalChain'])->name('api.employees.approval-chain');
```

- [ ] **Step 4: Write the failing tests** — append to `ApprovalChainTest`

```php
public function test_endpoint_returns_the_chain_ordered(): void
{
    $this->actingAs(User::factory()->create(['role' => 'super']));
    \App\Models\AppSetting::put('approval_ceiling_level', '4');
    $vp = Employee::create(['name' => 'VP', 'position_id' => $this->positionAt(4)->id]);
    $mgr = Employee::create(['name' => 'Mgr', 'position_id' => $this->positionAt(3)->id, 'manager_id' => $vp->id]);
    $staff = Employee::create(['name' => 'Staff', 'position_id' => $this->positionAt(1)->id, 'manager_id' => $mgr->id]);

    $this->getJson("/api/employees/{$staff->id}/approval-chain")
        ->assertOk()
        ->assertJsonPath('data.0.name', 'Mgr')
        ->assertJsonPath('data.1.name', 'VP');
}

public function test_endpoint_requires_authentication(): void
{
    $staff = Employee::create(['name' => 'Staff']);
    $this->getJson("/api/employees/{$staff->id}/approval-chain")->assertUnauthorized();
}

public function test_endpoint_requires_employees_view_permission(): void
{
    $this->actingAs(User::factory()->create(['role' => 'user']));
    $staff = Employee::create(['name' => 'Staff']);
    $this->getJson("/api/employees/{$staff->id}/approval-chain")->assertForbidden();
}
```

- [ ] **Step 5: Run tests**

Run: `php artisan test --compact --filter=ApprovalChainTest`
Expected: PASS.

- [ ] **Step 6: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Resources/ApproverNodeResource.php app/Http/Controllers/Api/EmployeeController.php routes/api.php tests/Feature/ApprovalChainTest.php
git commit -m "feat(org): approval-chain API endpoint"
```

---

## Task 6: Approval ceiling setting (backend)

**Files:**
- Modify: `app/Http/Controllers/Api/SettingsController.php`, `routes/api.php`
- Test: `tests/Feature/ApprovalChainTest.php`

- [ ] **Step 1: Add read + update actions to `SettingsController`** (mirror the existing `security()`/`updateSecurity()` pair)

```php
/** Approval policy (the VP ceiling level). Readable by any authenticated user. */
public function approval(Request $request): JsonResponse
{
    return response()->json(['data' => $this->approvalPayload(), 'message' => 'success']);
}

/** Updates the approval ceiling level. Gated by route middleware permission:settings.masterdata. */
public function updateApproval(Request $request): JsonResponse
{
    $data = $request->validate([
        'approval_ceiling_level' => ['required', 'integer', 'min:1', 'max:20'],
    ]);

    AppSetting::put('approval_ceiling_level', (string) $data['approval_ceiling_level']);
    AuditLog::record('Updated approval settings', 'approval_ceiling_level');

    return $this->approval($request);
}

/**
 * @return array{approval_ceiling_level: int}
 */
private function approvalPayload(): array
{
    return [
        'approval_ceiling_level' => (int) AppSetting::get('approval_ceiling_level', (string) (\App\Models\Position::max('level') ?? 1)),
    ];
}
```

- [ ] **Step 2: Add routes** in `routes/api.php` next to the other `settings/*` routes inside the `auth:sanctum` group:

```php
Route::get('settings/approval', [SettingsController::class, 'approval'])->name('api.settings.approval');
Route::put('settings/approval', [SettingsController::class, 'updateApproval'])
    ->middleware('permission:settings.masterdata')->name('api.settings.approval.update');
```

- [ ] **Step 3: Write the failing tests** — append to `ApprovalChainTest`

```php
public function test_updates_approval_ceiling_level(): void
{
    $this->actingAs(User::factory()->create(['role' => 'super']));

    $this->putJson('/api/settings/approval', ['approval_ceiling_level' => 4])
        ->assertOk()
        ->assertJsonPath('data.approval_ceiling_level', 4);

    $this->assertSame('4', \App\Models\AppSetting::get('approval_ceiling_level'));
}

public function test_approval_ceiling_requires_permission(): void
{
    $this->actingAs(User::factory()->create(['role' => 'user']));
    $this->putJson('/api/settings/approval', ['approval_ceiling_level' => 4])->assertForbidden();
}
```

- [ ] **Step 4: Run tests**

Run: `php artisan test --compact --filter=ApprovalChainTest`
Expected: PASS.

- [ ] **Step 5: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/SettingsController.php routes/api.php tests/Feature/ApprovalChainTest.php
git commit -m "feat(org): approval ceiling level setting endpoint"
```

---

## Task 7: Frontend types

**Files:**
- Modify: `resources/js/types/index.ts`

- [ ] **Step 1: Update the `Position` and `Employee` interfaces and add `ApproverNode`**

Add `level: number;` to the `Position` interface. Add `manager_id: number | null;` to the `Employee` interface. Add:

```ts
export interface ApproverNode {
    id: number;
    code: string;
    name: string;
    name_th: string | null;
    position: string | null;
    level: number | null;
    department: string | null;
    status: string;
}
```

- [ ] **Step 2: Verify the build typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add resources/js/types/index.ts
git commit -m "feat(org): frontend types for level, manager_id, ApproverNode"
```

---

## Task 8: Position level — API + modal

**Files:**
- Modify: `resources/js/services/orgApi.ts`, `resources/js/components/employees/position-modal.tsx`
- Backend: `app/Http/Controllers/Api/PositionController.php`

- [ ] **Step 1: Accept `level` in `PositionController`** — in both the store and update `validate()` calls add:

```php
'level' => ['nullable', 'integer', 'min:1', 'max:20'],
```

(`level` is already in `Position::$fillable`, so it persists through `Position::create()` / `->update()`.)

- [ ] **Step 2: Update `positionApi` in `orgApi.ts`**

```ts
export const positionApi = {
    list: () => http.get<ApiEnvelope<Position[]>>('/positions').then((r) => r.data.data),
    create: (payload: { title: string; level: number }) => mutate<Position>('post', '/positions', payload),
    update: (id: number, payload: { title: string; level: number }) => mutate<Position>('put', `/positions/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/positions/${id}`),
};
```

Note: `usePositionMutations` in `resources/js/hooks/use-org.ts` passes the payload straight through; update its mutation arg types to `{ title: string; level: number }` to match (check the hook and adjust the generic types).

- [ ] **Step 3: Add the `level` input to `position-modal.tsx`**

Add a `level` state (`const [level, setLevel] = useState(1);`), seed it in the `useEffect` (`setLevel(position?.level ?? 1);`), send it in `submit` (`{ title, level }`), and render after the title field:

```tsx
<Field label={t('pos_level')}>
    <Input
        type="number"
        min={1}
        max={20}
        value={level}
        onChange={(e) => setLevel(Math.max(1, Number(e.target.value) || 1))}
    />
</Field>
```

Add the i18n key `pos_level` (`'Level'` / `'ระดับ'`) to `resources/js/lib/i18n.ts` (both `en` and `th` maps).

- [ ] **Step 4: Build + verify**

Run: `npx tsc --noEmit && npx eslint resources/js/components/employees/position-modal.tsx resources/js/services/orgApi.ts && npm run build`
Expected: typecheck clean, eslint exit 0, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/PositionController.php resources/js/services/orgApi.ts resources/js/hooks/use-org.ts resources/js/components/employees/position-modal.tsx resources/js/lib/i18n.ts
git commit -m "feat(org): edit position level in the position modal"
```

---

## Task 9: Manager picker in the employee form

**Files:**
- Modify: `resources/js/services/orgApi.ts`, `resources/js/components/employees/add-employee-drawer.tsx`

- [ ] **Step 1: Add `manager_id` to `EmployeePayload`** in `orgApi.ts`

```ts
manager_id?: number | null;
```

- [ ] **Step 2: Add a Manager field to `add-employee-drawer.tsx`**

Read the file first to match its form state + field pattern. Add `manager_id` to the form state (seed from `employee?.manager_id ?? null` when editing, `null` when creating), include it in the submit payload, and render a `SearchableSelect` (the project's employee picker — see `department-modal.tsx` for usage) labelled `t('emp_manager')`. The option list is the employee directory **excluding the employee being edited** (descendant exclusion is enforced server-side; the picker only needs to drop self). Add i18n key `emp_manager` (`'Manager'` / `'หัวหน้า'`).

- [ ] **Step 3: Build + verify**

Run: `npx tsc --noEmit && npx eslint resources/js/components/employees/add-employee-drawer.tsx resources/js/services/orgApi.ts && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add resources/js/services/orgApi.ts resources/js/components/employees/add-employee-drawer.tsx resources/js/lib/i18n.ts
git commit -m "feat(org): set an employee's manager in the form"
```

---

## Task 10: Display the approval chain in the employee drawer

**Files:**
- Modify: `resources/js/services/orgApi.ts`, `resources/js/hooks/use-org.ts`, `resources/js/components/employees/employee-view-drawer.tsx`

- [ ] **Step 1: Add the API call** to `employeeApi` in `orgApi.ts`

```ts
approvalChain: (id: number) =>
    http.get<ApiEnvelope<ApproverNode[]>>(`/employees/${id}/approval-chain`).then((r) => r.data.data),
```

Import `ApproverNode` in the `import type { ... }` line at the top.

- [ ] **Step 2: Add a query hook** to `resources/js/hooks/use-org.ts`

```ts
export function useApprovalChain(id: number | null) {
    return useQuery({
        queryKey: ['approval-chain', id],
        queryFn: () => employeeApi.approvalChain(id as number),
        enabled: id !== null,
    });
}
```

(Match the existing import of `employeeApi` / `useQuery` in that file.)

- [ ] **Step 3: Render the chain in `employee-view-drawer.tsx`**

Read the drawer first to match its section layout. Add a section "Approval chain" (`t('emp_approval_chain')`) that calls `useApprovalChain(employee?.id ?? null)` and renders the returned nodes as ascending rows: `name` + `position` per row, joined by an up-arrow or shown as a vertical list `Direct manager → … → VP`. When the list is empty show `t('emp_no_approver')`. Flag any node with `status === 'resigned'` (muted "resigned" tag). Add i18n keys `emp_approval_chain` (`'Approval chain'` / `'สายอนุมัติ'`) and `emp_no_approver` (`'No approver above this person'` / `'ไม่มีผู้อนุมัติเหนือกว่า'`).

- [ ] **Step 4: Build + verify**

Run: `npx tsc --noEmit && npx eslint resources/js/components/employees/employee-view-drawer.tsx resources/js/hooks/use-org.ts resources/js/services/orgApi.ts && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add resources/js/services/orgApi.ts resources/js/hooks/use-org.ts resources/js/components/employees/employee-view-drawer.tsx resources/js/lib/i18n.ts
git commit -m "feat(org): show the approval chain in the employee drawer"
```

---

## Task 11: Approval ceiling setting (frontend, Settings → Master Data)

**Files:**
- Modify: `resources/js/services/settingsApi.ts`, `resources/js/pages/settings/index.tsx`

- [ ] **Step 1: Add API methods** to `settingsApi.ts` (mirror `getSecurity`/`updateSecurity`)

```ts
export interface ApprovalSettings {
    approval_ceiling_level: number;
}

// inside the settingsApi object:
getApproval: () => http.get<ApiEnvelope<ApprovalSettings>>('/settings/approval').then((r) => r.data.data),
updateApproval: (payload: ApprovalSettings) =>
    http.put<ApiEnvelope<ApprovalSettings>>('/settings/approval', payload).then((r) => r.data.data),
```

(Match the file's existing typing/`ensureCsrf` convention for mutations.)

- [ ] **Step 2: Add an "Approval" block to `MasterDataTab`** in `pages/settings/index.tsx`

At the top of the Master Data tab, render a small card with a numeric input bound to `approval_ceiling_level`, loaded via `useQuery(['approval-settings'], settingsApi.getApproval)` and saved with a mutation calling `settingsApi.updateApproval`, using the existing `SaveButton`. Label it `t('set_approval_ceiling')` with help text explaining "managers at or above this level end the approval chain (VP)". Add i18n keys `set_approval` / `set_approval_ceiling` / `set_approval_ceiling_help` (en + th).

- [ ] **Step 3: Build + verify**

Run: `npx tsc --noEmit && npx eslint resources/js/pages/settings/index.tsx resources/js/services/settingsApi.ts && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add resources/js/services/settingsApi.ts resources/js/pages/settings/index.tsx resources/js/lib/i18n.ts
git commit -m "feat(org): edit the approval ceiling level in settings"
```

---

## Task 12: Full verification

- [ ] **Step 1: Run the affected backend tests**

Run: `php artisan test --compact tests/Feature/ApprovalChainTest.php tests/Feature/EmployeeApiTest.php`
Expected: all PASS.

- [ ] **Step 2: Frontend gate**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build.

- [ ] **Step 3: Manual smoke (optional)**

Set a few employees' managers + position levels, set the ceiling, open an employee drawer, confirm the chain renders bottom→VP and stops at the ceiling.

- [ ] **Step 4: Final commit if anything was fixed during verification.**

---

## Notes for the implementer

- `manager_id` is **not populated** by this plan — it is operational data the admin fills via the new Manager field. Seeders are unchanged.
- No JS test harness exists; frontend verification is `tsc` + `eslint` + `npm run build` (+ manual), matching the project's convention.
- Do NOT recreate the removed Workflow settings tab or `settings.workflows` permission — the ceiling setting lives under Master Data (`settings.masterdata`).
- After finishing, README is updated once for the whole phase (project convention), not per task.
