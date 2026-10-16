<?php

namespace Tests\Feature\Perf;

use Database\Seeders\DatabaseSeeder;
use Database\Seeders\EmployeeDepartmentSeeder;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\EmployeeSectionSeeder;
use Database\Seeders\MasterDataSeeder;
use Illuminate\Database\Connection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

// End-to-end checks on a whole generated dataset: coverage, references, time range and repeatability
class PerfDatasetInvariantsTest extends TestCase
{
    use RefreshDatabase;

    private const RUNTIME = ['sessions', 'cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs', 'password_reset_tokens', 'personal_access_tokens', 'mail_settings'];

    // Empty at this tiny scale or empty in the source configuration itself
    private const MAY_BE_EMPTY = ['report_pins', 'workflow_step_approvers', 'contract_alert_logs', 'contract_bell_logs', 'stock_alert_logs'];

    private Connection $db;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([EmployeeDepartmentSeeder::class, EmployeePositionSeeder::class, EmployeeSectionSeeder::class, MasterDataSeeder::class, DatabaseSeeder::class]);
    }

    private function generate(int $seed = 5, float $scale = 0.02): string
    {
        $path = sys_get_temp_dir().DIRECTORY_SEPARATOR.'perf_full_'.uniqid().'.sql';
        $this->artisan('perf:generate', ['--out' => $path, '--scale' => $scale, '--seed' => $seed])->assertSuccessful();

        return $path;
    }

    public function test_every_business_table_has_rows(): void
    {
        $db = PerfImport::into($this->generate());

        $empty = [];
        foreach (Schema::connection('perf_sqlite')->getTableListing() as $table) {
            $table = preg_replace('/^.*\./', '', $table);
            if (in_array($table, [...self::RUNTIME, ...self::MAY_BE_EMPTY], true)) {
                continue;
            }
            $db->table($table)->count() === 0 && $empty[] = $table;
        }
        $this->assertSame([], $empty, 'tables with no rows: '.implode(', ', $empty));
        foreach (self::RUNTIME as $table) {
            $this->assertSame(0, $db->table($table)->count(), "{$table} must stay empty");
        }
    }

    public function test_foreign_keys_point_at_existing_rows(): void
    {
        $this->db = PerfImport::into($this->generate());
        $refs = [
            ['tickets', 'requester_id', 'employees'], ['tickets', 'assignee_id', 'users'], ['tickets', 'related_asset_id', 'assets'],
            ['ticket_updates', 'ticket_id', 'tickets'], ['ticket_attachments', 'ticket_id', 'tickets'],
            ['service_requests', 'employee_id', 'employees'], ['service_requests', 'workflow_id', 'workflows'], ['service_requests', 'ticket_id', 'tickets'],
            ['request_approvals', 'service_request_id', 'service_requests'], ['request_approvals', 'approver_employee_id', 'employees'],
            ['stock_movements', 'stock_item_id', 'stock_items'], ['stock_lots', 'stock_movement_id', 'stock_movements'], ['stock_balances', 'warehouse_id', 'warehouses'],
            ['stock_requests', 'stock_item_id', 'stock_items'], ['stock_count_lines', 'stock_count_id', 'stock_counts'],
            ['access_memberships', 'employee_id', 'employees'], ['notifications', 'notifiable_id', 'users'],
            ['assets', 'contract_id', 'contracts'], ['assets', 'category_id', 'categories'], ['assets', 'model_id', 'asset_models'], ['assets', 'owner_employee_id', 'employees'],
            ['asset_transfers', 'asset_id', 'assets'], ['contracts', 'vendor_id', 'vendors'], ['employees', 'manager_id', 'employees'],
            ['employees', 'position_id', 'positions'], ['employees', 'department_id', 'departments'], ['employees', 'section_id', 'sections'],
            ['users', 'employee_id', 'employees'], ['users', 'role_id', 'roles'], ['group_role_employee', 'employee_id', 'employees'],
        ];
        foreach ($refs as [$table, $column, $target]) {
            $orphans = $this->db->table($table)->whereNotNull($column)->whereNotIn($column, $this->db->table($target)->select('id'))->count();
            $this->assertSame(0, $orphans, "{$table}.{$column} has rows pointing nowhere in {$target}");
        }
    }

    public function test_no_row_in_the_future_and_every_month_covered(): void
    {
        $db = PerfImport::into($this->generate());

        foreach (['tickets' => 'created_at', 'service_requests' => 'created_at', 'audit_logs' => 'created_at', 'notifications' => 'created_at', 'email_logs' => 'created_at', 'stock_movements' => 'moved_at', 'asset_transfers' => 'created_at', 'access_memberships' => 'granted_at'] as $table => $column) {
            $this->assertNull($db->table($table)->where($column, '>', '2026-10-16 08:00:00')->value('id'), "{$table}.{$column} has a row after the end moment");
        }
        $months = $db->table('tickets')->pluck('created_at')->map(fn ($t) => substr($t, 0, 7))->unique();
        $this->assertCount(36, $months);
        $this->assertSame(0, $db->table('tickets')->whereColumn('updated_at', '<', 'created_at')->count());
    }

    public function test_same_seed_gives_identical_files(): void
    {
        $first = $this->generate(5, 0.01);
        $second = $this->generate(5, 0.01);
        $other = $this->generate(6, 0.01);

        $this->assertSame(sha1_file($first), sha1_file($second));
        $this->assertNotSame(sha1_file($first), sha1_file($other));
    }

    public function test_workflow_positions_have_active_holders(): void
    {
        $db = PerfImport::into($this->generate());

        $held = $db->table('employees')->where('status', 'active')->pluck('position_id')->unique()->all();
        foreach ($db->table('workflow_step_positions')->pluck('position_id')->unique() as $positionId) {
            $this->assertContains($positionId, $held, "no active employee holds position {$positionId}");
        }
    }
}
