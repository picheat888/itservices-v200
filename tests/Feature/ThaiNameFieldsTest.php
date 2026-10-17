<?php

// The API sends Thai names (*_th) next to the English ones for stock, workflow, request bell and ticket/request reports.

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Request\ServiceRequest;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Notifications\RequestWorkflowNotification;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ThaiNameFieldsTest extends TestCase
{
    use RefreshDatabase;

    private const RANGE = 'from=2026-09-01&to=2026-09-30';

    private const THAI = 'อนันต์ หัวหน้า';

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
    }

    private function admin(?Employee $employee = null): User
    {
        return User::factory()->create(['role' => 'super', 'name' => 'Anan Boss', 'employee_id' => $employee?->id]);
    }

    private function thaiEmployee(): Employee
    {
        return Employee::create(['code' => 'EMP-A1', 'first_name' => 'Anan', 'last_name' => 'Boss', 'first_name_th' => 'อนันต์', 'last_name_th' => 'หัวหน้า']);
    }

    private function englishOnlyEmployee(): Employee
    {
        return Employee::create(['first_name' => 'Eric', 'last_name' => 'Plain']);
    }

    /** A ticket still being worked on by $assignee, opened by hand in September. */
    private function ticketHeldBy(User $assignee): Ticket
    {
        return Ticket::factory()->create([
            'requester_id' => $this->englishOnlyEmployee()->id,
            'assignee_id' => $assignee->id,
            'category' => 'hardware',
            'source' => 'manual',
            'status' => 'in_progress',
            'created_at' => '2026-09-05 09:00:00',
            'responded_at' => '2026-09-05 09:30:00',
            'sla_response_due_at' => '2026-09-05 11:00:00',
            'sla_resolve_due_at' => '2026-09-10 09:00:00',
        ]);
    }

    public function test_stock_request_carries_thai_name_keys(): void
    {
        $user = $this->admin($this->thaiEmployee());
        $item = StockItem::create(['sku' => 'SK-TH-1', 'name' => 'Cable', 'unit' => 'unit', 'cost' => 10, 'current_stock' => 5, 'min_stock' => 1, 'max_stock' => 9, 'warehouse' => 'WH-HQ']);
        StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $user->id, 'requester_name' => 'Anan Boss', 'qty' => 1, 'reason' => 'Spare',
            'status' => 'fulfilled', 'approver_name' => 'Anan Boss', 'fulfilled_by' => 'Anan Boss',
        ]);

        $row = $this->actingAs($user)->getJson('/api/stock-requests')->assertOk()->json('data.0');

        $this->assertSame(self::THAI, $row['requester_name_th']);
        // The row keeps names as text with no id, so the Thai name cannot be looked up.
        $this->assertArrayHasKey('approver_name_th', $row);
        $this->assertNull($row['approver_name_th']);
        $this->assertArrayHasKey('fulfilled_by_th', $row);
        $this->assertNull($row['fulfilled_by_th']);
    }

    public function test_stock_count_carries_the_category_thai_key(): void
    {
        $user = $this->admin();
        StockCount::create(['warehouse' => 'Main', 'category' => 'Network', 'status' => 'draft']);

        $row = $this->actingAs($user)->getJson('/api/stock-counts')->assertOk()->json('data.0');

        $this->assertArrayHasKey('category_th', $row);
        $this->assertNull($row['category_th']);
    }

    public function test_workflow_preview_names_the_approver_and_candidates_in_thai(): void
    {
        $this->seed(EmployeePositionSeeder::class);
        $this->seed(WorkflowSeeder::class);
        $title = fn (string $t) => Position::where('title', $t)->firstOrFail()->id;
        $sup = Employee::create([
            'first_name' => 'Sup', 'first_name_th' => 'อนันต์', 'last_name_th' => 'หัวหน้า', 'position_id' => $title('Supervisor'),
        ]);
        $staff = Employee::create(['first_name' => 'Staff', 'manager_id' => $sup->id, 'position_id' => $title('Staff/Officer')]);
        $plain = $this->englishOnlyEmployee();
        $dept = Department::create(['code' => 'DEP-QC', 'tag' => 'QC', 'name' => 'Quality Control']);
        User::factory()->create(['role' => 'nobody', 'employee_id' => $sup->id]);

        $rows = collect($this->actingAs($this->admin())->postJson('/api/workflows/preview', [
            'request_type' => 'computer',
            'employee_id' => $staff->id,
            'steps' => [
                ['actor_type' => 'chain', 'label' => 'Supervisor', 'kind' => 'approval', 'position_ids' => [$title('Supervisor')]],
                ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'completion'],
            ],
        ])->assertOk()->json('data.rows'));

        $this->assertSame(self::THAI, $rows->firstWhere('label', 'Supervisor')['approver_name_th']);

        $group = collect($this->actingAs($this->admin())->postJson('/api/workflows/preview', [
            'request_type' => 'computer',
            'employee_id' => $staff->id,
            'steps' => [
                ['actor_type' => 'department', 'label' => 'Named', 'kind' => 'approval', 'department_id' => $dept->id, 'approver_employee_ids' => [$sup->id, $plain->id]],
            ],
        ])->json('data.rows.0'));

        $this->assertSame([self::THAI, null], $group['approver_candidates_th']);
    }

    public function test_request_bell_payload_names_the_requester_in_thai(): void
    {
        $employee = $this->thaiEmployee();
        $request = ServiceRequest::create([
            'reference' => 'RQ-2026-0001', 'type' => 'computer', 'origin' => 'direct', 'employee_id' => $employee->id,
            'requester_name' => $employee->name, 'title' => 'Laptop', 'reason' => 'Work', 'status' => 'pending',
        ]);
        $notifiable = $this->admin();

        $data = (new RequestWorkflowNotification($request, 'submitted', 'Supervisor'))->toDatabase($notifiable);
        $this->assertSame(self::THAI, $data['requester_name_th']);

        $noThai = ServiceRequest::create([
            'reference' => 'RQ-2026-0002', 'type' => 'computer', 'origin' => 'direct', 'employee_id' => $this->englishOnlyEmployee()->id,
            'requester_name' => 'Eric Plain', 'title' => 'Mouse', 'reason' => 'Work', 'status' => 'pending',
        ]);
        $this->assertNull((new RequestWorkflowNotification($noThai, 'submitted', 'Supervisor'))->toDatabase($notifiable)['requester_name_th']);
    }

    public function test_ticket_backlog_names_the_assignee_in_thai(): void
    {
        $holder = User::factory()->create(['role' => 'super', 'name' => 'Anan Boss', 'employee_id' => $this->thaiEmployee()->id]);
        $this->ticketHeldBy($holder);

        $board = $this->actingAs($this->admin())->getJson('/api/reports/tickets/backlog/board')->assertOk()->json('data');

        $this->assertSame('Anan Boss', $board[0]['assignee']);
        $this->assertSame(self::THAI, $board[0]['assignee_th']);
    }

    public function test_a_holder_without_a_thai_name_gives_null(): void
    {
        $holder = User::factory()->create(['role' => 'super', 'name' => 'Eric Plain', 'employee_id' => $this->englishOnlyEmployee()->id]);
        $this->ticketHeldBy($holder);

        $board = $this->actingAs($this->admin())->getJson('/api/reports/tickets/backlog/board')->assertOk()->json('data');

        $this->assertArrayHasKey('assignee_th', $board[0]);
        $this->assertNull($board[0]['assignee_th']);
    }

    public function test_manual_sla_names_the_assignee_in_thai_in_groups_and_open_cases(): void
    {
        $holder = User::factory()->create(['role' => 'super', 'name' => 'Anan Boss', 'employee_id' => $this->thaiEmployee()->id]);
        $this->ticketHeldBy($holder);

        $data = $this->actingAs($this->admin())->getJson('/api/reports/tickets/manual-sla/breakdown?'.self::RANGE.'&by=assignee')->assertOk()->json('data');

        $group = collect($data['groups'])->firstWhere('key', (string) $holder->id);
        $this->assertSame(self::THAI, $group['label_th']);
        $this->assertSame(self::THAI, $data['open'][0]['assignee_th']);
    }

    public function test_it_pending_group_names_the_holder_in_thai(): void
    {
        $holder = User::factory()->create(['role' => 'super', 'name' => 'Anan Boss', 'employee_id' => $this->thaiEmployee()->id]);
        $ticket = Ticket::factory()->create(['status' => 'in_progress', 'assignee_id' => $holder->id]);
        ServiceRequest::create([
            'reference' => 'RQ-2026-0001', 'type' => 'computer', 'origin' => 'direct', 'requester_name' => 'Somchai',
            'title' => 'Laptop', 'reason' => 'Work', 'status' => 'approved', 'approved_at' => '2026-09-10 09:00:00', 'ticket_id' => $ticket->id,
        ]);

        $groups = $this->actingAs($this->admin())->getJson('/api/reports/requests/it-pending/breakdown')->assertOk()->json('data.by_assignee');

        $this->assertSame('Anan Boss', $groups[0]['name']);
        $this->assertSame(self::THAI, $groups[0]['name_th']);
    }

    public function test_ticket_overview_staff_rows_and_report_rows_name_the_assignee_in_thai(): void
    {
        $holder = User::factory()->create(['role' => 'super', 'name' => 'Anan Boss', 'employee_id' => $this->thaiEmployee()->id]);
        Ticket::factory()->create([
            'requester_id' => $this->englishOnlyEmployee()->id, 'assignee_id' => $holder->id, 'category' => 'hardware',
            'status' => 'completed', 'created_at' => '2026-09-05 09:00:00', 'resolved_at' => '2026-09-06 09:00:00',
        ]);

        $admin = $this->admin();
        $summary = $this->actingAs($admin)->getJson('/api/reports/tickets/overview?'.self::RANGE)->assertOk()->json('data');
        $rows = $this->actingAs($admin)->getJson('/api/reports/tickets/overview/rows?'.self::RANGE)->assertOk()->json('data');

        $this->assertSame(self::THAI, $summary['by_assignee'][0]['name_th']);
        $this->assertSame(self::THAI, $rows[0]['assignee_name_th']);
    }
}
