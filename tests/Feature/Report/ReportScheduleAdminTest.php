<?php

// An admin with reports.schedule_manage sees everyone's scheduled reports and can pause, delete
// or take a recipient off; owners are not belled, every change is audit-logged.

namespace Tests\Feature\Report;

use App\Models\AuditLog;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Report\ReportSchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

class ReportScheduleAdminTest extends TestCase
{
    use GrantsReports;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-10-19 10:00:00');
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions, array $attributes = []): User
    {
        $role = Role::create(['key' => 'sm_'.uniqid(), 'name' => 'Schedule Admin', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key, ...$attributes]);
    }

    private function admin(): User
    {
        return $this->userWith(['reports.module', 'reports.schedule_manage']);
    }

    /** @param list<string> $recipients */
    private function schedule(User $owner, array $recipients): ReportSchedule
    {
        return ReportSchedule::create([
            'user_id' => $owner->id, 'report_key' => 'assets.overview', 'format' => 'xlsx', 'filters' => [],
            'frequency' => ReportSchedule::WEEKLY, 'send_hour' => 7, 'recipients' => $recipients,
            'active' => true, 'next_run_at' => '2026-10-20 07:00:00',
        ]);
    }

    public function test_without_the_right_every_admin_endpoint_is_refused(): void
    {
        $owner = $this->userWith([...$this->reportRights('assets')]);
        $schedule = $this->schedule($owner, ['a@example.com', 'b@example.com']);
        $this->actingAs($owner);

        $this->getJson('/api/reports/schedules/manage')->assertForbidden();
        $this->patchJson("/api/reports/schedules/{$schedule->id}/manage", ['active' => false])->assertForbidden();
        $this->deleteJson("/api/reports/schedules/{$schedule->id}/manage")->assertForbidden();
        $this->deleteJson("/api/reports/schedules/{$schedule->id}/recipients?email=a@example.com")->assertForbidden();
        $this->assertTrue($schedule->refresh()->active);
    }

    public function test_the_admin_sees_everyones_schedules_with_owner_and_which_recipients_have_an_account(): void
    {
        $department = Department::create(['code' => 'D-AC', 'name' => 'Accounting', 'name_th' => 'ฝ่ายบัญชี']);
        $employee = Employee::create(['code' => 'EMP-1', 'first_name' => 'Wanna', 'last_name' => 'Sri', 'department_id' => $department->id]);
        $owner = $this->userWith([...$this->reportRights('assets')], ['name' => 'Wanna Sri', 'employee_id' => $employee->id]);
        $this->userWith([], ['email' => 'Finance@Inaba.test']);
        $this->schedule($owner, ['finance@inaba.test', 'auditor@partner.co.th']);
        $this->schedule($this->userWith([...$this->reportRights('assets')]), ['x@example.com']);

        $data = $this->actingAs($this->admin())->getJson('/api/reports/schedules/manage')->assertOk()->json('data');

        $this->assertCount(2, $data);
        $row = collect($data)->firstWhere('owner.name', 'Wanna Sri');
        $this->assertSame(['name' => 'Accounting', 'name_th' => 'ฝ่ายบัญชี'], $row['owner']['department']);
        $this->assertSame([
            ['email' => 'finance@inaba.test', 'has_account' => true],
            ['email' => 'auditor@partner.co.th', 'has_account' => false],
        ], $row['recipient_list']);
    }

    public function test_the_admin_pauses_and_resumes_and_it_is_audit_logged_without_belling_the_owner(): void
    {
        $owner = $this->userWith([...$this->reportRights('assets')]);
        $schedule = $this->schedule($owner, ['a@example.com']);
        $this->actingAs($this->admin());

        $this->patchJson("/api/reports/schedules/{$schedule->id}/manage", ['active' => false])->assertOk()->assertJsonPath('data.active', false);
        $this->patchJson("/api/reports/schedules/{$schedule->id}/manage", ['active' => true])->assertOk()->assertJsonPath('data.active', true);

        $this->assertSame(['Paused scheduled report', 'Resumed scheduled report'], AuditLog::query()->orderBy('id')->pluck('action')->all());
        $this->assertSame($schedule->id, AuditLog::query()->first()->details['schedule_id']);
        $this->assertSame(0, DatabaseNotification::query()->count());
        $this->patchJson("/api/reports/schedules/{$schedule->id}/manage", [])->assertUnprocessable();
    }

    public function test_the_admin_deletes_anyones_schedule(): void
    {
        $schedule = $this->schedule($this->userWith([...$this->reportRights('assets')]), ['a@example.com']);

        $this->actingAs($this->admin())->deleteJson("/api/reports/schedules/{$schedule->id}/manage")->assertOk();

        $this->assertNull(ReportSchedule::find($schedule->id));
        $this->assertSame('Deleted scheduled report', AuditLog::query()->sole()->action);
    }

    public function test_the_admin_takes_one_recipient_off_but_never_the_last(): void
    {
        $schedule = $this->schedule($this->userWith([...$this->reportRights('assets')]), ['keep@example.com', 'Audit@Partner.co.th']);
        $this->actingAs($this->admin());

        $this->deleteJson("/api/reports/schedules/{$schedule->id}/recipients?email=audit@partner.co.th")
            ->assertOk()
            ->assertJsonPath('data.recipients', ['keep@example.com']);
        $log = AuditLog::query()->sole();
        $this->assertSame(['Removed scheduled report recipient', 'audit@partner.co.th'], [$log->action, $log->details['recipient']]);

        $this->deleteJson("/api/reports/schedules/{$schedule->id}/recipients?email=nobody@example.com")->assertNotFound()->assertJsonPath('message', 'recipient_missing');
        $this->deleteJson("/api/reports/schedules/{$schedule->id}/recipients?email=keep@example.com")->assertUnprocessable()->assertJsonPath('message', 'last_recipient');
        $this->assertSame(['keep@example.com'], $schedule->refresh()->recipients);
        $this->assertSame(0, DatabaseNotification::query()->count());
    }
}
