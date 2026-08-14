<?php

namespace Tests\Feature;

use App\Enums\Request\ApprovalStatus;
use App\Jobs\SendTemplatedEmail;
use App\Models\Email\EmailTemplate;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Models\User;
use Database\Seeders\EmailTemplateSeeder;
use Database\Seeders\PositionSeeder;
use Database\Seeders\RequestOptionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * The two sweeps that speak without an event: the daily bell to whoever is holding a step,
 * and the Monday mail summarising what each person has left sitting.
 */
class RequestStalledReminderTest extends TestCase
{
    use RefreshDatabase;

    private User $requester;

    private User $supUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PositionSeeder::class);
        $this->seed(RequestOptionSeeder::class);
        $this->seed(WorkflowSeeder::class);
        $this->seed(EmailTemplateSeeder::class);

        $title = fn (string $t) => Position::where('title', $t)->firstOrFail()->id;
        $mgr = Employee::create(['first_name' => 'Mgr', 'position_id' => $title('Manager')]);
        $sup = Employee::create(['first_name' => 'Sup', 'manager_id' => $mgr->id, 'position_id' => $title('Supervisor')]);
        $staff = Employee::create(['first_name' => 'Staff', 'manager_id' => $sup->id, 'position_id' => $title('Staff/Officer')]);

        $userRole = Role::firstOrCreate(['key' => 'user'], ['name' => 'Staff']);
        RolePermission::updateOrCreate(['role_id' => $userRole->id, 'permission' => 'requests.submit'], ['allowed' => true]);

        $this->requester = User::factory()->create(['role' => 'user', 'employee_id' => $staff->id]);
        $this->supUser = User::factory()->create(['role' => 'user', 'employee_id' => $sup->id, 'email' => 'sup@example.com']);
    }

    /** Grants a permission to the role the waiting approver already has. */
    private function grantToApprover(string $permission): void
    {
        RolePermission::updateOrCreate(
            ['role_id' => $this->supUser->role_id, 'permission' => $permission],
            ['allowed' => true],
        );
    }

    private function submitComputer(): ServiceRequest
    {
        $deviceId = (int) RequestOption::where('request_type', 'computer')->where('label_en', 'Laptop')->value('id');

        $response = $this->actingAs($this->requester)->postJson('/api/service-requests', [
            'type' => 'computer',
            'title' => 'New laptop for QA expansion',
            'reason' => 'The current machine can no longer run our test suite.',
            'fields' => ['device_id' => $deviceId, 'qty' => 1],
        ])->assertCreated();

        return ServiceRequest::findOrFail($response->json('data.id'));
    }

    /** Ages the request's current rung so it looks like it has been waiting. */
    private function ageCurrentRung(ServiceRequest $request, int $days): RequestApproval
    {
        $row = $request->approvals()->where('status', ApprovalStatus::Current->value)->firstOrFail();
        $row->forceFill(['became_current_at' => now()->subDays($days)])->saveQuietly();

        return $row;
    }

    /** Bells of one user carrying the given subtype. */
    private function bells(User $user, string $subtype): array
    {
        return $user->notifications()->get()
            ->filter(fn ($n) => ($n->data['subtype'] ?? null) === $subtype)
            ->values()->all();
    }

    public function test_a_step_waiting_longer_than_three_days_bells_the_approver(): void
    {
        $request = $this->submitComputer();
        $this->ageCurrentRung($request, 4);

        $this->artisan('requests:send-stalled-reminders')->assertSuccessful();

        $bells = $this->bells($this->supUser, 'stalled');
        $this->assertCount(1, $bells);
        $this->assertSame($request->reference, $bells[0]->data['reference']);
        $this->assertSame(4, $bells[0]->data['stalled_days']);
    }

    public function test_a_step_inside_the_window_is_left_alone(): void
    {
        $request = $this->submitComputer();
        $this->ageCurrentRung($request, 2);

        $this->artisan('requests:send-stalled-reminders')->assertSuccessful();

        $this->assertCount(0, $this->bells($this->supUser, 'stalled'));
    }

    /** Running every morning must not stack identical bells — the reminder replaces itself. */
    public function test_running_the_sweep_twice_leaves_one_bell(): void
    {
        $request = $this->submitComputer();
        $this->ageCurrentRung($request, 5);

        $this->artisan('requests:send-stalled-reminders');
        $this->artisan('requests:send-stalled-reminders');

        $this->assertCount(1, $this->bells($this->supUser, 'stalled'));
    }

    /** A cancelled request keeps its rung; nobody should be chased about it. */
    public function test_a_request_that_is_no_longer_open_is_not_reminded_about(): void
    {
        $request = $this->submitComputer();
        $this->ageCurrentRung($request, 9);
        $this->actingAs($this->requester)->postJson("/api/service-requests/{$request->id}/cancel")->assertOk();

        $this->artisan('requests:send-stalled-reminders')->assertSuccessful();

        $this->assertCount(0, $this->bells($this->supUser, 'stalled'));
    }

    /** An approver with no login is left alone by decision — the request simply waits. */
    public function test_an_approver_without_an_account_gets_nothing(): void
    {
        $this->supUser->delete();
        $request = $this->submitComputer();
        $this->ageCurrentRung($request, 6);

        $this->artisan('requests:send-stalled-reminders')->assertSuccessful();

        // Nothing to assert on the approver — the point is the sweep completes and sends
        // no stalled bell to anybody who cannot act.
        $this->assertSame(0, DatabaseNotification::query()->get()
            ->filter(fn ($n) => ($n->data['subtype'] ?? null) === 'stalled')->count());
    }

    public function test_the_weekly_digest_mails_one_summary_of_everything_waiting_on_a_person(): void
    {
        Queue::fake();
        $this->grantToApprover('requests.notify_stalled');

        $first = $this->submitComputer();
        $second = $this->submitComputer();
        $this->ageCurrentRung($first, 10);
        $this->ageCurrentRung($second, 8);

        $this->artisan('requests:send-stalled-digest')
            ->expectsOutputToContain('recipients: 1, requests listed: 2')
            ->assertSuccessful();

        // One mail for the person, not one per request. Filtered by template key because
        // submitting the two requests queued their own receipts along the way.
        $digests = Queue::pushed(SendTemplatedEmail::class)
            ->filter(fn (SendTemplatedEmail $job) => $job->templateKey === 'request.stalled_digest')
            ->values();

        $this->assertCount(1, $digests);
        $job = $digests->first();
        $html = (string) $job->html;

        $this->assertSame('sup@example.com', $job->toEmail);
        $this->assertStringContainsString('2 request', $job->subject);
        $this->assertStringContainsString($first->reference, $html);
        $this->assertStringContainsString($second->reference, $html);
        // Longest wait first: the older request opens the table.
        $this->assertLessThan(strpos($html, $second->reference), strpos($html, $first->reference));
        $this->assertStringContainsString('>10</td>', $html);
    }

    /** No permission, no mail — the daily bell is what everybody gets. */
    public function test_the_digest_skips_people_without_the_permission(): void
    {
        Mail::fake();
        $request = $this->submitComputer();
        $this->ageCurrentRung($request, 12);

        $this->artisan('requests:send-stalled-digest')
            ->expectsOutputToContain('recipients: 0, requests listed: 0')
            ->assertSuccessful();
    }

    /** Seven days is the digest's own threshold — three-day-old rows stay out of it. */
    public function test_the_digest_ignores_steps_younger_than_a_week(): void
    {
        Mail::fake();
        $this->grantToApprover('requests.notify_stalled');

        $request = $this->submitComputer();
        $this->ageCurrentRung($request, 4);

        $this->artisan('requests:send-stalled-digest')
            ->expectsOutputToContain('recipients: 0, requests listed: 0')
            ->assertSuccessful();
    }

    /** The digest template has to exist, or the mail path is a silent no-op. */
    public function test_the_digest_template_is_seeded(): void
    {
        $this->assertNotNull(EmailTemplate::where('key', 'request.stalled_digest')->first());
    }
}
