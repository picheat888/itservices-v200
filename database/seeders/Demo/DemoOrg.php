<?php

namespace Database\Seeders\Demo;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Settings\AppSetting;
use App\Services\Employee\EmployeeService;
use Database\Seeders\DemoSeeder;

/**
 * The demo organisation: one VP over eleven departments, each Manager → Supervisor →
 * Leader/Staff on the titles EmployeePositionSeeder ships, so every workflow rung finds
 * a real holder. Plus three UAT cases: a resigned leaf, a new hire with no account yet
 * (HR files their onboarding in DemoRequests), and one employee with no manager.
 *
 * Role Groups: IT Team (IT Technician), HR (HR Recruit), Staff (Staff, the default for
 * new employees) — without a default group no login account can be provisioned.
 */
final class DemoOrg implements DemoStep
{
    /**
     * [key, first, last, first_th, last_th, department tag, position title, manager key]
     *
     * @var list<array{0:string,1:string,2:string,3:?string,4:?string,5:string,6:string,7:?string}>
     */
    private const PEOPLE = [
        ['vp', 'Wichai', 'Srisawat', 'วิชัย', 'ศรีสวัสดิ์', 'GA', 'Vice President', null],
        ['mgr.pd', 'Anan', 'Chaiyaporn', 'อนันต์', 'ชัยพร', 'PD', 'Manager', 'vp'],
        ['mgr.it', 'Pornthip', 'Kaewmanee', 'พรทิพย์', 'แก้วมณี', 'IT', 'Manager', 'vp'],
        ['mgr.qc', 'Kittisak', 'Boonmee', 'กิตติศักดิ์', 'บุญมี', 'QC', 'Manager', 'vp'],
        ['mgr.se', 'Suda', 'Rattanakul', 'สุดา', 'รัตนกุล', 'SE', 'Manager', 'vp'],
        ['mgr.hr', 'Napaporn', 'Wongsa', 'นภาพร', 'วงศ์ษา', 'HR', 'Manager', 'vp'],
        ['mgr.acc', 'David', 'Miller', null, null, 'ACC', 'Manager', 'vp'],
        ['mgr.sale', 'Jiraporn', 'Thongdee', 'จิราพร', 'ทองดี', 'SALE', 'Manager', 'vp'],
        ['mgr.lg', 'Prasert', 'Kongkaew', 'ประเสริฐ', 'คงแก้ว', 'LG', 'Senior Manager', 'vp'],
        ['mgr.mn', 'Thanawat', 'Phromma', 'ธนวัฒน์', 'พรหมมา', 'MN', 'Asst. Manager', 'vp'],
        ['mgr.pu', 'Kanokwan', 'Saelim', 'กนกวรรณ', 'แซ่ลิ้ม', 'PU', 'Manager', 'vp'],
        ['mgr.ga', 'Somsak', 'Jaidee', 'สมศักดิ์', 'ใจดี', 'GA', 'Manager', 'vp'],
        ['sup.pd', 'Chaiwat', 'Inthong', 'ชัยวัฒน์', 'อินทอง', 'PD', 'Supervisor', 'mgr.pd'],
        ['sup.it', 'Kankanok', 'Phusri', 'กาญจน์กนก', 'ภูศรี', 'IT', 'Supervisor', 'mgr.it'],
        ['sup.qc', 'Arunee', 'Moonsri', 'อรุณี', 'มูลศรี', 'QC', 'Supervisor', 'mgr.qc'],
        ['sup.se', 'Tanakorn', 'Yodsiri', 'ธนากร', 'ยอดศิริ', 'SE', 'Supervisor', 'mgr.se'],
        ['sup.lg', 'Wanida', 'Chaisuk', 'วนิดา', 'ชัยสุข', 'LG', 'Senior Supervisor', 'mgr.lg'],
        ['staff', 'Nattapong', 'Sukjai', 'ณัฐพงษ์', 'สุขใจ', 'PD', 'Staff/Officer', 'sup.pd'],
        ['pd.leader', 'Malee', 'Srisuk', 'มาลี', 'ศรีสุข', 'PD', 'Leader', 'sup.pd'],
        ['pd.3', 'Sompong', 'Kaewta', 'สมพงษ์', 'แก้วตา', 'PD', 'Staff/Officer', 'pd.leader'],
        ['pd.4', 'Rattana', 'Boonyuen', 'รัตนา', 'บุญยืน', 'PD', 'Staff/Officer', 'sup.pd'],
        ['it.tech', 'Theerawat', 'Nakprasert', 'ธีรวัฒน์', 'นาคประเสริฐ', 'IT', 'Staff/Officer', 'sup.it'],
        ['it.2', 'Pimchanok', 'Wongdee', 'พิมพ์ชนก', 'วงศ์ดี', 'IT', 'Staff/Officer', 'sup.it'],
        ['it.3', 'John', 'Carter', null, null, 'IT', 'Staff/Officer', 'sup.it'],
        ['qc.2', 'Siriporn', 'Kamol', 'ศิริพร', 'กมล', 'QC', 'Staff/Officer', 'sup.qc'],
        ['se.2', 'Apichart', 'Ruangsri', 'อภิชาติ', 'เรืองศรี', 'SE', 'Staff/Officer', 'sup.se'],
        ['hr.staff', 'Nuchjaree', 'Pansuk', 'นุชจรี', 'ปานสุข', 'HR', 'Staff/Officer', 'mgr.hr'],
        ['hr.2', 'Orawan', 'Sombat', 'อรวรรณ', 'สมบัติ', 'HR', 'Staff/Officer', 'mgr.hr'],
        ['acc.2', 'Lisa', 'Wong', null, null, 'ACC', 'Staff/Officer', 'mgr.acc'],
        ['acc.3', 'Supaporn', 'Meesuk', 'สุภาพร', 'มีสุข', 'ACC', 'Staff/Officer', 'mgr.acc'],
        ['sale.2', 'Krit', 'Anuphan', 'กฤต', 'อนุพันธ์', 'SALE', 'Staff/Officer', 'mgr.sale'],
        ['sale.3', 'Emily', 'Tan', null, null, 'SALE', 'Staff/Officer', 'mgr.sale'],
        ['lg.leader', 'Boonlert', 'Chanthra', 'บุญเลิศ', 'จันทรา', 'LG', 'Leader', 'sup.lg'],
        ['lg.3', 'Chalerm', 'Saengthong', 'เฉลิม', 'แสงทอง', 'LG', 'Staff/Officer', 'lg.leader'],
        ['mn.2', 'Wirot', 'Thammasak', 'วิโรจน์', 'ธรรมศักดิ์', 'MN', 'Staff/Officer', 'mgr.mn'],
        ['pu.2', 'Jintana', 'Rakdee', 'จินตนา', 'รักดี', 'PU', 'Staff/Officer', 'mgr.pu'],
        ['ga.2', 'Preeya', 'Suwan', 'ปรียา', 'สุวรรณ', 'GA', 'Staff/Officer', 'mgr.ga'],
        ['resigned', 'Surachai', 'Buakaew', 'สุรชัย', 'บัวแก้ว', 'SE', 'Staff/Officer', 'sup.se'],
        ['newhire', 'Tanapat', 'Srichai', 'ธนพัฒน์', 'ศรีชัย', 'PD', 'Staff/Officer', 'sup.pd'],
        ['orphan', 'Mongkol', 'Petchsri', 'มงคล', 'เพชรศรี', 'SALE', 'Staff/Officer', null],
    ];

    /** user key => [username, employee key] */
    private const ACCOUNTS = [
        'staff' => ['staff.demo', 'staff'],
        'sup' => ['sup.demo', 'sup.pd'],
        'mgr' => ['mgr.demo', 'mgr.pd'],
        'vp' => ['vp.demo', 'vp'],
        'qc' => ['qc.demo', 'mgr.qc'],
        'se' => ['se.demo', 'mgr.se'],
        'it.lead' => ['it.lead', 'sup.it'],
        'it.tech' => ['it.tech', 'it.tech'],
        'hr' => ['hr.demo', 'hr.staff'],
    ];

    public function __construct(private readonly EmployeeService $employees) {}

    public function run(DemoContext $ctx, DemoClock $clock): void
    {
        $clock->at($clock->daysAgo(200));

        $departmentByTag = Department::pluck('id', 'tag');
        $positionByTitle = Position::pluck('id', 'title');

        foreach (self::PEOPLE as $i => [$key, $first, $last, $firstTh, $lastTh, $tag, $title, $managerKey]) {
            $departmentId = $departmentByTag[$tag];
            $ctx->employees[$key] = Employee::create([
                'first_name' => $first,
                'last_name' => $last,
                'first_name_th' => $firstTh,
                'last_name_th' => $lastTh,
                'department_id' => $departmentId,
                'section_id' => Section::where('department_id', $departmentId)->orderBy('id')->value('id'),
                'position_id' => $positionByTitle[$title],
                'manager_id' => $managerKey !== null ? $ctx->employee($managerKey)->id : null,
                'email' => strtolower($first).'.'.strtolower(substr($last, 0, 1)).'@example.com',
                'phone' => sprintf('08%d-%03d-%04d', $i % 10, 100 + $i, 2000 + $i * 7),
                'joined_at' => $key === 'newhire'
                    ? $clock->base()->addDays(7)->toDateString()
                    : $clock->daysAgo(400 + $i * 13)->toDateString(),
            ]);
        }

        $this->groups($ctx);

        $ctx->employee('resigned')->update([
            'status' => EmployeeStatus::Resigned,
            'resign_reason' => 'Moved to another company',
            'last_day' => $clock->daysAgo(20)->toDateString(),
        ]);

        foreach (self::ACCOUNTS as $userKey => [$username, $employeeKey]) {
            $ctx->users[$userKey] = $this->employees->createUserWithCredentials(
                $ctx->employee($employeeKey), $username, DemoSeeder::PASSWORD, false,
            );
        }
    }

    /** IT → IT Team, HR → HR, everyone else → Staff (the default for new employees). */
    private function groups(DemoContext $ctx): void
    {
        $it = GroupRole::create(['name' => 'IT Team', 'role_id' => Role::where('key', 'admin')->value('id')]);
        $hr = GroupRole::create(['name' => 'HR', 'role_id' => Role::where('key', 'hr')->value('id')]);
        $staff = GroupRole::create(['name' => 'Staff', 'role_id' => Role::where('key', 'user')->value('id')]);
        AppSetting::put('default_employee_group_id', (string) $staff->id);

        $itDepartment = (int) Department::where('tag', 'IT')->value('id');
        $hrDepartment = (int) Department::where('tag', 'HR')->value('id');

        foreach ($ctx->employees as $employee) {
            $group = match ((int) $employee->department_id) {
                $itDepartment => $it,
                $hrDepartment => $hr,
                default => $staff,
            };
            $group->employees()->attach($employee->id);
        }
    }
}
