<?php

namespace Database\Seeders;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\GroupRole;
use App\Models\Settings\AppSetting;
use App\Models\Settings\Location;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Seeds the org chart: the full department / position / section master data, the
 * demo locations, and a small employee tree — one employee per demo login.
 *
 * The employee list is deliberately six people rather than a large fake roster.
 * Every one of them signs in, which is what makes the Request approval chain
 * demonstrable: a step resolves to a manager only if that manager has a login
 * account, so a tree padded with account-less names would collapse every
 * multi-step workflow onto the one approver who could actually sign in.
 */
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

        // ── Positions (code => title) — a flat list of job titles. ───────────
        $positions = [
            'PST-0001' => 'Vice President',
            'PST-0002' => 'Director',
            'PST-0003' => 'Senior Manager',
            'PST-0004' => 'Manager',
            'PST-0005' => 'Asst. Manager',
            'PST-0006' => 'Senior Supervisor',
            'PST-0007' => 'Supervisor',
            'PST-0008' => 'Asst. Supervisor',
            'PST-0009' => 'Leader',
            'PST-0010' => 'Sub-Leader',
            'PST-0011' => 'Head of Line',
            'PST-0012' => 'Head of Shift',
            'PST-0013' => 'Staff/Officer',
            'PST-0014' => 'Subcontract',
        ];
        foreach ($positions as $code => $title) {
            Position::updateOrCreate(['code' => $code], ['title' => $title]);
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

        $employees = $this->demoEmployees();

        // Employee and login share one email address, matching the real provisioning
        // flow where an account is created against the person's mailbox.
        $loginEmails = User::pluck('email', 'username');

        // Pass 1: create/update each employee (manager wired in pass 2, once every
        // row exists and its code can be resolved to an id).
        foreach ($employees as $i => $e) {
            // Split the demo full names into first/last on the first space.
            [$fn, $ln] = array_pad(explode(' ', $e['name'], 2), 2, '');
            [$fnTh, $lnTh] = array_pad(explode(' ', $e['name_th'], 2), 2, '');
            Employee::updateOrCreate(
                ['code' => $e['code']],
                [
                    'first_name' => $fn,
                    'last_name' => $ln,
                    'first_name_th' => $fnTh ?: null,
                    'last_name_th' => $lnTh ?: null,
                    'department_id' => $e['dept'] ? ($deptId[$e['dept']] ?? null) : null,
                    'section_id' => $e['section'] ? ($sectionId["{$e['dept']}::{$e['section']}"] ?? null) : null,
                    'position_id' => $posId[$e['pos']] ?? null,
                    // The login this person signs in as is part of who they are in the
                    // demo tree, so it is set here rather than only when the matching
                    // account happens to exist.
                    'username' => $e['login'],
                    'email' => $loginEmails[$e['login']] ?? null,
                    // The list runs top-down, so spreading join dates by index gives
                    // the senior people the longer tenures.
                    'joined_at' => date('Y-m-d', strtotime('2016-01-01 +'.($i * 8).' months')),
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

        $this->linkDemoAccounts($employees);
        $this->seedGroupRoles();
    }

    /**
     * The demo tree, top-down. 'mgr' is the code this person reports to (null =
     * top of the tree) and 'login' is the demo account that signs in as them.
     *
     * Reporting lines, which are what the Request workflow walks:
     *   user → hr → director → vp   (three approval levels)
     *   it   → super → director → vp
     *
     * @return list<array{code:string,name:string,name_th:string,dept:?string,section:?string,pos:string,mgr:?string,login:string}>
     */
    private function demoEmployees(): array
    {
        return [
            ['code' => 'EMP-0001', 'name' => 'Somchai Wattana', 'name_th' => 'สมชาย วัฒนา', 'dept' => null, 'section' => null, 'pos' => 'Vice President', 'mgr' => null, 'login' => 'vp'],
            ['code' => 'EMP-0002', 'name' => 'Wanchai Rung', 'name_th' => 'วันชัย รุ่งเรือง', 'dept' => null, 'section' => null, 'pos' => 'Director', 'mgr' => 'EMP-0001', 'login' => 'director'],
            ['code' => 'EMP-0003', 'name' => 'Krit Saengthong', 'name_th' => 'กฤต แสงทอง', 'dept' => 'It', 'section' => 'Network & Security', 'pos' => 'Manager', 'mgr' => 'EMP-0002', 'login' => 'super'],
            ['code' => 'EMP-0004', 'name' => 'Thanapon Inthawong', 'name_th' => 'ธนพล อินทวงศ์', 'dept' => 'It', 'section' => 'Support', 'pos' => 'Supervisor', 'mgr' => 'EMP-0003', 'login' => 'it'],
            ['code' => 'EMP-0005', 'name' => 'Siriporn Chaiyo', 'name_th' => 'ศิริพร ชัยโย', 'dept' => 'HR', 'section' => 'Payroll', 'pos' => 'Manager', 'mgr' => 'EMP-0002', 'login' => 'hr'],
            ['code' => 'EMP-0006', 'name' => 'Waraporn Sri', 'name_th' => 'วราพร ศรี', 'dept' => 'HR', 'section' => 'Recruitment', 'pos' => 'Staff/Officer', 'mgr' => 'EMP-0005', 'login' => 'user'],
        ];
    }

    /**
     * Point each demo account at the employee it signs in as. Pass 1 already put
     * the username on the employee; this wires the users.employee_id side, which
     * only exists once the accounts do (DemoSeeder creates them before calling
     * this seeder — running OrgSeeder alone simply leaves that side unset).
     *
     * @param  list<array<string, mixed>>  $employees
     */
    private function linkDemoAccounts(array $employees): void
    {
        $usernames = array_column($employees, 'login');

        // Drop the username from anyone outside the current tree, so a mapping left
        // by an earlier seed run does not leave two employees claiming one login.
        Employee::whereIn('username', $usernames)
            ->whereNotIn('code', array_column($employees, 'code'))
            ->update(['username' => null]);

        // users.employee_id is unique — detach every account before re-assigning,
        // otherwise a swapped mapping collides with the previous holder mid-loop.
        User::whereIn('username', $usernames)->update(['employee_id' => null]);

        foreach ($employees as $e) {
            $employee = Employee::where('code', $e['code'])->first();
            $user = User::where('username', $e['login'])->first();
            if ($employee === null || $user === null) {
                continue;
            }

            $user->update(['employee_id' => $employee->id]);
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
