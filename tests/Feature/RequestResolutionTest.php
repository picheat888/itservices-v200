<?php

namespace Tests\Feature;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\ApprovalStatus;
use App\Models\Access\FileShare;
use App\Models\Employee\Employee;
use App\Models\User;
use App\Models\Workflow\Workflow;
use App\Services\Request\WorkflowResolverService;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Tests\TestCase;

/**
 * WorkflowResolverService: how workflow steps freeze into concrete approval
 * rows — positional chain resolution, short-chain merging, skip rules, and
 * owner resolution from Access resources.
 */
class RequestResolutionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(WorkflowSeeder::class);
    }

    /** An active employee with a linked login (eligible as an approver). */
    private function employee(string $name, ?int $managerId = null): Employee
    {
        $employee = Employee::create(['first_name' => $name, 'manager_id' => $managerId]);
        User::factory()->create(['role' => 'user', 'employee_id' => $employee->id]);

        return $employee;
    }

    private function resolve(string $type, Employee $requester, array $fields = []): Collection
    {
        $workflow = Workflow::where('request_type', $type)->firstOrFail();

        return app(WorkflowResolverService::class)->resolve($workflow, $requester, $fields);
    }

    public function test_chain_steps_resolve_positionally_along_the_manager_line(): void
    {
        $vp = $this->employee('Vp');
        $mgr = $this->employee('Mgr', $vp->id);
        $sup = $this->employee('Sup', $mgr->id);
        $staff = $this->employee('Staff', $sup->id);

        // social: 3 chain approvals + IT fulfillment
        $rows = $this->resolve('social', $staff);

        $this->assertCount(4, $rows);
        $this->assertSame(['Sup', 'Mgr', 'Vp'], $rows->take(3)->pluck('approver_name')->all());
        $this->assertSame('it_staff', $rows->last()['actor_type']);
        $this->assertNull($rows->last()['approver_employee_id']);
    }

    public function test_short_chain_merges_trailing_steps_into_the_last_manager(): void
    {
        $boss = $this->employee('Boss');
        $staff = $this->employee('Staff', $boss->id);

        // social has 3 chain steps but the line has only one manager.
        $rows = $this->resolve('social', $staff);

        $this->assertCount(2, $rows); // merged approval + fulfillment
        $merged = $rows->first();
        $this->assertSame($boss->id, $merged['approver_employee_id']);
        $this->assertSame('Supervisor / Head · Manager / Asst. Manager · Vice President', $merged['label']);
        $this->assertSame(2.0, $merged['sla_days']); // max of 1, 1, 2
        $this->assertSame(1, $merged['position']);
        // The row says it is doing more than one job, so a chain that shows as
        // "0/1" can be explained without reading the database.
        $this->assertStringContainsString('Also covers', $merged['note']);
        $this->assertStringContainsString('Vice President', $merged['note']);
        $this->assertSame(2, $rows->last()['position']);
    }

    public function test_no_manager_collapses_the_chain_into_one_skipped_row(): void
    {
        $solo = $this->employee('Solo');

        $rows = $this->resolve('computer', $solo);

        $skipped = $rows->first();
        $this->assertSame(ApprovalStatus::Skipped->value, $skipped['status']);
        $this->assertNull($skipped['approver_employee_id']);
        $this->assertStringContainsString('no manager', $skipped['note']);
        $this->assertSame('it_staff', $rows->last()['actor_type']);
    }

    public function test_a_manager_without_a_login_keeps_the_step_and_the_request_waits(): void
    {
        $vp = $this->employee('Vp');
        $noAccount = Employee::create(['first_name' => 'NoAccount', 'manager_id' => $vp->id]); // account not provisioned yet
        $staff = $this->employee('Staff', $noAccount->id);

        $rows = $this->resolve('computer', $staff); // 2 chain steps

        // The step belongs to the actual manager and waits until they can sign in.
        // Passing it over their head to the VP would be an approval they never gave.
        $this->assertSame($noAccount->id, $rows->first()['approver_employee_id']);
        $this->assertSame(ApprovalStatus::Waiting->value, $rows->first()['status']);
        $this->assertSame($vp->id, $rows->get(1)['approver_employee_id']);
        // The missing account is NOT written onto the row: it stops being true the
        // moment the account is created, and a snapshot would keep claiming it.
        $this->assertNull($rows->first()['note']);
    }

    public function test_a_resigned_manager_is_passed_over(): void
    {
        $vp = $this->employee('Vp');
        $gone = Employee::create(['first_name' => 'Gone', 'manager_id' => $vp->id, 'status' => EmployeeStatus::Resigned]);
        $staff = $this->employee('Staff', $gone->id);

        $rows = $this->resolve('computer', $staff);

        // Nobody is coming back to approve this one, so the line continues upward —
        // the opposite of an account that simply has not been created yet.
        $this->assertSame($vp->id, $rows->first()['approver_employee_id']);
    }

    public function test_owner_step_resolves_from_the_selected_resource(): void
    {
        $owner = $this->employee('Owner');
        $boss = $this->employee('Boss');
        $staff = $this->employee('Staff', $boss->id);
        $share = FileShare::create(['code' => 'FS-T1', 'name' => 'QA Share', 'path' => '\\\\FILES\\QA', 'owner_employee_id' => $owner->id]);

        $rows = $this->resolve('fileshare', $staff, ['file_share_id' => $share->id]);

        $this->assertSame($owner->id, $rows->first()['approver_employee_id']);
        $this->assertSame(ApprovalStatus::Waiting->value, $rows->first()['status']);
    }

    public function test_owner_step_is_skipped_when_unresolvable_or_self(): void
    {
        $boss = $this->employee('Boss');
        $staff = $this->employee('Staff', $boss->id);

        // No owner on the resource.
        $orphan = FileShare::create(['code' => 'FS-T2', 'name' => 'Orphan', 'path' => '\\\\FILES\\ORPHAN']);
        $rows = $this->resolve('fileshare', $staff, ['file_share_id' => $orphan->id]);
        $this->assertSame(ApprovalStatus::Skipped->value, $rows->first()['status']);

        // Requester owns the resource themself.
        $own = FileShare::create(['code' => 'FS-T3', 'name' => 'Own', 'path' => '\\\\FILES\\OWN', 'owner_employee_id' => $staff->id]);
        $rows = $this->resolve('fileshare', $staff, ['file_share_id' => $own->id]);
        $this->assertSame(ApprovalStatus::Skipped->value, $rows->first()['status']);
        $this->assertStringContainsString('requester is the resource owner', $rows->first()['note']);
    }
}
