# Org Demo Data + Manager-Walk Approval Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the approval chain a pure `manager_id` walk to the root (drop the position-level ceiling and its setting), widen position levels to 14 (display only), and rebuild the demo seed data to 11 departments / 26 sections / 14 positions / ~30 employees in one VP-topped tree.

**Architecture:** `ApprovalChainService` climbs `manager_id` to the root with a cycle guard. The `approval_ceiling_level` setting + its Settings UI/endpoints are deleted. `positions.level` stays as a 1–14 display attribute. `OrgSeeder` is rewritten as the single source of the demo org; `ApprovalChainDemoSeeder` is removed.

**Tech Stack:** Laravel 12 / PHPUnit; React 19 + TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-10-org-demo-data-14-levels-design.md`

## Testing convention
- Backend PHPUnit, TDD. `php artisan test --compact --filter=...`. Tests use direct `Model::create()` (project convention). Pint before committing PHP.
- Frontend: `npx tsc --noEmit`, `npx eslint`, `npm run build` (no JS test runner).

## File structure
- `app/Services/ApprovalChainService.php` — simplify chainFor, delete ceilingLevel.
- `app/Http/Controllers/Api/SettingsController.php` — delete approval()/updateApproval()/approvalPayload().
- `routes/api.php` — delete the two `settings/approval` routes.
- `tests/Feature/ApprovalChainTest.php` — rewrite ceiling tests.
- `resources/js/services/settingsApi.ts` + `resources/js/pages/settings/index.tsx` + `resources/js/lib/i18n.ts` — remove the approval-ceiling card.
- `app/Http/Requests/StorePositionRequest.php` + `resources/js/components/employees/position-modal.tsx` — level cap 14.
- `database/seeders/OrgSeeder.php` — full rewrite.
- `database/seeders/ApprovalChainDemoSeeder.php` (delete) + `database/seeders/DatabaseSeeder.php` (drop the call).
- `README.md` — update the Org Approval Chain section.

---

## Task 1: Approval chain = manager walk to root (+ remove ceiling backend)

**Files:** `app/Services/ApprovalChainService.php`, `app/Http/Controllers/Api/SettingsController.php`, `routes/api.php`, `tests/Feature/ApprovalChainTest.php`

- [ ] **Step 1: Rewrite the chain tests.** Open `tests/Feature/ApprovalChainTest.php`. DELETE these methods entirely: `test_chain_climbs_managers_and_stops_at_the_ceiling`, `test_manager_without_level_does_not_stop_the_climb`, `test_updates_approval_ceiling_level`, `test_approval_ceiling_requires_permission`. In `test_chain_terminates_on_a_cycle` and `test_endpoint_returns_the_chain_ordered`, DELETE any `AppSetting::put('approval_ceiling_level', ...)` line. Then ADD this test (chain climbs through every manager to the root, regardless of level):

```php
public function test_chain_climbs_every_manager_to_the_root(): void
{
    // staff -> leader -> supervisor -> manager -> VP (no levels needed)
    $vp = Employee::create(['name' => 'VP']);
    $mgr = Employee::create(['name' => 'Manager', 'manager_id' => $vp->id]);
    $sup = Employee::create(['name' => 'Supervisor', 'manager_id' => $mgr->id]);
    $leader = Employee::create(['name' => 'Leader', 'manager_id' => $sup->id]);
    $staff = Employee::create(['name' => 'Staff', 'manager_id' => $leader->id]);

    $chain = app(\App\Services\ApprovalChainService::class)->chainFor($staff);

    $this->assertSame(['Leader', 'Supervisor', 'Manager', 'VP'], $chain->pluck('name')->all());
}
```

Also confirm `test_chain_terminates_on_a_cycle` still expects the pre-cycle managers only (it should now read: the walk collects managers until the repeated id, then stops). If its assertion referenced ceiling behaviour, simplify it to: A reports to B, B reports to A → `chainFor(A)` returns `['B']` (then A repeats → stop).

- [ ] **Step 2: Run to verify failure**

Run: `php artisan test --compact --filter=ApprovalChainTest`
Expected: failures (ceiling routes/methods gone references, new climb test fails until service is simplified).

- [ ] **Step 3: Simplify `ApprovalChainService`** — replace the whole file with:

```php
<?php

namespace App\Services;

use App\Models\Employee;
use Illuminate\Support\Collection;

class ApprovalChainService
{
    /**
     * The employee's approval chain: climb the manager_id reporting tree from the
     * employee up to the root, collecting each manager in order (direct manager
     * first). Stops at the top of the tree or on a detected cycle. Position level
     * is irrelevant — whoever the actual manager is, is the next link.
     *
     * @return Collection<int, Employee>
     */
    public function chainFor(Employee $employee): Collection
    {
        $chain = collect();
        $seen = [$employee->id];
        $current = $employee;

        while (true) {
            $manager = $current->manager()->with(['position', 'department'])->first();
            if ($manager === null || in_array($manager->id, $seen, true)) {
                break;
            }

            $chain->push($manager);
            $seen[] = $manager->id;
            $current = $manager;
        }

        return $chain;
    }
}
```

- [ ] **Step 4: Remove the approval endpoints from `SettingsController`** — delete the `approval()`, `updateApproval()`, and `approvalPayload()` methods (the block from `/** Approval policy ... */` through the end of `approvalPayload()`). After deleting, check whether the `Position` import (`use App\Models\Position;`) is still used elsewhere in the file; if not, remove that import too (run `grep -n "Position" app/Http/Controllers/Api/SettingsController.php`).

- [ ] **Step 5: Remove the routes** in `routes/api.php` — delete both lines:
```php
Route::get('settings/approval', [SettingsController::class, 'approval'])->name('api.settings.approval');
Route::put('settings/approval', [SettingsController::class, 'updateApproval'])
    ->middleware('permission:settings.masterdata')->name('api.settings.approval.update');
```

- [ ] **Step 6: Run tests**

Run: `php artisan test --compact --filter=ApprovalChainTest`
Expected: all PASS.

- [ ] **Step 7: Pint + commit**
```bash
vendor/bin/pint --dirty --format agent
git add app/Services/ApprovalChainService.php app/Http/Controllers/Api/SettingsController.php routes/api.php tests/Feature/ApprovalChainTest.php
git commit -m "feat(org): approval chain climbs managers to the root; remove level ceiling"
```

---

## Task 2: Remove the approval-ceiling card (frontend)

**Files:** `resources/js/pages/settings/index.tsx`, `resources/js/services/settingsApi.ts`, `resources/js/lib/i18n.ts`

- [ ] **Step 1: Remove from `settings/index.tsx`** — delete the `<ApprovalCard />` usage (around line 382), the entire `ApprovalCard` function component (the `function ApprovalCard() { ... }` block) and its `const APPROVAL_KEY = ['approval-settings'] as const;`. In the import on line ~51, remove `type ApprovalSettings` from the `@/services/settingsApi` import list.

- [ ] **Step 2: Remove from `settingsApi.ts`** — delete the `ApprovalSettings` interface (the `// Approval policy ...` comment + `export interface ApprovalSettings { approval_ceiling_level: number; }`) and the `getApproval` and `updateApproval` methods from the `settingsApi` object.

- [ ] **Step 3: Remove i18n keys** — in `resources/js/lib/i18n.ts`, delete these keys from BOTH the en and th maps: `set_approval`, `set_approval_ceiling`, `set_approval_ceiling_help`.

- [ ] **Step 4: Verify**
```
npx tsc --noEmit
npx eslint resources/js/pages/settings/index.tsx resources/js/services/settingsApi.ts resources/js/lib/i18n.ts
npm run build
```
Expected: clean (no unused-import or missing-key errors).

- [ ] **Step 5: Commit**
```bash
git add resources/js/pages/settings/index.tsx resources/js/services/settingsApi.ts resources/js/lib/i18n.ts
git commit -m "feat(org): remove the approval-ceiling settings card"
```

---

## Task 3: Position level cap 10 → 14

**Files:** `app/Http/Requests/StorePositionRequest.php`, `resources/js/components/employees/position-modal.tsx`, `tests/Feature/ApprovalChainTest.php`

- [ ] **Step 1: Write the failing test** — APPEND to `tests/Feature/ApprovalChainTest.php` (it has the `super()` helper + imports):

```php
public function test_position_level_accepts_14_and_rejects_15(): void
{
    $this->actingAs($this->super());

    $this->postJson('/api/positions', ['title' => 'Vice President', 'level' => 14])
        ->assertStatus(201);

    $this->postJson('/api/positions', ['title' => 'Too High', 'level' => 15])
        ->assertStatus(422)
        ->assertJsonValidationErrors('level');
}
```

- [ ] **Step 2: Run to verify failure**

Run: `php artisan test --compact --filter=test_position_level_accepts_14`
Expected: FAIL (15 currently allowed only up to... actually max:10 means 14 is rejected → the 201 assertion fails).

- [ ] **Step 3: Raise the backend cap** in `app/Http/Requests/StorePositionRequest.php`:
```php
'level' => ['nullable', 'integer', 'min:1', 'max:14'],
```

- [ ] **Step 4: Raise the picker** in `resources/js/components/employees/position-modal.tsx` — change the level button generator:
```tsx
{Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
```

- [ ] **Step 5: Run test + frontend gate**
```
php artisan test --compact --filter=test_position_level_accepts_14
npx tsc --noEmit && npm run build
```
Expected: PASS / clean.

- [ ] **Step 6: Pint + commit**
```bash
vendor/bin/pint --dirty --format agent
git add app/Http/Requests/StorePositionRequest.php resources/js/components/employees/position-modal.tsx tests/Feature/ApprovalChainTest.php
git commit -m "feat(org): widen position level cap to 14"
```

---

## Task 4: Rewrite OrgSeeder (11 depts / 26 sections / 14 positions / ~30 employees)

**Files:** `database/seeders/OrgSeeder.php` (rewrite), `database/seeders/ApprovalChainDemoSeeder.php` (delete), `database/seeders/DatabaseSeeder.php` (drop the call)

- [ ] **Step 1: Delete `ApprovalChainDemoSeeder` and its call.** Remove the file `database/seeders/ApprovalChainDemoSeeder.php`. In `database/seeders/DatabaseSeeder.php`, delete the line `$this->call(ApprovalChainDemoSeeder::class);`.

- [ ] **Step 2: Replace `database/seeders/OrgSeeder.php` entirely** with:

```php
<?php

namespace Database\Seeders;

use App\Models\AppSetting;
use App\Models\Department;
use App\Models\Employee;
use App\Models\GroupRole;
use App\Models\Location;
use App\Models\Position;
use App\Models\Section;
use App\Models\User;
use Illuminate\Database\Seeder;

class OrgSeeder extends Seeder
{
    public function run(): void
    {
        // ── Departments (tag => name / name_th) ──────────────────────────────
        $departments = [
            ['tag' => 'Mn', 'name' => 'Maintenance', 'name_th' => 'ฝ่ายซ่อมบำรุง'],
            ['tag' => 'Lg', 'name' => 'Logistic', 'name_th' => 'ฝ่ายโลจิสติกส์'],
            ['tag' => 'It', 'name' => 'Information Technology', 'name_th' => 'ฝ่ายเทคโนโลยีสารสนเทศ'],
            ['tag' => 'Sales', 'name' => 'Sales', 'name_th' => 'ฝ่ายขาย'],
            ['tag' => 'Acc', 'name' => 'Accounting', 'name_th' => 'ฝ่ายบัญชี'],
            ['tag' => 'PD', 'name' => 'Production', 'name_th' => 'ฝ่ายผลิต'],
            ['tag' => 'SE', 'name' => 'Safety', 'name_th' => 'ฝ่ายความปลอดภัย'],
            ['tag' => 'GA', 'name' => 'General Affairs', 'name_th' => 'ฝ่ายธุรการ'],
            ['tag' => 'HR', 'name' => 'Human Resources', 'name_th' => 'ฝ่ายทรัพยากรบุคคล'],
            ['tag' => 'QC', 'name' => 'Quality Control', 'name_th' => 'ฝ่ายควบคุมคุณภาพ'],
            ['tag' => 'PU', 'name' => 'Purchasing', 'name_th' => 'ฝ่ายจัดซื้อ'],
        ];
        foreach ($departments as $d) {
            Department::updateOrCreate(['tag' => $d['tag']], $d);
        }
        $deptId = Department::pluck('id', 'tag');

        // ── Positions (code => [level, title]) — 1 smallest .. 14 largest ────
        $positions = [
            'P-01' => [1, 'Subcontract'],
            'P-02' => [2, 'Staff/Officer'],
            'P-03' => [3, 'Head of Shift'],
            'P-04' => [4, 'Head of Line'],
            'P-05' => [5, 'Sub-Leader'],
            'P-06' => [6, 'Leader'],
            'P-07' => [7, 'Asst. Supervisor'],
            'P-08' => [8, 'Supervisor'],
            'P-09' => [9, 'Senior Supervisor'],
            'P-10' => [10, 'Asst. Manager'],
            'P-11' => [11, 'Manager'],
            'P-12' => [12, 'Senior Manager'],
            'P-13' => [13, 'Director'],
            'P-14' => [14, 'Vice President'],
        ];
        foreach ($positions as $code => [$level, $title]) {
            Position::updateOrCreate(['code' => $code], ['title' => $title, 'level' => $level]);
        }
        $posId = Position::pluck('id', 'title');

        // ── Sections (department tag => [names]) ─────────────────────────────
        $sections = [
            'It' => ['Network & Security', 'Support', 'System analyst'],
            'QC' => ['Quality Control', 'Quality Assurance', 'Research and Development'],
            'PD' => ['Machine Operation', 'Retrot', 'Packing', 'Filling', 'Raw material', 'Stock', 'Loading', 'Warehouse', 'Forklift'],
            'PU' => ['Purchasing'],
            'HR' => ['Payroll', 'Recruitment', 'Training'],
            'GA' => ['General Affairs'],
            'Acc' => ['Accounting'],
            'Sales' => ['Sales'],
            'Lg' => ['Logistic'],
            'Mn' => ['Maintenance'],
            'SE' => ['Environment', 'Occupational Safety & Health'],
        ];
        $sectionId = []; // "tag::name" => id
        foreach ($sections as $tag => $names) {
            foreach ($names as $name) {
                $section = Section::updateOrCreate(
                    ['department_id' => $deptId[$tag], 'name' => $name],
                    ['name_th' => null],
                );
                $sectionId["{$tag}::{$name}"] = $section->id;
            }
        }

        // ── Locations (unchanged generic demo set) ───────────────────────────
        foreach (['HQ — Floor 3', 'HQ — Floor 5', 'Plant 1', 'Plant 1 — QA Lab', 'Warehouse', 'Datacenter'] as $name) {
            Location::firstOrCreate(['name' => $name]);
        }

        // ── Employees: one VP-topped tree. dept/section null for VP & Corporate
        //    Director. 'mgr' = the code this person reports to (null = top). ────
        $employees = [
            // PD full ladder L14 -> L1
            ['code' => 'EMP-0001', 'name' => 'Somchai Wattana', 'name_th' => 'สมชาย วัฒนา', 'dept' => null, 'section' => null, 'pos' => 'Vice President', 'mgr' => null],
            ['code' => 'EMP-0002', 'name' => 'Prasert Mongkol', 'name_th' => 'ประเสริฐ มงคล', 'dept' => 'PD', 'section' => 'Machine Operation', 'pos' => 'Director', 'mgr' => 'EMP-0001'],
            ['code' => 'EMP-0003', 'name' => 'Anan Srisuk', 'name_th' => 'อนันต์ ศรีสุข', 'dept' => 'PD', 'section' => 'Machine Operation', 'pos' => 'Senior Manager', 'mgr' => 'EMP-0002'],
            ['code' => 'EMP-0004', 'name' => 'Wirat Chaiyo', 'name_th' => 'วิรัช ชัยโย', 'dept' => 'PD', 'section' => 'Machine Operation', 'pos' => 'Manager', 'mgr' => 'EMP-0003'],
            ['code' => 'EMP-0005', 'name' => 'Kasem Boonma', 'name_th' => 'เกษม บุญมา', 'dept' => 'PD', 'section' => 'Packing', 'pos' => 'Asst. Manager', 'mgr' => 'EMP-0004'],
            ['code' => 'EMP-0006', 'name' => 'Narong Dee', 'name_th' => 'ณรงค์ ดี', 'dept' => 'PD', 'section' => 'Packing', 'pos' => 'Senior Supervisor', 'mgr' => 'EMP-0005'],
            ['code' => 'EMP-0007', 'name' => 'Suchart Pimpa', 'name_th' => 'สุชาติ พิมพา', 'dept' => 'PD', 'section' => 'Filling', 'pos' => 'Supervisor', 'mgr' => 'EMP-0006'],
            ['code' => 'EMP-0008', 'name' => 'Adisak Rung', 'name_th' => 'อดิศักดิ์ รุ่ง', 'dept' => 'PD', 'section' => 'Filling', 'pos' => 'Asst. Supervisor', 'mgr' => 'EMP-0007'],
            ['code' => 'EMP-0009', 'name' => 'Manop Klin', 'name_th' => 'มานพ กลิ่น', 'dept' => 'PD', 'section' => 'Retrot', 'pos' => 'Leader', 'mgr' => 'EMP-0008'],
            ['code' => 'EMP-0010', 'name' => 'Decha Pol', 'name_th' => 'เดชา พล', 'dept' => 'PD', 'section' => 'Retrot', 'pos' => 'Sub-Leader', 'mgr' => 'EMP-0009'],
            ['code' => 'EMP-0011', 'name' => 'Chai Thong', 'name_th' => 'ชัย ทอง', 'dept' => 'PD', 'section' => 'Raw material', 'pos' => 'Head of Line', 'mgr' => 'EMP-0010'],
            ['code' => 'EMP-0012', 'name' => 'Wichai Saito', 'name_th' => 'วิชัย สายโต', 'dept' => 'PD', 'section' => 'Stock', 'pos' => 'Head of Shift', 'mgr' => 'EMP-0011'],
            ['code' => 'EMP-0013', 'name' => 'Nattapong Inta', 'name_th' => 'ณัฐพงษ์ อินตา', 'dept' => 'PD', 'section' => 'Loading', 'pos' => 'Staff/Officer', 'mgr' => 'EMP-0012'],
            ['code' => 'EMP-0014', 'name' => 'Somkid Jan', 'name_th' => 'สมคิด จันทร์', 'dept' => 'PD', 'section' => 'Warehouse', 'pos' => 'Subcontract', 'mgr' => 'EMP-0013'],
            // Corporate Director + one manager per remaining department
            ['code' => 'EMP-0015', 'name' => 'Wanchai Rung', 'name_th' => 'วันชัย รุ่งเรือง', 'dept' => null, 'section' => null, 'pos' => 'Director', 'mgr' => 'EMP-0001'],
            ['code' => 'EMP-0016', 'name' => 'Krit Saengthong', 'name_th' => 'กฤต แสงทอง', 'dept' => 'It', 'section' => 'Network & Security', 'pos' => 'Manager', 'mgr' => 'EMP-0015'],
            ['code' => 'EMP-0017', 'name' => 'Suwanna Pongrat', 'name_th' => 'สุวรรณา พงศ์รัตน์', 'dept' => 'QC', 'section' => 'Quality Control', 'pos' => 'Manager', 'mgr' => 'EMP-0015'],
            ['code' => 'EMP-0018', 'name' => 'Siriporn Chaiyo', 'name_th' => 'ศิริพร ชัยโย', 'dept' => 'HR', 'section' => 'Payroll', 'pos' => 'Manager', 'mgr' => 'EMP-0015'],
            ['code' => 'EMP-0019', 'name' => 'Nattaya Phimsen', 'name_th' => 'ณัฐญา พิมพ์เสน', 'dept' => 'Acc', 'section' => 'Accounting', 'pos' => 'Manager', 'mgr' => 'EMP-0015'],
            ['code' => 'EMP-0020', 'name' => 'Apinya Rattana', 'name_th' => 'อภิญญา รัตนา', 'dept' => 'Sales', 'section' => 'Sales', 'pos' => 'Manager', 'mgr' => 'EMP-0015'],
            ['code' => 'EMP-0021', 'name' => 'Manat Boonyarit', 'name_th' => 'มานัส บุญยฤทธิ์', 'dept' => 'Lg', 'section' => 'Logistic', 'pos' => 'Manager', 'mgr' => 'EMP-0015'],
            ['code' => 'EMP-0022', 'name' => 'Worawut Kittisak', 'name_th' => 'วรวุฒิ กิตติศักดิ์', 'dept' => 'Mn', 'section' => 'Maintenance', 'pos' => 'Manager', 'mgr' => 'EMP-0015'],
            ['code' => 'EMP-0023', 'name' => 'Pichai Thaweesup', 'name_th' => 'พิชัย ทวีทรัพย์', 'dept' => 'PU', 'section' => 'Purchasing', 'pos' => 'Manager', 'mgr' => 'EMP-0015'],
            ['code' => 'EMP-0024', 'name' => 'Ratana Klinpratum', 'name_th' => 'รัตนา กลิ่นประทุม', 'dept' => 'GA', 'section' => 'General Affairs', 'pos' => 'Manager', 'mgr' => 'EMP-0015'],
            ['code' => 'EMP-0025', 'name' => 'Surasak Munkong', 'name_th' => 'สุรศักดิ์ มั่นคง', 'dept' => 'SE', 'section' => 'Occupational Safety & Health', 'pos' => 'Manager', 'mgr' => 'EMP-0015'],
            // A few staff under managers (more depth + section coverage)
            ['code' => 'EMP-0026', 'name' => 'Thanapon Inthawong', 'name_th' => 'ธนพล อินทวงศ์', 'dept' => 'It', 'section' => 'Support', 'pos' => 'Supervisor', 'mgr' => 'EMP-0016'],
            ['code' => 'EMP-0027', 'name' => 'Kanya Phakdee', 'name_th' => 'กัญญา ภักดี', 'dept' => 'It', 'section' => 'System analyst', 'pos' => 'Staff/Officer', 'mgr' => 'EMP-0026'],
            ['code' => 'EMP-0028', 'name' => 'Pimchada Sutthi', 'name_th' => 'พิมพ์ชฎา สุทธิ', 'dept' => 'QC', 'section' => 'Quality Assurance', 'pos' => 'Leader', 'mgr' => 'EMP-0017'],
            ['code' => 'EMP-0029', 'name' => 'Yuki Tanaka', 'name_th' => 'ยูกิ ทานากะ', 'dept' => 'QC', 'section' => 'Research and Development', 'pos' => 'Staff/Officer', 'mgr' => 'EMP-0028'],
            ['code' => 'EMP-0030', 'name' => 'Waraporn Sri', 'name_th' => 'วราพร ศรี', 'dept' => 'HR', 'section' => 'Recruitment', 'pos' => 'Staff/Officer', 'mgr' => 'EMP-0018'],
        ];

        // Pass 1: create/update each employee (no manager yet).
        foreach ($employees as $i => $e) {
            $email = 'emp'.str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT).'@abcd.co.th';
            Employee::updateOrCreate(
                ['code' => $e['code']],
                [
                    'name' => $e['name'],
                    'name_th' => $e['name_th'],
                    'department_id' => $e['dept'] ? ($deptId[$e['dept']] ?? null) : null,
                    'section_id' => $e['section'] ? ($sectionId["{$e['dept']}::{$e['section']}"] ?? null) : null,
                    'position_id' => $posId[$e['pos']] ?? null,
                    'email' => $email,
                    'status' => 'active',
                ],
            );
        }

        // Pass 2: wire manager_id by code.
        $idByCode = Employee::pluck('id', 'code');
        foreach ($employees as $e) {
            if ($e['mgr'] && isset($idByCode[$e['code']], $idByCode[$e['mgr']])) {
                Employee::where('code', $e['code'])->update(['manager_id' => $idByCode[$e['mgr']]]);
            }
        }

        $this->linkDemoAccounts();
        $this->seedGroupRoles();
    }

    /** Link the four demo logins to employee records (username + users.employee_id). */
    private function linkDemoAccounts(): void
    {
        $links = [
            'EMP-0001' => 'super', // Vice President
            'EMP-0016' => 'it',    // IT Manager
            'EMP-0018' => 'hr',    // HR Manager
            'EMP-0030' => 'user',  // HR staff
        ];
        foreach ($links as $code => $username) {
            $employee = Employee::where('code', $code)->first();
            if (! $employee) {
                continue;
            }
            $employee->update(['username' => $username]);
            User::where('username', $username)->update(['employee_id' => $employee->id]);
        }
    }

    /** Seed demo role groups and assign employees (Administrator > HR > IT > All Staff). */
    private function seedGroupRoles(): void
    {
        $groups = [
            ['name' => 'Administrator', 'role' => 'super'],
            ['name' => 'All Staff', 'role' => 'user'],
            ['name' => 'IT Team', 'role' => 'admin'],
            ['name' => 'HR Team', 'role' => 'hr'],
        ];
        foreach ($groups as $g) {
            GroupRole::updateOrCreate(['name' => $g['name']], ['role' => $g['role']]);
        }

        $admin = GroupRole::where('name', 'Administrator')->first();
        $allStaff = GroupRole::where('name', 'All Staff')->first();
        $itTeam = GroupRole::where('name', 'IT Team')->first();
        $hrTeam = GroupRole::where('name', 'HR Team')->first();

        $assigned = [];

        $adminIds = Employee::where('username', 'super')->pluck('id')->all();
        $admin?->employees()->sync($adminIds);
        $assigned = array_merge($assigned, $adminIds);

        $hrIds = Employee::whereHas('department', fn ($q) => $q->where('tag', 'HR'))
            ->whereNotIn('id', $assigned)->pluck('id')->all();
        $hrTeam?->employees()->sync($hrIds);
        $assigned = array_merge($assigned, $hrIds);

        $itIds = Employee::whereHas('department', fn ($q) => $q->where('tag', 'It'))
            ->whereNotIn('id', $assigned)->pluck('id')->all();
        $itTeam?->employees()->sync($itIds);
        $assigned = array_merge($assigned, $itIds);

        $restIds = Employee::where('status', 'active')
            ->whereNotIn('id', $assigned)->pluck('id')->all();
        $allStaff?->employees()->sync($restIds);

        if ($allStaff) {
            AppSetting::put('default_employee_group_id', (string) $allStaff->id);
        }
    }
}
```

- [ ] **Step 3: Seed-run smoke (isolated)** — confirm OrgSeeder alone runs and builds the tree on a fresh DB:

Run: `php artisan migrate:fresh --seed`
Expected: completes with no error. (If a LATER seeder errors, that's Task 5 — but note which one.)

- [ ] **Step 4: Verify the data + chain** via tinker:
```
php artisan tinker --execute 'echo \App\Models\Department::count()." depts, ".\App\Models\Section::count()." sections, ".\App\Models\Position::count()." positions, ".\App\Models\Employee::count()." employees\n"; $s=\App\Models\Employee::where("code","EMP-0014")->first(); echo app(\App\Services\ApprovalChainService::class)->chainFor($s)->pluck("name")->implode(" -> ");'
```
Expected: `11 depts, 26 sections, 14 positions, 30 employees` and a 13-name chain from EMP-0014 up to `Somchai Wattana` (VP).

- [ ] **Step 5: Commit**
```bash
vendor/bin/pint --dirty --format agent
git add database/seeders/OrgSeeder.php database/seeders/DatabaseSeeder.php
git rm database/seeders/ApprovalChainDemoSeeder.php
git commit -m "feat(org): rebuild demo org — 11 depts / 26 sections / 14 positions / 30-employee VP tree"
```

---

## Task 5: Full reseed smoke + dependent seeders + verification + README

**Files:** possibly `database/seeders/{Avatar,Asset,Ticket,Contract,Stock,MasterData}Seeder.php` (only if they break), `README.md`

- [ ] **Step 1: Full fresh seed** — `php artisan migrate:fresh --seed`. If it fails inside Avatar/Contract/MasterData/Stock/Asset/Ticket seeders, read the failing seeder and fix references to **removed employee codes** (old `EMP-104x`, `EMP-1213`, …) or **old department tags** (`IT`, `PRD`, `OPS`, `FIN`, `LOG`, `SAL`, `ENG`, `RND`, `QA`). Prefer making them robust (pick employees/departments dynamically, e.g. `Employee::inRandomOrder()->first()` or by current tag) rather than hardcoding new codes. Re-run until the whole seed is clean. Report each seeder you had to touch.

- [ ] **Step 2: Full backend test suite** — `php artisan test --compact`. Expected: all green (tests use RefreshDatabase, not the demo seeders, but this confirms the chain/position/settings changes didn't regress anything). Fix any failure caused by the removed approval endpoints or chain change.

- [ ] **Step 3: Frontend gate** — `npx tsc --noEmit && npm run build`. Expected: clean.

- [ ] **Step 4: Update `README.md`** — find the "Org Approval Chain" section and update it to reflect: the chain now climbs `manager_id` to the root (no level ceiling), the ceiling setting was removed, position levels go to 14 (display only), and the demo org is 11 depts / 26 sections / 14 positions / 30 employees. Add a one-line pointer to this plan + spec. Keep the existing section's style.

- [ ] **Step 5: Commit**
```bash
git add README.md database/seeders
git commit -m "docs(org): document manager-walk chain + new demo org; harden dependent seeders"
```

---

## Self-review notes
- **Spec coverage:** chain = manager walk (T1) ✓; ceiling removed backend (T1) + frontend (T2) ✓; position cap 14 (T3) ✓; demo data 11/26/14/30 + VP tree (T4) ✓; cross-seeder smoke (T5) ✓; README (T5) ✓; `positions.level` kept (T3/T4 — still seeded + shown) ✓.
- **Type/name consistency:** position titles in `$positions` match the `'pos'` values in `$employees` and `$posId` lookup; section names in `$sections` match the `'section'` values via the `"tag::name"` key; dept tags (`It`, `HR`, `PD`, …) consistent across departments, sections, employees, and the group-role queries.
- **Known watch points:** Task 5 Step 1 is where dependent seeders may need fixes — do not hardcode the new EMP-00xx codes into them; keep them dynamic. The `Position::pluck('id','title')` map relies on unique titles (the 14 are unique).
