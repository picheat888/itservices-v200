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

        // ── Employees: one VP-topped tree. dept/section null for VP & Corporate
        //    Director. 'mgr' = the code this person reports to (null = top). ────
        $employees = [
            // VP (L14) then PD full ladder L13 -> L1
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
                    'email' => $email,
                    // Spread join dates so the demo has realistic tenures (earlier rows = senior = joined earlier).
                    'joined_at' => date('Y-m-d', strtotime('2016-01-01 +'.($i * 2).' months')),
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
