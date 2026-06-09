<?php

namespace Database\Seeders;

use App\Models\AppSetting;
use App\Models\Department;
use App\Models\Employee;
use App\Models\GroupRole;
use App\Models\Location;
use App\Models\Position;
use App\Models\User;
use Illuminate\Database\Seeder;

class OrgSeeder extends Seeder
{
    public function run(): void
    {
        $departments = [
            ['tag' => 'PRD', 'name' => 'Production', 'name_th' => 'ฝ่ายผลิต'],
            ['tag' => 'QA', 'name' => 'Quality Assurance', 'name_th' => 'ฝ่ายประกันคุณภาพ'],
            ['tag' => 'OPS', 'name' => 'Operations', 'name_th' => 'ฝ่ายปฏิบัติการ'],
            ['tag' => 'FIN', 'name' => 'Finance', 'name_th' => 'ฝ่ายการเงิน'],
            ['tag' => 'LOG', 'name' => 'Logistics', 'name_th' => 'ฝ่ายโลจิสติกส์'],
            ['tag' => 'HR', 'name' => 'Human Resources', 'name_th' => 'ฝ่ายทรัพยากรบุคคล'],
            ['tag' => 'IT', 'name' => 'Information Technology', 'name_th' => 'ฝ่ายเทคโนโลยีสารสนเทศ'],
            ['tag' => 'SAL', 'name' => 'Sales', 'name_th' => 'ฝ่ายขาย'],
            ['tag' => 'ENG', 'name' => 'Engineering', 'name_th' => 'ฝ่ายวิศวกรรม'],
            ['tag' => 'RND', 'name' => 'R&D', 'name_th' => 'ฝ่ายวิจัยและพัฒนา'],
        ];
        foreach ($departments as $d) {
            Department::updateOrCreate(['tag' => $d['tag']], $d);
        }

        $positions = [
            'P-001' => 'Plant Manager', 'P-002' => 'SMT Operator', 'P-003' => 'QA Lead',
            'P-004' => 'QC Technician', 'P-005' => 'Operations Director', 'P-006' => 'Senior Accountant',
            'P-007' => 'Warehouse Supervisor', 'P-008' => 'HR Manager', 'P-009' => 'IT Manager',
            'P-010' => 'Network Engineer', 'P-011' => 'Sales Manager', 'P-012' => 'Equipment Engineer',
        ];
        foreach ($positions as $code => $title) {
            Position::updateOrCreate(['code' => $code], ['title' => $title]);
        }

        $locations = [
            'HQ Bangkok — Floor 3', 'HQ Bangkok — Floor 5', 'Plant 1 — Samut Sakhon',
            'Plant 1 — QA Lab', 'Warehouse — Bang Phli', 'Datacenter — Rack 2',
        ];
        foreach ($locations as $name) {
            Location::firstOrCreate(['name' => $name]);
        }

        $deptId = Department::pluck('id', 'tag');
        $posId = Position::pluck('id', 'title');

        $employees = [
            ['code' => 'EMP-1042', 'name' => 'Krittin Adisai', 'name_th' => 'กฤตติน อดิศัย', 'dept' => 'PRD', 'pos' => 'Plant Manager', 'email' => 'krittin@abcd.co.th', 'phone' => '+66 81 234 5678', 'joined_at' => '2018-03-12'],
            ['code' => 'EMP-1108', 'name' => 'Suwanna Pongrat', 'name_th' => 'สุวรรณา พงศ์รัตน์', 'dept' => 'QA', 'pos' => 'QA Lead', 'email' => 'suwanna@abcd.co.th', 'phone' => '+66 81 555 8123', 'joined_at' => '2019-06-01'],
            ['code' => 'EMP-1213', 'name' => 'Decha Tularak', 'name_th' => 'เดชา ตุลารักษ์', 'dept' => 'OPS', 'pos' => 'Operations Director', 'email' => 'decha@abcd.co.th', 'phone' => '+66 82 111 4422', 'joined_at' => '2016-01-15'],
            ['code' => 'EMP-1305', 'name' => 'Nattaya Phimsen', 'name_th' => 'ณัฐญา พิมพ์เสน', 'dept' => 'FIN', 'pos' => 'Senior Accountant', 'email' => 'nattaya@abcd.co.th', 'phone' => '+66 89 232 9912', 'joined_at' => '2020-09-21'],
            ['code' => 'EMP-1422', 'name' => 'Manat Boonyarit', 'name_th' => 'มานัส บุญยฤทธิ์', 'dept' => 'LOG', 'pos' => 'Warehouse Supervisor', 'email' => 'manat@abcd.co.th', 'phone' => '+66 86 778 0011', 'joined_at' => '2017-11-04'],
            ['code' => 'EMP-1509', 'name' => 'Siriporn Chaiyo', 'name_th' => 'ศิริพร ชัยโย', 'dept' => 'HR', 'pos' => 'HR Manager', 'email' => 'siriporn@abcd.co.th', 'phone' => '+66 81 901 4488', 'joined_at' => '2015-04-18'],
            ['code' => 'EMP-1617', 'name' => 'Krit Saengthong', 'name_th' => 'กฤต แสงทอง', 'dept' => 'IT', 'pos' => 'IT Manager', 'email' => 'krit@abcd.co.th', 'phone' => '+66 88 234 5511', 'joined_at' => '2014-07-22'],
            ['code' => 'EMP-1718', 'name' => 'Thanapon Inthawong', 'name_th' => 'ธนพล อินทวงศ์', 'dept' => 'IT', 'pos' => 'Network Engineer', 'email' => 'thanapon@abcd.co.th', 'phone' => '+66 84 119 2245', 'joined_at' => '2021-02-08'],
            ['code' => 'EMP-1834', 'name' => 'Pongsak Charoen', 'name_th' => 'พงศักดิ์ เจริญ', 'dept' => 'PRD', 'pos' => 'SMT Operator', 'email' => 'pongsak@abcd.co.th', 'phone' => '+66 81 332 8821', 'joined_at' => '2022-05-16'],
            ['code' => 'EMP-1901', 'name' => 'Apinya Rattana', 'name_th' => 'อภิญญา รัตนา', 'dept' => 'SAL', 'pos' => 'Sales Manager', 'email' => 'apinya@abcd.co.th', 'phone' => '+66 87 220 5544', 'joined_at' => '2019-08-30'],
            ['code' => 'EMP-2003', 'name' => 'Worawut Kittisak', 'name_th' => 'วรวุฒิ กิตติศักดิ์', 'dept' => 'ENG', 'pos' => 'Equipment Engineer', 'email' => 'worawut@abcd.co.th', 'phone' => '+66 89 442 1187', 'joined_at' => '2020-01-12'],
            ['code' => 'EMP-2115', 'name' => 'Pimchada Sutthi', 'name_th' => 'พิมพ์ชฎา สุทธิ', 'dept' => 'QA', 'pos' => 'QC Technician', 'email' => 'pimchada@abcd.co.th', 'phone' => '+66 81 559 7723', 'joined_at' => '2023-03-04'],
            // Resigned demo employees — used to exercise the cancel-resignation flow.
            ['code' => 'EMP-2208', 'name' => 'Prayut Thongchai', 'name_th' => 'ประยุทธ ทองชัย', 'dept' => 'PRD', 'pos' => 'SMT Operator', 'email' => 'prayut@abcd.co.th', 'phone' => '+66 81 447 9920', 'joined_at' => '2019-10-01', 'status' => 'resigned', 'resign_reason' => 'ย้ายไปทำงานต่างจังหวัด', 'last_day' => '2026-04-30'],
            ['code' => 'EMP-2301', 'name' => 'Waraporn Sri', 'name_th' => 'วราพร ศรี', 'dept' => 'SAL', 'pos' => 'Sales Manager', 'email' => 'waraporn@abcd.co.th', 'phone' => '+66 86 552 1130', 'joined_at' => '2018-06-15', 'status' => 'resigned', 'resign_reason' => 'เกษียณอายุ', 'last_day' => '2026-03-31'],
        ];

        foreach ($employees as $e) {
            Employee::updateOrCreate(
                ['code' => $e['code']],
                [
                    'name' => $e['name'],
                    'name_th' => $e['name_th'],
                    'department_id' => $deptId[$e['dept']] ?? null,
                    'position_id' => $posId[$e['pos']] ?? null,
                    'email' => $e['email'],
                    'phone' => $e['phone'],
                    'joined_at' => $e['joined_at'],
                    'status' => $e['status'] ?? 'active',
                    'resign_reason' => $e['resign_reason'] ?? null,
                    'last_day' => $e['last_day'] ?? null,
                ],
            );
        }

        $this->linkDemoAccounts();
        $this->seedGroupRoles();
    }

    /**
     * Links the four demo login users to their matching employee records via the
     * users.employee_id FK. Sets the employee's username for display purposes and
     * points the User row back to the correct Employee, so has_account resolves true.
     */
    private function linkDemoAccounts(): void
    {
        $links = [
            'EMP-1617' => 'super', // Wichai Suwannarat
            'EMP-1718' => 'it',    // Kanya Phakdee
            'EMP-1509' => 'hr',    // Ratana Klinprathum
            'EMP-1305' => 'user',  // Pimchanok Wongwai
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

    /**
     * Seeds the demo Role Groups, assigns active employees to the default
     * "All Staff" group, and records that group as the system default used
     * when a new employee's login account is later provisioned.
     */
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

        // Each employee belongs to exactly one group; assign by priority so the
        // sets stay disjoint: Administrator > HR Team > IT Team > All Staff.
        $assigned = [];

        // Administrator: the super demo account's employee (username 'super').
        $adminIds = Employee::where('username', 'super')->pluck('id')->all();
        $admin?->employees()->sync($adminIds);
        $assigned = array_merge($assigned, $adminIds);

        // HR Team: HR-department employees not already placed.
        $hrIds = Employee::whereHas('department', fn ($q) => $q->where('tag', 'HR'))
            ->whereNotIn('id', $assigned)->pluck('id')->all();
        $hrTeam?->employees()->sync($hrIds);
        $assigned = array_merge($assigned, $hrIds);

        // IT Team: IT-department employees not already placed.
        $itIds = Employee::whereHas('department', fn ($q) => $q->where('tag', 'IT'))
            ->whereNotIn('id', $assigned)->pluck('id')->all();
        $itTeam?->employees()->sync($itIds);
        $assigned = array_merge($assigned, $itIds);

        // All Staff (default): every remaining active employee.
        $restIds = Employee::where('status', 'active')
            ->whereNotIn('id', $assigned)->pluck('id')->all();
        $allStaff?->employees()->sync($restIds);

        // Record the default group used to resolve role keys for new accounts.
        if ($allStaff) {
            AppSetting::put('default_employee_group_id', (string) $allStaff->id);
        }
    }
}
