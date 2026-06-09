# Employee Sections (หน่วยงาน) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Section (หน่วยงาน) level between Department and Employee — a `sections` table, `employees.section_id`, a "Sections" management tab, and a cascading Department→Section picker on the employee form.

**Architecture:** `sections` belongs to a department (cascade-deleted with it); `employees.section_id` is a nullable FK (null-on-delete) that must reference a section in the employee's own department. The org chart is NOT touched this phase.

**Tech Stack:** Laravel 12 / PHPUnit; React 19 + TypeScript, TanStack Query, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-09-employee-sections-design.md`

## Testing convention

- **Backend:** PHPUnit, TDD. Run `php artisan test --compact --filter=...`. Tests use `Employee::create()` / `Department::create()` directly (matches sibling tests like `DepartmentApiTest`, `EmployeeApiTest` — do NOT switch to factories). A privileged actor is `User::factory()->create(['role' => 'super'])`; role `'user'` lacks org-manage permission.
- **Frontend:** No JS test runner — verify with `npx tsc --noEmit`, `npx eslint <files>`, `npm run build`.
- Run `vendor/bin/pint --dirty --format agent` before committing PHP changes.

## File Structure

**Backend**
- Create `database/migrations/*_create_sections_table.php`
- Create `database/migrations/*_add_section_id_to_employees_table.php`
- Create `app/Models/Section.php`
- Modify `app/Models/Department.php` (add `sections()`)
- Modify `app/Models/Employee.php` (add `section_id` fillable + `section()`)
- Create `app/Http/Resources/SectionResource.php`
- Create `app/Http/Requests/StoreSectionRequest.php`
- Create `app/Http/Controllers/Api/SectionController.php`
- Modify `routes/api.php`
- Modify `app/Http/Resources/EmployeeResource.php`
- Modify `app/Http/Requests/StoreEmployeeRequest.php`
- Modify `app/Http/Controllers/Api/EmployeeController.php` (eager-load `section`)
- Tests: `tests/Feature/SectionApiTest.php` (new), `tests/Feature/EmployeeApiTest.php` (add)

**Frontend**
- Modify `resources/js/types/index.ts`
- Modify `resources/js/services/orgApi.ts`
- Modify `resources/js/hooks/use-org.ts`
- Create `resources/js/components/employees/section-modal.tsx`
- Create `resources/js/components/employees/sections-tab.tsx`
- Modify `resources/js/components/employees/add-employee-drawer.tsx`
- Modify `resources/js/components/employees/employee-view-drawer.tsx`
- Modify `resources/js/pages/employees/index.tsx`
- Modify `resources/js/lib/i18n.ts`

---

## Task 1: Schema + models

**Files:**
- Create: `database/migrations/2026_06_09_070000_create_sections_table.php`
- Create: `database/migrations/2026_06_09_070100_add_section_id_to_employees_table.php`
- Create: `app/Models/Section.php`
- Modify: `app/Models/Department.php`, `app/Models/Employee.php`
- Test: `tests/Feature/SectionApiTest.php`

- [ ] **Step 1: Create the migrations**

```bash
php artisan make:migration create_sections_table --no-interaction
php artisan make:migration add_section_id_to_employees_table --no-interaction
```

- [ ] **Step 2: Write `create_sections_table` body**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('department_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('name_th')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sections');
    }
};
```

- [ ] **Step 3: Write `add_section_id_to_employees_table` body**

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
            $table->foreignId('section_id')->nullable()->after('department_id')
                ->constrained('sections')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropConstrainedForeignId('section_id');
        });
    }
};
```

- [ ] **Step 4: Create `app/Models/Section.php`**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Section extends Model
{
    protected $fillable = ['department_id', 'name', 'name_th'];

    /** The department this section belongs to. */
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    /** Employees assigned to this section. */
    public function employees(): HasMany
    {
        return $this->hasMany(Employee::class);
    }
}
```

- [ ] **Step 5: Add `sections()` to `app/Models/Department.php`** — next to the existing `employees()` relation. `HasMany` is already imported.

```php
public function sections(): HasMany
{
    return $this->hasMany(Section::class);
}
```

- [ ] **Step 6: Update `app/Models/Employee.php`** — add `'section_id'` to `$fillable` (in the first line of the array, after `'department_id'`), and add a `section()` relation next to `department()`:

```php
public function section(): BelongsTo
{
    return $this->belongsTo(Section::class);
}
```

- [ ] **Step 7: Write the failing test** — create `tests/Feature/SectionApiTest.php`

```php
<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SectionApiTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_section_belongs_to_department_and_has_employees(): void
    {
        $dept = Department::create(['name' => 'IT']);
        $section = Section::create(['department_id' => $dept->id, 'name' => 'Network', 'name_th' => 'เครือข่าย']);
        Employee::create(['name' => 'A', 'department_id' => $dept->id, 'section_id' => $section->id]);

        $this->assertSame($dept->id, $section->department->id);
        $this->assertCount(1, $section->employees);
        $this->assertTrue($dept->sections->contains($section));
    }

    public function test_deleting_a_department_cascades_its_sections(): void
    {
        $dept = Department::create(['name' => 'Ops']);
        $section = Section::create(['department_id' => $dept->id, 'name' => 'Line']);
        $dept->delete();

        $this->assertDatabaseMissing('sections', ['id' => $section->id]);
    }

    public function test_deleting_a_section_nulls_employee_section_id(): void
    {
        $dept = Department::create(['name' => 'QA']);
        $section = Section::create(['department_id' => $dept->id, 'name' => 'Inspect']);
        $emp = Employee::create(['name' => 'B', 'department_id' => $dept->id, 'section_id' => $section->id]);

        $section->delete();

        $this->assertNull($emp->fresh()->section_id);
    }
}
```

- [ ] **Step 8: Run migration + tests**

Run: `php artisan migrate --no-interaction && php artisan test --compact --filter=SectionApiTest`
Expected: 3 PASS.

- [ ] **Step 9: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add database/migrations app/Models/Section.php app/Models/Department.php app/Models/Employee.php tests/Feature/SectionApiTest.php
git commit -m "feat(org): sections table + Department/Employee relations"
```

---

## Task 2: Section CRUD API

**Files:**
- Create: `app/Http/Resources/SectionResource.php`, `app/Http/Requests/StoreSectionRequest.php`, `app/Http/Controllers/Api/SectionController.php`
- Modify: `routes/api.php`
- Test: `tests/Feature/SectionApiTest.php`

- [ ] **Step 1: Write the failing tests** — append to `SectionApiTest`

```php
public function test_lists_sections_filtered_by_department_with_member_counts(): void
{
    $this->actingAs($this->super());
    $it = Department::create(['name' => 'IT']);
    $hr = Department::create(['name' => 'HR']);
    $net = Section::create(['department_id' => $it->id, 'name' => 'Network']);
    Section::create(['department_id' => $hr->id, 'name' => 'Payroll']);
    Employee::create(['name' => 'A', 'department_id' => $it->id, 'section_id' => $net->id]);

    $this->getJson("/api/sections?department_id={$it->id}")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'Network')
        ->assertJsonPath('data.0.department', 'IT')
        ->assertJsonPath('data.0.members_count', 1);
}

public function test_creates_updates_and_deletes_a_section(): void
{
    $this->actingAs($this->super());
    $dept = Department::create(['name' => 'IT']);

    $created = $this->postJson('/api/sections', ['department_id' => $dept->id, 'name' => 'Network', 'name_th' => 'เครือข่าย'])
        ->assertStatus(201)
        ->assertJsonPath('data.name', 'Network')
        ->json('data.id');

    $this->putJson("/api/sections/{$created}", ['department_id' => $dept->id, 'name' => 'Networking'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Networking');

    $this->deleteJson("/api/sections/{$created}")->assertOk();
    $this->assertDatabaseMissing('sections', ['id' => $created]);
}

public function test_section_write_requires_org_manage_permission(): void
{
    $this->actingAs(User::factory()->create(['role' => 'user']));
    $dept = Department::create(['name' => 'IT']);
    $this->postJson('/api/sections', ['department_id' => $dept->id, 'name' => 'X'])->assertForbidden();
}

public function test_section_endpoints_require_authentication(): void
{
    $this->getJson('/api/sections')->assertUnauthorized();
}
```

- [ ] **Step 2: Run to verify failure**

Run: `php artisan test --compact --filter=SectionApiTest`
Expected: the four new tests FAIL (route `sections` not defined).

- [ ] **Step 3: Create `app/Http/Resources/SectionResource.php`**

```php
<?php

namespace App\Http\Resources;

use App\Models\Section;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Section */
class SectionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'department_id' => $this->department_id,
            'name' => $this->name,
            'name_th' => $this->name_th,
            'department' => $this->whenLoaded('department', fn () => $this->department?->name),
            'members_count' => $this->whenCounted('employees', $this->employees_count, $this->employees()->count()),
        ];
    }
}
```

- [ ] **Step 4: Create `app/Http/Requests/StoreSectionRequest.php`**

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->canManageOrg();
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'department_id' => ['required', 'exists:departments,id'],
            'name' => ['required', 'string', 'max:255'],
            'name_th' => ['nullable', 'string', 'max:255'],
        ];
    }
}
```

- [ ] **Step 5: Create `app/Http/Controllers/Api/SectionController.php`** (mirrors `DepartmentController`)

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSectionRequest;
use App\Http\Resources\SectionResource;
use App\Models\AuditLog;
use App\Models\Section;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SectionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Section::with('department')->withCount('employees')
            ->orderBy('department_id')->orderBy('name');

        if ($request->filled('department_id')) {
            $query->where('department_id', (int) $request->query('department_id'));
        }

        return SectionResource::collection($query->get())->response();
    }

    public function store(StoreSectionRequest $request): JsonResponse
    {
        $section = Section::create($request->validated());
        AuditLog::record('Created section', $section->name);

        return (new SectionResource($section->load('department')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function update(StoreSectionRequest $request, Section $section): JsonResponse
    {
        $before = $section->getOriginal();
        $section->update($request->validated());
        AuditLog::record('Updated section', $section->name, AuditLog::changes($before, $section));

        return (new SectionResource($section->load('department')))->additional(['message' => 'success'])->response();
    }

    public function destroy(Request $request, Section $section): JsonResponse
    {
        abort_unless((bool) $request->user()?->canManageOrg(), 403);
        AuditLog::record('Deleted section', $section->name);
        $section->delete();

        return response()->json(['message' => 'success']);
    }
}
```

- [ ] **Step 6: Register routes** in `routes/api.php` — next to the `departments` apiResource, inside the `auth:sanctum` group:

```php
Route::apiResource('sections', \App\Http\Controllers\Api\SectionController::class)->only(['index', 'store', 'update', 'destroy']);
```

- [ ] **Step 7: Run tests**

Run: `php artisan test --compact --filter=SectionApiTest`
Expected: all PASS (7 total).

- [ ] **Step 8: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Resources/SectionResource.php app/Http/Requests/StoreSectionRequest.php app/Http/Controllers/Api/SectionController.php routes/api.php tests/Feature/SectionApiTest.php
git commit -m "feat(org): section CRUD api"
```

---

## Task 3: Employee ↔ section (resource + validation)

**Files:**
- Modify: `app/Http/Resources/EmployeeResource.php`, `app/Http/Requests/StoreEmployeeRequest.php`, `app/Http/Controllers/Api/EmployeeController.php`
- Test: `tests/Feature/EmployeeApiTest.php`

- [ ] **Step 1: Write the failing tests** — append to `tests/Feature/EmployeeApiTest.php` (it already has a `super()` helper and imports `App\Models\Employee`, `App\Models\User`)

```php
public function test_section_in_the_same_department_is_accepted(): void
{
    $this->actingAs($this->super());
    $dept = \App\Models\Department::create(['name' => 'IT']);
    $section = \App\Models\Section::create(['department_id' => $dept->id, 'name' => 'Network']);
    $e = Employee::create(['name' => 'A', 'department_id' => $dept->id]);

    $this->putJson("/api/employees/{$e->id}", ['name' => 'A', 'department_id' => $dept->id, 'section_id' => $section->id])
        ->assertOk();
    $this->assertSame($section->id, $e->fresh()->section_id);
}

public function test_section_from_a_different_department_is_rejected(): void
{
    $this->actingAs($this->super());
    $it = \App\Models\Department::create(['name' => 'IT']);
    $hr = \App\Models\Department::create(['name' => 'HR']);
    $hrSection = \App\Models\Section::create(['department_id' => $hr->id, 'name' => 'Payroll']);
    $e = Employee::create(['name' => 'A', 'department_id' => $it->id]);

    $this->putJson("/api/employees/{$e->id}", ['name' => 'A', 'department_id' => $it->id, 'section_id' => $hrSection->id])
        ->assertStatus(422)
        ->assertJsonValidationErrors('section_id');
}

public function test_null_section_is_allowed(): void
{
    $this->actingAs($this->super());
    $dept = \App\Models\Department::create(['name' => 'IT']);
    $e = Employee::create(['name' => 'A', 'department_id' => $dept->id]);

    $this->putJson("/api/employees/{$e->id}", ['name' => 'A', 'department_id' => $dept->id, 'section_id' => null])
        ->assertOk();
}
```

- [ ] **Step 2: Run to verify failure**

Run: `php artisan test --compact --filter=EmployeeApiTest`
Expected: the new tests FAIL (section not persisted / no validation).

- [ ] **Step 3: Add the `section_id` rule + cross-field check to `StoreEmployeeRequest`** — add to the `rules()` array (after `department_id`):

```php
'section_id' => ['nullable', 'exists:sections,id'],
```

Extend the existing `withValidator()` — inside the `$validator->after(function (Validator $v) { ... })` closure, add this BEFORE the manager checks (uses the submitted `department_id`):

```php
$sectionId = $this->input('section_id');
if (filled($sectionId)) {
    $section = \App\Models\Section::find($sectionId);
    if ($section && (int) $section->department_id !== (int) $this->input('department_id')) {
        $v->errors()->add('section_id', 'The selected section is not in the chosen department.');
    }
}
```

- [ ] **Step 4: Expose section in `EmployeeResource`** — add after the `department_th` line:

```php
'section_id' => $this->section_id,
'section' => $this->whenLoaded('section', fn () => $this->section?->name),
'section_th' => $this->whenLoaded('section', fn () => $this->section?->name_th),
```

- [ ] **Step 5: Eager-load `section`** in `EmployeeController` — add `'section'` to the `with([...])` arrays in `index()` (line ~53) and the `recent` query (line ~110), and to `show()`'s `$employee->load([...])` (line ~224), and to `update()`/`store()` return so the response carries it. The simplest robust spot: change `show` to `$employee->load(['department', 'position', 'section'])`, and in `index`/`recent` add `'section'` to the `with([...])` list. For `store`/`update`, change the return to `(new EmployeeResource($employee->load(['department', 'position', 'section'])))`.

- [ ] **Step 6: Run tests**

Run: `php artisan test --compact --filter=EmployeeApiTest`
Expected: all PASS.

- [ ] **Step 7: Pint + commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Resources/EmployeeResource.php app/Http/Requests/StoreEmployeeRequest.php app/Http/Controllers/Api/EmployeeController.php tests/Feature/EmployeeApiTest.php
git commit -m "feat(org): assign employees to a section (validated against their department)"
```

---

## Task 4: Frontend types

**Files:**
- Modify: `resources/js/types/index.ts`

- [ ] **Step 1: Add the `Section` interface** (after the `Department` interface)

```ts
export interface Section {
    id: number;
    department_id: number;
    name: string;
    name_th: string | null;
    department?: string;
    members_count?: number;
}
```

- [ ] **Step 2: Add section fields to the `Employee` interface** (after `department_th`)

```ts
    section_id: number | null;
    section: string | null;
    section_th?: string | null;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add resources/js/types/index.ts
git commit -m "feat(org): section frontend types"
```

---

## Task 5: API service + query hooks

**Files:**
- Modify: `resources/js/services/orgApi.ts`, `resources/js/hooks/use-org.ts`

- [ ] **Step 1: Add `Section` to the type import** on line 1 of `orgApi.ts` (keep the existing names, add `Section`)

```ts
import type { ApiEnvelope, ApproverNode, Department, Employee, LocationItem, OrgChartNode, Position, Section } from '@/types';
```

- [ ] **Step 2: Add `section_id` to `EmployeePayload`** in `orgApi.ts` (after `position_id`)

```ts
    section_id?: number | null;
```

- [ ] **Step 3: Add `sectionApi`** in `orgApi.ts` (after the `departmentApi` export)

```ts
export const sectionApi = {
    list: (departmentId?: number | null) =>
        http
            .get<ApiEnvelope<Section[]>>('/sections', { params: departmentId ? { department_id: departmentId } : {} })
            .then((r) => r.data.data),
    create: (payload: { department_id: number; name: string; name_th?: string | null }) => mutate<Section>('post', '/sections', payload),
    update: (id: number, payload: { department_id: number; name: string; name_th?: string | null }) => mutate<Section>('put', `/sections/${id}`, payload),
    remove: (id: number) => mutate<void>('delete', `/sections/${id}`),
};
```

- [ ] **Step 4: Add hooks** in `resources/js/hooks/use-org.ts`. Add `sectionApi` to the import from `@/services/orgApi`, then:

```ts
export function useSections(departmentId?: number | null) {
    return useQuery({
        queryKey: ['sections', departmentId ?? 'all'],
        queryFn: () => sectionApi.list(departmentId),
    });
}

export function useSectionMutations() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['sections'] });
        qc.invalidateQueries({ queryKey: EMP });
        qc.invalidateQueries({ queryKey: ['employees-directory'] });
    };
    return {
        create: useMutation({ mutationFn: (p: { department_id: number; name: string; name_th?: string | null }) => sectionApi.create(p), onSuccess: invalidate }),
        update: useMutation({ mutationFn: (v: { id: number; payload: { department_id: number; name: string; name_th?: string | null } }) => sectionApi.update(v.id, v.payload), onSuccess: invalidate }),
        remove: useMutation({ mutationFn: (id: number) => sectionApi.remove(id), onSuccess: invalidate }),
    };
}
```

(`EMP`, `useQuery`, `useMutation`, `useQueryClient` are already defined/imported in this file — reuse them.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add resources/js/services/orgApi.ts resources/js/hooks/use-org.ts
git commit -m "feat(org): section api service + query hooks"
```

---

## Task 6: Section modal (create/edit)

**Files:**
- Create: `resources/js/components/employees/section-modal.tsx`

- [ ] **Step 1: Create the modal** (mirrors `department-modal.tsx`, plus a Department picker)

```tsx
import { Field } from '@/components/shared/field';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDepartments, useSectionMutations } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Section } from '@/types';
import { useEffect, useMemo, useState } from 'react';

const empty = { department_id: '', name: '', name_th: '' };

export function SectionModal({ open, onClose, section }: { open: boolean; onClose: () => void; section: Section | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data: departments = [] } = useDepartments();
    const { create, update } = useSectionMutations();
    const [form, setForm] = useState(empty);

    useEffect(() => {
        if (open)
            setForm(
                section
                    ? { department_id: String(section.department_id), name: section.name, name_th: section.name_th ?? '' }
                    : empty,
            );
    }, [open, section]);

    const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const deptOptions = useMemo(
        () =>
            departments.map((d) => ({
                value: String(d.id),
                label: lang === 'th' ? (d.name_th ?? d.name) : d.name,
                sub: d.code,
                search: `${d.name} ${d.name_th ?? ''} ${d.code}`,
            })),
        [departments, lang],
    );

    const submit = async () => {
        if (!form.department_id || !form.name.trim()) return;
        const payload = { department_id: Number(form.department_id), name: form.name.trim(), name_th: form.name_th.trim() || null };
        if (section) await update.mutateAsync({ id: section.id, payload });
        else await create.mutateAsync(payload);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{section ? t('edit_section') : t('add_section')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <Field label={t('department')}>
                        <SearchableSelect value={form.department_id} onChange={(v) => set('department_id', v)} options={deptOptions} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('section_name_en')}>
                            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="Network" />
                        </Field>
                        <Field label={t('section_name_th')}>
                            <Input value={form.name_th} onChange={(e) => set('name_th', e.target.value)} placeholder="เครือข่าย" />
                        </Field>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={!form.department_id || !form.name.trim() || create.isPending || update.isPending}>
                        {t('save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint resources/js/components/employees/section-modal.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/employees/section-modal.tsx
git commit -m "feat(org): section create/edit modal"
```

---

## Task 7: Sections tab

**Files:**
- Create: `resources/js/components/employees/sections-tab.tsx`

- [ ] **Step 1: Create the tab** (a table of all sections with department, members, edit/delete — uses the shared `DataTable` like the Positions tab)

```tsx
import { SectionModal } from '@/components/employees/section-modal';
import { Column, DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { useSectionMutations, useSections } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Section } from '@/types';
import { Plus, SquarePen, Trash2 } from 'lucide-react';
import { useState } from 'react';

export function SectionsTab({ canManage }: { canManage: boolean }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data: sections = [] } = useSections();
    const mut = useSectionMutations();
    const [editSection, setEditSection] = useState<Section | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    const columns: Column<Section>[] = [
        { key: 'department', header: t('department'), render: (s) => <span className="text-muted-foreground">{s.department ?? '—'}</span> },
        { key: 'name', header: t('section'), render: (s) => <span className="font-medium">{lang === 'th' ? (s.name_th ?? s.name) : s.name}</span> },
        { key: 'members', header: t('section_members'), align: 'right', render: (s) => <span className="font-mono text-xs">{s.members_count ?? 0}</span> },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (s) =>
                canManage ? (
                    <div className="flex justify-end gap-1">
                        <button
                            onClick={() => {
                                setEditSection(s);
                                setModalOpen(true);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                        >
                            <SquarePen className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => {
                                if (confirm(`${t('confirm_delete')} ${s.name}`)) mut.remove.mutate(s.id);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
    ];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{t('section_all_org')}</span>
                {canManage && (
                    <Button
                        onClick={() => {
                            setEditSection(null);
                            setModalOpen(true);
                        }}
                    >
                        <Plus className="h-4 w-4" />
                        {t('add_section')}
                    </Button>
                )}
            </div>
            {sections.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">{t('section_empty')}</div>
            ) : (
                <DataTable columns={columns} rows={sections} rowKey={(s) => s.id} />
            )}
            <SectionModal open={modalOpen} onClose={() => setModalOpen(false)} section={editSection} />
        </div>
    );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint resources/js/components/employees/sections-tab.tsx`
Expected: clean. If `Column`/`DataTable` props differ, open `resources/js/components/shared/data-table.tsx` and match the actual API (the Positions tab in `pages/employees/index.tsx` is a working reference for `Column`/`DataTable` usage).

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/employees/sections-tab.tsx
git commit -m "feat(org): sections management tab"
```

---

## Task 8: Wire the Sections tab + i18n

**Files:**
- Modify: `resources/js/pages/employees/index.tsx`, `resources/js/lib/i18n.ts`

- [ ] **Step 1: Add i18n keys** in `resources/js/lib/i18n.ts` — in BOTH the `en` and `th` maps (near the other `sub_*` keys).

English:
```ts
    sub_sections: 'Sections',
    section: 'Section',
    add_section: 'Add section',
    edit_section: 'Edit section',
    section_all_org: 'All sections across the organization',
    section_name_en: 'Section name (EN)',
    section_name_th: 'Section name (TH)',
    section_members: 'Members',
    section_empty: 'No sections yet',
    emp_section: 'Section',
```
Thai:
```ts
    sub_sections: 'หน่วยงาน',
    section: 'หน่วยงาน',
    add_section: 'เพิ่มหน่วยงาน',
    edit_section: 'แก้ไขหน่วยงาน',
    section_all_org: 'หน่วยงานทั้งหมดในองค์กร',
    section_name_en: 'ชื่อหน่วยงาน (EN)',
    section_name_th: 'ชื่อหน่วยงาน (TH)',
    section_members: 'สมาชิก',
    section_empty: 'ยังไม่มีหน่วยงาน',
    emp_section: 'หน่วยงาน',
```

- [ ] **Step 2: Import `SectionsTab`** in `pages/employees/index.tsx` (next to the other employee-component imports)

```tsx
import { SectionsTab } from '@/components/employees/sections-tab';
```

- [ ] **Step 3: Add `'sections'` to `TAB_IDS`** (line ~34). It is currently:
```ts
const TAB_IDS = ['dashboard', 'directory', 'positions', 'departments', 'orgchart'] as const;
```
Change to:
```ts
const TAB_IDS = ['dashboard', 'directory', 'positions', 'departments', 'sections', 'orgchart'] as const;
```
(`type Tab = (typeof TAB_IDS)[number]` updates automatically — no separate union to edit.)

- [ ] **Step 4: Add the tab entry** to the `tabs` array (after the `positions` entry)

```tsx
        { id: 'sections', label: t('sub_sections') },
```

- [ ] **Step 5: Render the tab** — next to the other `{tab === '…' && (…)}` blocks (after the positions block)

```tsx
            {tab === 'sections' && <SectionsTab canManage={canManageOrg} />}
```

- [ ] **Step 6: Typecheck, lint, build**

Run: `npx tsc --noEmit && npx eslint resources/js/pages/employees/index.tsx resources/js/lib/i18n.ts && npm run build`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add resources/js/pages/employees/index.tsx resources/js/lib/i18n.ts
git commit -m "feat(org): add Sections tab to the Employees page"
```

---

## Task 9: Cascading section on the employee form + view display

**Files:**
- Modify: `resources/js/components/employees/add-employee-drawer.tsx`, `resources/js/components/employees/employee-view-drawer.tsx`

- [ ] **Step 1: Add `sectionId` to the form state** in `add-employee-drawer.tsx`. The `empty` object (line ~31) has `departmentId: ''` etc. — add:
```ts
    sectionId: '',
```

- [ ] **Step 2: Seed it when editing** — in the `setForm({ ... })` block (line ~73-89, where `departmentId` is seeded from `employee.department_id`), add:
```ts
                sectionId: employee.section_id ? String(employee.section_id) : '',
```

- [ ] **Step 3: Load this department's sections + a department-change handler.** Near the existing `const { data: departments = [] } = useDepartments();` (line ~50) add:
```ts
    const { data: sections = [] } = useSections(form.departmentId ? Number(form.departmentId) : null);
```
Add `useSections` to the import from `@/hooks/use-org` (line ~9). Add a handler that resets the section when the department changes (place after `set` is defined, ~line 96):
```ts
    const setDepartment = (v: string) => setForm((f) => ({ ...f, departmentId: v, sectionId: '' }));
```

- [ ] **Step 4: Wire the Department field to `setDepartment`** — find the Department `SearchableSelect` in the JSX (it uses `set('departmentId', …)`) and change its `onChange` to `setDepartment`. Then add a Section field immediately AFTER the Department field:
```tsx
                <Field label={t('emp_section')}>
                    <SearchableSelect
                        value={form.sectionId}
                        onChange={(v) => set('sectionId', v)}
                        options={sections.map((s) => ({
                            value: String(s.id),
                            label: lang === 'th' ? (s.name_th ?? s.name) : s.name,
                            search: `${s.name} ${s.name_th ?? ''}`,
                        }))}
                        placeholder={form.departmentId ? undefined : t('emp_section')}
                    />
                </Field>
```
(`lang` is already read in this component via `useUiStore`; if not, read it: `const lang = useUiStore((s) => s.lang);`. Confirm before adding a duplicate.)

- [ ] **Step 5: Include `section_id` in the submit payload** — in the `payload` object (line ~136-148, where `department_id` is set):
```ts
            section_id: form.sectionId ? Number(form.sectionId) : null,
```

- [ ] **Step 6: Show the section in the view drawer** — in `employee-view-drawer.tsx`, after the department `Row` (line ~100):
```tsx
                                <Row label={t('emp_section')} value={lang === 'th' ? (employee.section_th ?? employee.section) : employee.section} />
```
(`lang` and `Row` are already used in this file just above.)

- [ ] **Step 7: Typecheck, lint, build**

Run: `npx tsc --noEmit && npx eslint resources/js/components/employees/add-employee-drawer.tsx resources/js/components/employees/employee-view-drawer.tsx && npm run build`
Expected: clean. If a field/prop name differs from the snippets, read the file and adapt to the existing pattern (don't restructure the form).

- [ ] **Step 8: Commit**

```bash
git add resources/js/components/employees/add-employee-drawer.tsx resources/js/components/employees/employee-view-drawer.tsx
git commit -m "feat(org): cascading section picker on the employee form + view"
```

---

## Task 10: Full verification + README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Backend tests**

Run: `php artisan test --compact --filter=SectionApiTest && php artisan test --compact --filter=EmployeeApiTest`
Expected: all PASS.

- [ ] **Step 2: Frontend gate**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build.

- [ ] **Step 3: Manual smoke**

`composer run dev` (or `php artisan serve` + `npm run dev`). Open Employees → **หน่วยงาน (Sections)** tab → add a section under a department. Then Add/Edit an employee → pick a department → confirm the Section dropdown lists only that department's sections; save; open the employee → the section shows.

- [ ] **Step 4: Update README** — add a short section after the "Org Chart" section (mirror its style):

```markdown
## Sections (หน่วยงาน) — ชั้นหน่วยงานระหว่างแผนก↔พนักงาน

> spec: `docs/superpowers/specs/2026-06-09-employee-sections-design.md` · plan: `docs/superpowers/plans/2026-06-09-employee-sections.md`

- โครงสร้าง: **แผนก → หน่วยงาน (Section) → พนักงาน** · `sections` (department_id FK, ลบแผนก = ลบ section ตาม) · `employees.section_id` (nullable, ลบ section = null)
- section ที่เลือกให้พนักงานต้องอยู่ใน**แผนกเดียวกัน** (ตรวจที่ `StoreEmployeeRequest`)
- แท็บ **"หน่วยงาน"** ในหน้า Employees: ตารางหน่วยงาน (แผนก/ชื่อ/จำนวนสมาชิก) เพิ่ม/แก้/ลบ · ฟอร์มพนักงานเลือกแผนก→หน่วยงานแบบ cascading
- Backend: `sections` API (`SectionController`/`SectionResource`/`StoreSectionRequest`) · Frontend: `sections-tab`, `section-modal`, `useSections`/`useSectionMutations`
- **ผังองค์กรยังไม่แตะ** (section เป็นข้อมูล HR แยกจาก manager tree — รวมเข้าผังเป็นเฟสถัดไป)
- **ตรวจสอบ**: `SectionApiTest` + `EmployeeApiTest` ผ่าน · `tsc` ✅ · `npm run build` ✅
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(org): document the Sections (หน่วยงาน) feature"
```

---

## Self-review notes

- **Spec coverage:** sections table + `section_id` (Task 1) ✓; section CRUD API (Task 2) ✓; employee section + same-department validation (Task 3) ✓; Sections tab (Tasks 7–8) ✓; cascading picker on the form (Task 9) ✓; section shown in view (Task 9) ✓; `?tab=sections` persistence (Task 8 via TAB_IDS) ✓; org chart untouched ✓.
- **Type consistency:** `Section` shape identical across `SectionResource` (Task 2), TS type (Task 4), `sectionApi`/hooks (Task 5), modal/tab (Tasks 6–7). `employees.section_id` / `section` / `section_th` consistent across resource (Task 3) and TS type (Task 4) and view (Task 9).
- **Known adapt points (read the file, match the pattern, fix inline):** `DataTable`/`Column` API (Task 7 Step 2); the exact Department `SearchableSelect` onChange + `lang` presence in `add-employee-drawer` (Task 9 Steps 4/6); the precise line numbers shift as you edit — search by content, not line number.
