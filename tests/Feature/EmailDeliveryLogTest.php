<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Email\EmailLog;
use App\Models\Email\EmailTemplate;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Services\Email\EmailNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Who the system could and could not email, and the screen that shows it.
 *
 * Every service used to check `if (! $user->email)` and return where it stood, so a person
 * who never heard about their own request left no trace anywhere. That decision now lives in
 * EmailNotificationService, which writes a `skipped` row instead of forgetting.
 */
class EmailDeliveryLogTest extends TestCase
{
    use RefreshDatabase;

    private function template(string $key = 'test.template', bool $enabled = true): EmailTemplate
    {
        return EmailTemplate::updateOrCreate(
            ['key' => $key],
            [
                'name' => 'Test template',
                'subject' => 'Hello {{user.first_name}}',
                'body_html' => '<p>Body</p>',
                'enabled' => $enabled,
                'cadence' => 'realtime',
            ],
        );
    }

    private function service(): EmailNotificationService
    {
        return app(EmailNotificationService::class);
    }

    public function test_a_recipient_with_no_address_is_logged_instead_of_dropped(): void
    {
        Queue::fake();
        $this->template();

        $this->service()->sendTemplate('test.template', null, ['user.first_name' => 'Manee'], null, null, 'Manee Jaidee');

        $log = EmailLog::where('status', 'skipped')->firstOrFail();
        $this->assertSame('test.template', $log->template_key);
        $this->assertNull($log->to_email);
        $this->assertSame('Manee Jaidee', $log->recipient_name);
        $this->assertSame('Recipient has no email address', $log->error);
        // Nothing was queued: there was nowhere to send it.
        Queue::assertNothingPushed();
    }

    public function test_a_recipient_with_an_address_is_queued_and_not_logged_as_skipped(): void
    {
        Queue::fake();
        $this->template();

        $this->service()->sendTemplate('test.template', 'manee@example.com', [], null, null, 'Manee Jaidee');

        $this->assertSame(0, EmailLog::where('status', 'skipped')->count());
        Queue::assertPushed(SendTemplatedEmail::class, fn (SendTemplatedEmail $job) => $job->toEmail === 'manee@example.com'
            && $job->recipientName === 'Manee Jaidee');
    }

    /** A template the administrator switched off is their decision, not a delivery failure. */
    public function test_a_disabled_template_writes_no_log_row(): void
    {
        Queue::fake();
        $this->template('test.template', enabled: false);

        $this->service()->sendTemplate('test.template', null, [], null, null, 'Manee Jaidee');

        $this->assertSame(0, EmailLog::count());
    }

    /** The name travels with the queued job so the delivered row can say who it went to. */
    public function test_delivery_records_the_recipient_name(): void
    {
        $this->service()->deliver('manee@example.com', 'Subject', '<p>Body</p>', 'test.template', null, null, null, 'Manee Jaidee');

        $log = EmailLog::firstOrFail();
        $this->assertSame('Manee Jaidee', $log->recipient_name);
        $this->assertSame('manee@example.com', $log->to_email);
    }

    /** A user whose role grants exactly the given permission. */
    private function userWith(string $permission): User
    {
        $role = Role::firstOrCreate(['key' => 'log_reader'], ['name' => 'Log Reader']);
        RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => $permission], ['allowed' => true]);

        return User::factory()->create(['role' => 'log_reader']);
    }

    public function test_the_log_endpoint_lists_newest_first_with_whole_log_counts(): void
    {
        $this->actingAs($this->userWith('system.configure_notifications'));

        EmailLog::create(['template_key' => 'a', 'to_email' => 'a@example.com', 'subject' => 'A', 'status' => 'sent']);
        EmailLog::create(['template_key' => 'b', 'to_email' => null, 'recipient_name' => 'Manee', 'subject' => 'B', 'status' => 'skipped']);
        EmailLog::create(['template_key' => 'c', 'to_email' => 'c@example.com', 'subject' => 'C', 'status' => 'failed', 'error' => 'SMTP down']);

        $response = $this->getJson('/api/email-logs')->assertOk();

        $this->assertCount(3, $response->json('data'));
        $this->assertSame('c', $response->json('data.0.template_key'));
        $this->assertSame(['sent' => 1, 'failed' => 1, 'skipped' => 1], $response->json('meta.counts'));
    }

    public function test_the_log_endpoint_filters_by_status_and_searches_the_recipient(): void
    {
        $this->actingAs($this->userWith('system.configure_notifications'));

        EmailLog::create(['template_key' => 'a', 'to_email' => 'a@example.com', 'subject' => 'A', 'status' => 'sent']);
        EmailLog::create(['template_key' => 'b', 'to_email' => null, 'recipient_name' => 'Manee Jaidee', 'subject' => 'B', 'status' => 'skipped']);

        $this->getJson('/api/email-logs?status=skipped')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.recipient_name', 'Manee Jaidee')
            // Counts stay whole-log even while the list is filtered.
            ->assertJsonPath('meta.counts.sent', 1);

        $this->getJson('/api/email-logs?search=Manee')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.template_key', 'b');
    }

    /** Delivery writes the message it sent, not just the fact that it sent one. */
    public function test_the_sent_message_is_kept_on_the_log_row(): void
    {
        $this->service()->deliver('manee@example.com', 'Subject', '<p>Hi Manee</p>', 'test.template');

        $this->assertSame('<p>Hi Manee</p>', EmailLog::firstOrFail()->body_html);
    }

    /** A message nobody could receive is still worth keeping: it is what they missed. */
    public function test_a_skipped_send_keeps_what_would_have_been_sent(): void
    {
        Queue::fake();
        $this->template();

        $this->service()->sendTemplate('test.template', null, ['user.first_name' => 'Manee'], null, null, 'Manee Jaidee');

        $log = EmailLog::where('status', 'skipped')->firstOrFail();
        $this->assertSame('<p>Body</p>', $log->body_html);
        // Branded like every delivered mail: a skipped row that stored the bare subject made
        // the same email look like two different ones in the log.
        $this->assertStringStartsWith('[', $log->subject);
        $this->assertStringContainsString('Hello Manee', $log->subject);
    }

    public function test_the_detail_endpoint_rebuilds_the_email_around_the_stored_message(): void
    {
        $this->actingAs($this->userWith('system.configure_notifications'));
        $this->template();

        $log = EmailLog::create([
            'template_key' => 'test.template',
            'to_email' => 'manee@example.com',
            'recipient_name' => 'Manee Jaidee',
            'subject' => 'Your request is ready',
            'body_html' => '<p>Signed, the IT team</p>',
            'status' => 'sent',
        ]);

        $response = $this->getJson("/api/email-logs/{$log->id}")->assertOk();

        $html = $response->json('data.preview_html');
        // The stored message is in there, wrapped in the layout the mailer uses.
        $this->assertStringContainsString('Signed, the IT team', $html);
        $this->assertStringContainsString('<!doctype html>', strtolower($html));
        $this->assertSame('Manee Jaidee', $response->json('data.recipient_name'));
        // The label under the brand is the template's name, the way a real send shows it —
        // not the trigger key, which is plumbing.
        $this->assertStringContainsString('Test template', $html);
        $this->assertStringNotContainsString('test.template', $html);
    }

    /** Rows written before bodies were kept say so instead of rendering an empty frame. */
    public function test_the_detail_endpoint_returns_no_preview_for_older_rows(): void
    {
        $this->actingAs($this->userWith('system.configure_notifications'));

        $log = EmailLog::create([
            'template_key' => 'test.template',
            'to_email' => 'manee@example.com',
            'subject' => 'Older send',
            'status' => 'sent',
        ]);

        $this->getJson("/api/email-logs/{$log->id}")
            ->assertOk()
            ->assertJsonPath('data.preview_html', null);
    }

    /**
     * A test send that cannot be delivered still answers with 200.
     *
     * The client turns any 5xx into a full-screen "Something went wrong" takeover meant for
     * a broken server. Reporting an unreachable mail host that way covered the settings
     * screen with a fatal error and left the admin with nothing but a Reload button.
     */
    public function test_a_failed_test_send_is_not_reported_as_a_server_fault(): void
    {
        $user = $this->userWith('system.configure_notifications');
        // An address the mailer will refuse, which is what a broken account looks like.
        $user->forceFill(['email' => '[NULL]'])->save();
        $this->actingAs($user);
        $template = $this->template();

        $this->postJson("/api/email-templates/{$template->id}/test")
            ->assertOk()
            ->assertJsonPath('sent', false);

        $this->assertSame('failed', EmailLog::latest('id')->first()?->status);
    }

    public function test_the_log_endpoint_is_gated(): void
    {
        Role::firstOrCreate(['key' => 'no_perms'], ['name' => 'No Perms']);
        $this->actingAs(User::factory()->create(['role' => 'no_perms']));

        $this->getJson('/api/email-logs')->assertForbidden();
    }
}
