<?php

namespace App\Support\Perf;

use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

/** Perf step 1: copies configuration and master data from the source database, then extends departments and positions. */
class Copy implements PerfStep
{
    private const TABLES = [
        'migrations', 'roles', 'role_permissions', 'app_settings', 'email_templates', 'notification_templates',
        'request_options', 'sla_targets', 'workflows', 'workflow_steps', 'workflow_step_positions',
        'units', 'warranty_types', 'writeoff_reasons', 'categories', 'departments', 'positions', 'group_roles',
    ];

    private const NO_ID = ['workflow_step_positions'];

    private const EXTRA_POSITIONS = [
        'Senior Staff', 'Specialist', 'Engineer', 'Senior Engineer', 'Technician', 'Analyst',
        'Coordinator', 'Assistant', 'Operator', 'Trainee', 'Consultant',
    ];

    private const EXTRA_DEPARTMENTS = [
        'Logistics' => 'LOG', 'Procurement' => 'PRC', 'Marketing' => 'MKT',
        'Research & Development' => 'RND', 'Customer Service' => 'CSV', 'Facilities' => 'FAC',
    ];

    // Asset kind => the category name the master data already carries
    private const KIND_CATEGORY = [
        'laptop' => 'Laptop', 'desktop' => 'Desktop', 'printer' => 'Printer', 'network' => 'Switch / Router',
        'mobile' => 'Phone', 'server' => 'Server', 'cctv' => 'CCTV', 'other' => 'Other equipment',
    ];

    private Connection $db;

    private PerfContext $ctx;

    public function run(PerfContext $ctx): void
    {
        $this->ctx = $ctx;
        $this->db = DB::connection($ctx->sourceConnection);

        $adminUser = $this->adminUser();
        $adminId = (int) $adminUser['id'];
        $adminEmployeeId = $adminUser['employee_id'] !== null ? (int) $adminUser['employee_id'] : null;

        foreach (self::TABLES as $table) {
            $this->copyTable($table);
        }
        $this->copyPins($adminId);
        $this->copyApprovers($adminEmployeeId);
        $this->copyAdmin($adminUser);

        $this->extendDepartments();
        $this->extendPositions();

        $this->remember($adminId, $adminEmployeeId);
    }

    /** @return array<string, mixed> */
    private function adminUser(): array
    {
        $superId = $this->db->table('roles')->where('key', 'super')->value('id');
        $user = $this->db->table('users')->where('role_id', $superId)->orderBy('id')->first();
        if ($user === null) {
            throw new RuntimeException('No super administrator user to copy; run the standard seeder first.');
        }

        return (array) $user;
    }

    private function rowsOf(string $table): array
    {
        $query = $this->db->table($table);
        if (! in_array($table, self::NO_ID, true)) {
            $query->orderBy('id');
        }

        return $query->get()->map(fn (object $r): array => (array) $r)->all();
    }

    private function copyTable(string $table): void
    {
        $this->ctx->sql->clear($table);
        $max = 0;
        foreach ($this->rowsOf($table) as $row) {
            $this->ctx->sql->insert($table, $row);
            $max = max($max, (int) ($row['id'] ?? 0));
        }
        $this->ctx->reg->seedId($table, $max);
    }

    // Only the administrator's own pins come across
    private function copyPins(int $adminId): void
    {
        $this->ctx->sql->clear('report_pins');
        foreach ($this->db->table('report_pins')->where('user_id', $adminId)->orderBy('id')->get() as $row) {
            $this->ctx->sql->insert('report_pins', (array) $row);
        }
        $this->ctx->reg->seedId('report_pins', (int) $this->db->table('report_pins')->max('id'));
    }

    // Approver rows naming anyone but the administrator are held back for Org to re-point
    private function copyApprovers(?int $adminEmployeeId): void
    {
        $this->ctx->sql->clear('workflow_step_approvers');
        $slots = [];
        foreach ($this->rowsOf('workflow_step_approvers') as $row) {
            if ($adminEmployeeId !== null && (int) $row['employee_id'] === $adminEmployeeId) {
                $this->ctx->sql->insert('workflow_step_approvers', $row);
            } else {
                $slots[] = ['row_id' => (int) $row['id'], 'step_id' => (int) $row['workflow_step_id']];
            }
        }
        $this->ctx->reg->seedId('workflow_step_approvers', (int) $this->db->table('workflow_step_approvers')->max('id'));
        $this->ctx->reg->remember('approver_slots', $slots);
    }

    /** @param array<string, mixed> $user */
    private function copyAdmin(array $user): void
    {
        $this->ctx->sql->clear('users');
        $this->ctx->sql->clear('employees');
        if ($user['employee_id'] !== null) {
            $employee = (array) $this->db->table('employees')->where('id', $user['employee_id'])->first();
            $employee['manager_id'] = null;
            $employee['section_id'] = null;
            $this->ctx->sql->insert('employees', $employee);
            $this->ctx->reg->seedId('employees', (int) $employee['id']);
        }
        $this->ctx->sql->insert('users', $user);
        $this->ctx->reg->seedId('users', (int) $user['id']);
    }

    /** @return array<string, mixed> a row of the table with every column null */
    private function blank(string $table): array
    {
        $now = $this->ctx->clock->start()->format('Y-m-d H:i:s');
        $row = array_fill_keys(Schema::connection($this->ctx->sourceConnection)->getColumnListing($table), null);
        foreach (['created_at', 'updated_at'] as $stamp) {
            if (array_key_exists($stamp, $row)) {
                $row[$stamp] = $now;
            }
        }

        return $row;
    }

    // Column order must match the rows already written, so reorder to the first row's keys
    private function match(string $table, array $row): array
    {
        $first = $this->db->table($table)->orderBy('id')->first();
        $order = $first !== null ? array_keys((array) $first) : array_keys($row);

        return array_replace(array_fill_keys($order, null), array_intersect_key($row, array_flip($order)));
    }

    private function extendDepartments(): void
    {
        $have = $this->db->table('departments')->pluck('name')->all();
        $missing = array_diff_key(self::EXTRA_DEPARTMENTS, array_flip($have));
        $need = $this->ctx->targets->fixed('departments') - count($have);
        foreach (array_slice($missing, 0, max(0, $need), true) as $name => $tag) {
            $id = $this->ctx->reg->nextId('departments');
            $this->ctx->sql->insert('departments', $this->match('departments', [
                ...$this->blank('departments'), 'id' => $id, 'code' => sprintf('DEP-%04d', $id), 'tag' => $tag, 'name' => $name, 'name_th' => $name,
            ]));
            $this->added['departments'][$id] = $name;
        }
    }

    private function extendPositions(): void
    {
        $have = $this->db->table('positions')->pluck('title')->all();
        $need = $this->ctx->targets->fixed('positions') - count($have);
        foreach (array_slice(array_values(array_diff(self::EXTRA_POSITIONS, $have)), 0, max(0, $need)) as $title) {
            $id = $this->ctx->reg->nextId('positions');
            $this->ctx->sql->insert('positions', $this->match('positions', [
                ...$this->blank('positions'), 'id' => $id, 'code' => sprintf('PST-%04d', $id), 'title' => $title, 'allow_special_position' => 0,
            ]));
            $this->added['positions'][$id] = $title;
        }
    }

    /** @var array<string, array<int, string>> rows this step added, by table */
    private array $added = ['departments' => [], 'positions' => []];

    private function remember(int $adminId, ?int $adminEmployeeId): void
    {
        $reg = $this->ctx->reg;
        $reg->remember('admin_user_id', $adminId);
        $reg->remember('admin_employee_id', $adminEmployeeId);

        $reg->remember('department_ids', array_values(array_merge($this->db->table('departments')->pluck('id')->all(), array_keys($this->added['departments']))));
        $positions = $this->db->table('positions')->pluck('title', 'id')->all() + $this->added['positions'];
        $reg->remember('position_by_title', array_flip($positions));

        $byName = $this->db->table('categories')->pluck('id', 'name')->all();
        $kinds = [];
        foreach (self::KIND_CATEGORY as $kind => $name) {
            if (! isset($byName[$name])) {
                throw new RuntimeException("Category '{$name}' is missing; run MasterDataSeeder on the source database.");
            }
            $kinds[$kind] = (int) $byName[$name];
        }
        $reg->remember('category_by_kind', $kinds);

        $reg->remember('role_id_by_key', array_map('intval', $this->db->table('roles')->pluck('id', 'key')->all()));
        $reg->remember('default_group_id', (int) $this->db->table('app_settings')->where('key', 'default_employee_group_id')->value('value'));
        $groups = [];
        foreach ($this->db->table('group_roles')->orderBy('id')->get() as $g) {
            $groups[(int) $g->role_id] ??= (int) $g->id;
        }
        $reg->remember('group_role_ids', $groups);

        $reg->remember('email_template_keys', $this->db->table('email_templates')->pluck('key')->all());
        $reg->remember('sla_targets', $this->rowsOf('sla_targets'));
        $reg->remember('request_options', $this->rowsOf('request_options'));
        $reg->remember('unit_ids', array_map('intval', $this->db->table('units')->pluck('id')->all()));
        $reg->remember('warranty_type_ids', array_map('intval', $this->db->table('warranty_types')->pluck('id')->all()));
        $reg->remember('writeoff_reason_ids', array_map('intval', $this->db->table('writeoff_reasons')->pluck('id')->all()));

        $this->rememberWorkflows();
    }

    private function rememberWorkflows(): void
    {
        $positionIds = [];
        foreach ($this->db->table('workflow_step_positions')->get() as $r) {
            $positionIds[(int) $r->workflow_step_id][] = (int) $r->position_id;
        }
        $approverIds = [];
        foreach ($this->db->table('workflow_step_approvers')->get() as $r) {
            $approverIds[(int) $r->workflow_step_id][] = (int) $r->employee_id;
        }

        $steps = [];
        $auto = [];
        foreach ($this->db->table('workflows')->orderBy('id')->get() as $wf) {
            $auto[$wf->request_type] = (bool) $wf->auto_ticket;
            $steps[$wf->request_type] = [];
            foreach ($this->db->table('workflow_steps')->where('workflow_id', $wf->id)->orderBy('position')->get() as $s) {
                $steps[$wf->request_type][] = [
                    'id' => (int) $s->id, 'position' => (int) $s->position, 'actor_type' => $s->actor_type,
                    'department_id' => $s->department_id !== null ? (int) $s->department_id : null,
                    'label' => $s->label, 'kind' => $s->kind,
                    'position_ids' => $positionIds[(int) $s->id] ?? [],
                    'approver_employee_ids' => $approverIds[(int) $s->id] ?? [],
                ];
            }
        }
        $this->ctx->reg->remember('workflow_steps', $steps);
        $this->ctx->reg->remember('workflow_auto_ticket', $auto);
        $this->ctx->reg->remember('workflow_ids', array_map('intval', $this->db->table('workflows')->pluck('id', 'request_type')->all()));
    }
}
