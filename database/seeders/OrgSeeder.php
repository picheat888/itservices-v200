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
            ['code' => 'PRD', 'name' => 'Production', 'name_th' => 'ฝ่ายผลิต', 'head' => 'Nattapong S.', 'location' => 'Plant 1 — Samut Sakhon'],
            ['code' => 'QA', 'name' => 'Quality Assurance', 'name_th' => 'ฝ่ายประกันคุณภาพ', 'head' => 'Suthida P.', 'location' => 'Plant 1 — QA Lab'],
            ['code' => 'OPS', 'name' => 'Operations', 'name_th' => 'ฝ่ายปฏิบัติการ', 'head' => 'Akira Tanaka', 'location' => 'HQ Bangkok'],
            ['code' => 'FIN', 'name' => 'Finance', 'name_th' => 'ฝ่ายการเงิน', 'head' => 'Pimchanok W.', 'location' => 'HQ Bangkok'],
            ['code' => 'LOG', 'name' => 'Logistics', 'name_th' => 'ฝ่ายโลจิสติกส์', 'head' => 'Somchai B.', 'location' => 'Warehouse — Bang Phli'],
            ['code' => 'HR', 'name' => 'Human Resources', 'name_th' => 'ฝ่ายทรัพยากรบุคคล', 'head' => 'Ratana K.', 'location' => 'HQ Bangkok'],
            ['code' => 'IT', 'name' => 'Information Technology', 'name_th' => 'ฝ่ายเทคโนโลยีสารสนเทศ', 'head' => 'Wichai S.', 'location' => 'HQ Bangkok'],
            ['code' => 'SAL', 'name' => 'Sales', 'name_th' => 'ฝ่ายขาย', 'head' => 'Anchalee R.', 'location' => 'HQ Bangkok'],
            ['code' => 'ENG', 'name' => 'Engineering', 'name_th' => 'ฝ่ายวิศวกรรม', 'head' => 'Theerapong K.', 'location' => 'Plant 1'],
            ['code' => 'RND', 'name' => 'R&D', 'name_th' => 'ฝ่ายวิจัยและพัฒนา', 'head' => 'Yuki Sato', 'location' => 'HQ Bangkok'],
        ];
        foreach ($departments as $d) {
            Department::updateOrCreate(['code' => $d['code']], $d);
        }

        $positions = [
            'P-001' => 'Plant Manager', 'P-002' => 'Line Operator', 'P-003' => 'QA Lead',
            'P-004' => 'QC Technician', 'P-005' => 'Operations Director', 'P-006' => 'Senior Accountant',
            'P-007' => 'Warehouse Supervisor', 'P-008' => 'HR Manager', 'P-009' => 'IT Manager',
            'P-010' => 'Network Engineer', 'P-011' => 'Sales Manager', 'P-012' => 'Maintenance Engineer',
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

        $deptId = Department::pluck('id', 'code');
        $posId = Position::pluck('id', 'title');

        $employees = [
            ['code' => 'EMP-1042', 'name' => 'Nattapong Saetang', 'name_th' => 'ณัฐพงษ์ แซ่ตั้ง', 'dept' => 'PRD', 'pos' => 'Plant Manager', 'email' => 'nattapong@inaba.co.th', 'phone' => '+66 81 234 5678', 'joined_at' => '2018-03-12'],
            ['code' => 'EMP-1108', 'name' => 'Suthida Phromsiri', 'name_th' => 'สุธิดา พรหมศิริ', 'dept' => 'QA', 'pos' => 'QA Lead', 'email' => 'suthida@inaba.co.th', 'phone' => '+66 81 555 8123', 'joined_at' => '2019-06-01'],
            ['code' => 'EMP-1213', 'name' => 'Akira Tanaka', 'name_th' => 'อากิระ ทานากะ', 'dept' => 'OPS', 'pos' => 'Operations Director', 'email' => 'akira@inaba.co.th', 'phone' => '+66 82 111 4422', 'joined_at' => '2016-01-15'],
            ['code' => 'EMP-1305', 'name' => 'Pimchanok Wongwai', 'name_th' => 'พิมพ์ชนก วงศ์ไว', 'dept' => 'FIN', 'pos' => 'Senior Accountant', 'email' => 'pimchanok@inaba.co.th', 'phone' => '+66 89 232 9912', 'joined_at' => '2020-09-21'],
            ['code' => 'EMP-1422', 'name' => 'Somchai Boonmee', 'name_th' => 'สมชาย บุญมี', 'dept' => 'LOG', 'pos' => 'Warehouse Supervisor', 'email' => 'somchai@inaba.co.th', 'phone' => '+66 86 778 0011', 'joined_at' => '2017-11-04'],
            ['code' => 'EMP-1509', 'name' => 'Ratana Klinprathum', 'name_th' => 'รัตนา กลิ่นประทุม', 'dept' => 'HR', 'pos' => 'HR Manager', 'email' => 'ratana@inaba.co.th', 'phone' => '+66 81 901 4488', 'joined_at' => '2015-04-18'],
            ['code' => 'EMP-1617', 'name' => 'Wichai Suwannarat', 'name_th' => 'วิชัย สุวรรณรัตน์', 'dept' => 'IT', 'pos' => 'IT Manager', 'email' => 'wichai@inaba.co.th', 'phone' => '+66 88 234 5511', 'joined_at' => '2014-07-22'],
            ['code' => 'EMP-1718', 'name' => 'Kanya Phakdee', 'name_th' => 'กัญญา ภักดี', 'dept' => 'IT', 'pos' => 'Network Engineer', 'email' => 'kanya@inaba.co.th', 'phone' => '+66 84 119 2245', 'joined_at' => '2021-02-08'],
            ['code' => 'EMP-1834', 'name' => 'Manop Charoensap', 'name_th' => 'มานพ เจริญทรัพย์', 'dept' => 'PRD', 'pos' => 'Line Operator', 'email' => 'manop@inaba.co.th', 'phone' => '+66 81 332 8821', 'joined_at' => '2022-05-16'],
            ['code' => 'EMP-1901', 'name' => 'Anchalee Rakkit', 'name_th' => 'อัญชลี รักกิจ', 'dept' => 'SAL', 'pos' => 'Sales Manager', 'email' => 'anchalee@inaba.co.th', 'phone' => '+66 87 220 5544', 'joined_at' => '2019-08-30'],
            ['code' => 'EMP-2003', 'name' => 'Theerapong Klangsap', 'name_th' => 'ธีรพงษ์ คลังทรัพย์', 'dept' => 'ENG', 'pos' => 'Maintenance Engineer', 'email' => 'theerapong@inaba.co.th', 'phone' => '+66 89 442 1187', 'joined_at' => '2020-01-12'],
            ['code' => 'EMP-2115', 'name' => 'Yuki Sato', 'name_th' => 'ยูกิ ซาโตะ', 'dept' => 'QA', 'pos' => 'QC Technician', 'email' => 'yuki@inaba.co.th', 'phone' => '+66 81 559 7723', 'joined_at' => '2023-03-04'],
            // Resigned demo employees — used to exercise the cancel-resignation flow.
            ['code' => 'EMP-2208', 'name' => 'Prasert Thongdee', 'name_th' => 'ประเสริฐ ทองดี', 'dept' => 'PRD', 'pos' => 'Line Operator', 'email' => 'prasert@inaba.co.th', 'phone' => '+66 81 447 9920', 'joined_at' => '2019-10-01', 'status' => 'resigned', 'resign_reason' => 'ย้ายไปทำงานต่างจังหวัด', 'last_day' => '2026-04-30'],
            ['code' => 'EMP-2301', 'name' => 'Wanida Srisuk', 'name_th' => 'วนิดา ศรีสุข', 'dept' => 'SAL', 'pos' => 'Sales Manager', 'email' => 'wanida@inaba.co.th', 'phone' => '+66 86 552 1130', 'joined_at' => '2018-06-15', 'status' => 'resigned', 'resign_reason' => 'เกษียณอายุ', 'last_day' => '2026-03-31'],
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
        $hrIds = Employee::whereHas('department', fn ($q) => $q->where('code', 'HR'))
            ->whereNotIn('id', $assigned)->pluck('id')->all();
        $hrTeam?->employees()->sync($hrIds);
        $assigned = array_merge($assigned, $hrIds);

        // IT Team: IT-department employees not already placed.
        $itIds = Employee::whereHas('department', fn ($q) => $q->where('code', 'IT'))
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
