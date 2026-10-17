<?php

namespace App\Support\Perf;

use Carbon\CarbonImmutable;

/** Perf step 2: sections, locations, warehouses, the employee tree, login users and role groups. */
class Org implements PerfStep
{
    use FillsRows;

    // bcrypt cost 12 of 'Password1!'
    public const PASSWORD_HASH = '$2y$12$8pHK3DTvkrVJHAzumM2Au.JKKSuLDLt1mv7RKUyI7i.IhP3EjCNTu';

    private const IT_USERS = 15;

    private const HR_USERS = 3;

    private const MANAGER_TITLES = ['Manager', 'Senior Manager', 'Asst. Manager'];

    private const SUPERVISOR_TITLES = ['Supervisor', 'Asst. Supervisor', 'Senior Supervisor'];

    private const IT_TITLES = ['Engineer', 'Senior Engineer', 'Technician', 'Analyst', 'Specialist'];

    private const HR_TITLES = ['Coordinator', 'Specialist', 'Assistant'];

    private const STAFF_TITLES = ['Senior Staff', 'Specialist', 'Engineer', 'Technician', 'Analyst', 'Coordinator', 'Assistant', 'Operator', 'Trainee', 'Consultant'];

    private const WAREHOUSES = ['Main Store', 'IT Store', 'Spare Parts', 'Building B', 'Factory Store'];

    private const LOCATIONS = [
        'Head Office', 'Factory 1', 'Factory 2', 'Warehouse A', 'Warehouse B', 'Branch Bangkok', 'Branch Chiang Mai', 'Branch Khon Kaen',
        'Branch Hat Yai', 'Branch Rayong', 'Showroom', 'Training Room', 'Server Room', 'Meeting Room 1', 'Meeting Room 2',
    ];

    private const RESIGN_REASONS = ['Better opportunity', 'Personal reasons', 'Relocation', 'Further study', 'End of contract'];

    /** @var array<string, true> */
    private array $emails = [];

    public function run(PerfContext $ctx): void
    {
        $this->ctx = $ctx;
        $reg = $ctx->reg;

        $sections = $this->writeSections();
        $this->writeLocationsAndWarehouses();

        $people = $this->buildPeople($sections);
        $this->assignDates($people);
        $this->writeEmployeesUsersGroups($people);
        $this->writeApproverSlots($people);

        $reg->remember('employees', array_map(fn (array $p): array => [
            'id' => $p['id'], 'code' => $p['code'], 'name' => $p['first'].' '.$p['last'], 'dept_id' => $p['dept'],
            'section_id' => $p['section'], 'position_title' => $p['title'], 'manager_id' => $p['manager'], 'status' => $p['status'],
            'joined_at' => $p['joined'], 'last_day' => $p['last_day'], 'user_id' => $p['user_id'], 'email' => $p['email'], 'kind' => $p['kind'],
        ], $people));
        $reg->remember('it_user_ids', array_values(array_map(fn (array $p): int => $p['user_id'], array_filter($people, fn (array $p): bool => $p['kind'] === 'it'))));
        $reg->remember('user_by_employee', array_column(array_filter($people, fn (array $p): bool => $p['user_id'] !== null), 'user_id', 'id'));
        $reg->remember('vp_employee_id', $people[0]['id']);
    }

    /** @return array<int, list<int>> section ids by department id */
    private function writeSections(): array
    {
        $deptIds = $this->ctx->reg->get('department_ids');
        $names = $this->ctx->reg->get('department_names');
        $total = max($this->ctx->targets->of('sections'), count($deptIds));
        $base = intdiv($total, count($deptIds));
        $extra = $total % count($deptIds);

        $byDept = [];
        foreach ($deptIds as $i => $deptId) {
            for ($n = 0; $n < max(1, $base + ($i < $extra ? 1 : 0)); $n++) {
                $id = $this->ctx->reg->nextId('sections');
                $label = $names[$deptId].' Section '.chr(65 + $n);
                $this->ctx->sql->insert('sections', $this->fill('sections', [
                    'id' => $id, 'code' => sprintf('SEC-%04d', $id), 'department_id' => $deptId, 'name' => $label, 'name_th' => $label,
                    'created_at' => $this->stamp(), 'updated_at' => $this->stamp(),
                ]));
                $byDept[$deptId][] = $id;
            }
        }

        return $byDept;
    }

    private function writeLocationsAndWarehouses(): void
    {
        $locationIds = [];
        foreach (self::LOCATIONS as $name) {
            $id = $this->ctx->reg->nextId('locations');
            $this->ctx->sql->insert('locations', $this->fill('locations', ['id' => $id, 'name' => $name, 'created_at' => $this->stamp(), 'updated_at' => $this->stamp()]));
            $locationIds[] = $id;
        }
        $warehouseIds = [];
        foreach (self::WAREHOUSES as $name) {
            $id = $this->ctx->reg->nextId('warehouses');
            $warehouseIds[$name] = $id;
            $this->ctx->sql->insert('warehouses', $this->fill('warehouses', ['id' => $id, 'name' => $name, 'description' => $name, 'created_at' => $this->stamp(), 'updated_at' => $this->stamp()]));
        }
        $this->ctx->reg->remember('location_ids', $locationIds);
        $this->ctx->reg->remember('location_names', array_combine($locationIds, self::LOCATIONS));
        $this->ctx->reg->remember('warehouse_names', self::WAREHOUSES);
        $this->ctx->reg->remember('warehouse_ids', $warehouseIds);
    }

    /**
     * The tree: VP, one manager per department, one supervisor per section, reserved IT and HR staff, then generic staff.
     *
     * @param  array<int, list<int>>  $sections
     * @return list<array<string, mixed>>
     */
    private function buildPeople(array $sections): array
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $byTag = $reg->get('department_ids_by_tag');
        $positions = $reg->get('position_by_title');
        $deptIds = $reg->get('department_ids');
        $itDept = $byTag['IT'] ?? $deptIds[0];
        $hrDept = $byTag['HR'] ?? $deptIds[0];
        $headDept = $byTag['GA'] ?? $deptIds[0];

        $people = [];
        $add = function (string $kind, int $dept, ?int $section, string $title, ?int $managerIdx) use (&$people, $positions, $reg): int {
            $people[] = [
                'id' => $reg->nextId('employees'), 'kind' => $kind, 'dept' => $dept, 'section' => $section, 'title' => $title,
                'position_id' => $positions[$title], 'manager_idx' => $managerIdx, 'manager' => null, 'status' => 'active',
            ];

            return count($people) - 1;
        };

        $vp = $add('vp', $headDept, $sections[$headDept][0], 'Vice President', null);
        $managerIdx = [];
        foreach ($deptIds as $i => $deptId) {
            $managerIdx[$deptId] = $add('manager', $deptId, $sections[$deptId][0], $deptId === $itDept ? 'Manager' : self::MANAGER_TITLES[$i % 3], $vp);
        }
        $supervisorIdx = [];
        $n = 0;
        foreach ($sections as $deptId => $sectionIds) {
            foreach ($sectionIds as $sectionId) {
                $supervisorIdx[$sectionId] = $add('supervisor', $deptId, $sectionId, self::SUPERVISOR_TITLES[$n++ % 3], $managerIdx[$deptId]);
            }
        }

        $reserved = 0;
        foreach ([['it', $itDept, self::IT_USERS, self::IT_TITLES], ['hr', $hrDept, self::HR_USERS, self::HR_TITLES]] as [$kind, $deptId, $count, $titles]) {
            for ($i = 0; $i < $count; $i++) {
                $sectionId = $sections[$deptId][$i % count($sections[$deptId])];
                $add($kind, $deptId, $sectionId, $titles[$i % count($titles)], $supervisorIdx[$sectionId]);
                $reserved++;
            }
        }

        $overhead = count($people);
        $total = max($this->ctx->targets->of('employees'), $overhead + 5);
        $allSections = array_merge(...array_values($sections));
        $sectionDept = [];
        foreach ($sections as $deptId => $ids) {
            foreach ($ids as $id) {
                $sectionDept[$id] = $deptId;
            }
        }
        $extraTitles = array_values(array_filter(self::STAFF_TITLES, fn (string $t): bool => isset($positions[$t])));
        for ($i = $overhead; $i < $total; $i++) {
            $sectionId = $rng->pick($allSections);
            $title = match (true) {
                $rng->chance(0.08) => 'Leader',
                $rng->chance(0.68) => 'Staff/Officer',
                default => $rng->pick($extraTitles),
            };
            $add('staff', $sectionDept[$sectionId], $sectionId, $title, $supervisorIdx[$sectionId]);
        }

        // About a fifth of the generic staff have resigned over the three years
        $generic = array_keys(array_filter($people, fn (array $p): bool => $p['kind'] === 'staff' && $p['title'] !== 'Leader'));
        $resigned = array_slice($rng->shuffle($generic), 0, min((int) round(0.2 * $total), count($generic)));
        foreach ($resigned as $idx) {
            $people[$idx]['status'] = 'resigned';
        }
        foreach ($people as $idx => $p) {
            $people[$idx]['manager'] = $p['manager_idx'] === null ? null : $people[$p['manager_idx']]['id'];
        }

        return $people;
    }

    /** @param list<array<string, mixed>> $people */
    private function assignDates(array &$people): void
    {
        $rng = $this->ctx->rng;
        $clock = $this->ctx->clock;
        $early = CarbonImmutable::parse('2015-01-01');
        foreach ($people as &$p) {
            $p['last_day'] = null;
            $p['resign_reason'] = null;
            if ($p['status'] === 'resigned') {
                $p['last_day'] = $clock->moment($rng)->startOfDay();
                $p['joined'] = $this->dateBetween($early, $p['last_day']->subDays(90));
                $p['resign_reason'] = $rng->pick(self::RESIGN_REASONS);
            } elseif ($p['kind'] === 'staff' && $rng->chance(0.15)) {
                $p['joined'] = $clock->moment($rng)->startOfDay();
            } elseif ($p['kind'] === 'staff') {
                $p['joined'] = $this->dateBetween($early, $clock->start()->subDay());
            } else {
                $p['joined'] = $this->dateBetween($early, CarbonImmutable::parse('2021-12-31'));
            }
        }
        unset($p);
    }

    private function uniqueEmail(string $first, string $last): string
    {
        $base = strtolower($first).'.'.strtolower(substr($last, 0, 1));
        for ($n = 1; ; $n++) {
            $email = $base.($n === 1 ? '' : $n).'@perf.local';
            if (! isset($this->emails[$email])) {
                return $this->emails[$email] = $email;
            }
        }
    }

    /** @param list<array<string, mixed>> $people */
    private function writeEmployeesUsersGroups(array &$people): void
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $roles = $reg->get('role_id_by_key');
        $groups = $reg->get('group_role_ids');
        $defaultGroup = $reg->get('default_group_id');

        // Everyone with a login: IT, HR, every chain holder, then random active staff up to the target
        $needsUser = fn (array $p): bool => $p['status'] === 'active' && $p['kind'] !== 'staff';
        $withUser = count(array_filter($people, $needsUser));
        $extra = max(0, $this->ctx->targets->of('users') - 1 - $withUser);
        $candidates = $rng->shuffle(array_keys(array_filter($people, fn (array $p): bool => $p['status'] === 'active' && $p['kind'] === 'staff')));
        $extraUsers = array_flip(array_slice($candidates, 0, $extra));

        foreach ($people as $idx => &$p) {
            $p['first'] = NamePool::first($rng);
            $p['last'] = NamePool::last($rng);
            $p['code'] = 'EMP-'.$p['id'];
            $p['email'] = $this->uniqueEmail($p['first'], $p['last']);
            $p['user_id'] = ($needsUser($p) || isset($extraUsers[$idx])) ? $reg->nextId('users') : null;
            $joinedAt = $p['joined']->setTime(9, 0);
            $thai = $rng->chance(0.85);
            $this->ctx->sql->insert('employees', $this->fill('employees', [
                'id' => $p['id'], 'code' => $p['code'], 'first_name' => $p['first'], 'last_name' => $p['last'],
                'first_name_th' => $thai ? NamePool::firstTh($rng) : null, 'last_name_th' => $thai ? NamePool::lastTh($rng) : null,
                'department_id' => $p['dept'], 'section_id' => $p['section'], 'position_id' => $p['position_id'], 'manager_id' => $p['manager'],
                'email' => $p['email'], 'phone' => sprintf('08%d-%03d-%04d', $rng->int(0, 9), $rng->int(100, 999), $rng->int(1000, 9999)),
                'username' => $p['user_id'] !== null ? strstr($p['email'], '@', true) : null,
                'joined_at' => $p['joined'], 'status' => $p['status'], 'resign_reason' => $p['resign_reason'], 'last_day' => $p['last_day'],
                'created_at' => $joinedAt, 'updated_at' => $p['last_day'] ?? $joinedAt,
            ]));

            $roleId = match ($p['kind']) {
                'it' => $roles['admin'],
                'hr' => $roles['hr'],
                default => $roles['user'],
            };
            if ($p['user_id'] !== null) {
                $this->ctx->sql->insert('users', $this->fill('users', [
                    'id' => $p['user_id'], 'name' => $p['first'].' '.$p['last'], 'email' => $p['email'],
                    'username' => strstr($p['email'], '@', true), 'password' => self::PASSWORD_HASH,
                    'password_changed_at' => $this->ctx->clock->end()->subDays($rng->int(0, 14)), 'must_change_password' => 0,
                    'created_at' => $joinedAt, 'updated_at' => $joinedAt, 'employee_id' => $p['id'], 'role_id' => $roleId,
                ]));
            }
            $this->ctx->sql->insert('group_role_employee', [
                'group_role_id' => $p['user_id'] !== null ? ($groups[$roleId] ?? $defaultGroup) : $defaultGroup,
                'employee_id' => $p['id'],
            ]);
        }
        unset($p);
    }

    // Approver rows the source named someone for now point at the manager of the step's department
    /** @param list<array<string, mixed>> $people */
    private function writeApproverSlots(array &$people): void
    {
        $slots = $this->ctx->reg->get('approver_slots') ?? [];
        if ($slots === []) {
            return;
        }
        $managerByDept = [];
        foreach ($people as $p) {
            if ($p['kind'] === 'manager') {
                $managerByDept[$p['dept']] = $p['id'];
            }
        }
        $stepDept = [];
        foreach ($this->ctx->reg->get('workflow_steps') as $steps) {
            foreach ($steps as $step) {
                $stepDept[$step['id']] = $step['department_id'];
            }
        }
        foreach ($slots as $slot) {
            $employeeId = $managerByDept[$stepDept[$slot['step_id']] ?? 0] ?? $people[0]['id'];
            $this->ctx->sql->insert('workflow_step_approvers', ['id' => $slot['row_id'], 'workflow_step_id' => $slot['step_id'], 'employee_id' => $employeeId]);
        }
    }
}
