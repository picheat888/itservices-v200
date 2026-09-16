<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Email\EmailLog;
use App\Models\Email\EmailTemplate;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
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
    /** @param  string|list<string>  $permission */
    private function userWith(string|array $permission): User
    {
        $role = Role::firstOrCreate(['key' => 'log_reader'], ['name' => 'Log Reader']);
        foreach ((array) $permission as $key) {
            RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => $key], ['allowed' => true]);
        }

        return User::factory()->create(['role' => 'log_reader']);
    }

    public function test_the_log_endpoint_lists_newest_first_with_whole_log_counts(): void
    {
        $this->actingAs($this->userWith(['notifications.module', 'notifications.logs', 'notifications.email_test']));

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
        $this->actingAs($this->userWith(['notifications.module', 'notifications.logs', 'notifications.email_test']));

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

    /**
     * The installation names itself. Callers never pass app.name — it is injected for every
     * template, so renaming the service in Settings renames it in the emails too.
     */
    public function test_templates_can_name_the_installation_without_the_caller_passing_it(): void
    {
        Queue::fake();
        AppSetting::updateOrCreate(['key' => 'brand_name'], ['value' => 'INA-Tech V2']);
        EmailTemplate::updateOrCreate(
            ['key' => 'test.template'],
            [
                'name' => 'Test template',
                'subject' => 'Hello from {{app.name}}',
                'body_html' => '<p>Track it in {{app.name}}.</p>',
                'enabled' => true,
                'cadence' => 'realtime',
            ],
        );

        $this->service()->sendTemplate('test.template', 'manee@example.com');

        Queue::assertPushed(SendTemplatedEmail::class, fn (SendTemplatedEmail $job) => str_contains($job->html, 'Track it in INA-Tech V2.')
            && str_contains($job->subject, 'Hello from INA-Tech V2'));
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

    /**
     * Two presses of Send test must not produce two identical messages: a mailbox that
     * groups by subject files the second into the first one's conversation and hides the
     * repeated body, which looks exactly like an email that arrived empty.
     */
    public function test_each_test_send_carries_a_distinguishing_stamp(): void
    {
        $this->actingAs($this->userWith(['notifications.module', 'notifications.logs', 'notifications.email_test']));
        $template = $this->template();

        $this->postJson("/api/email-templates/{$template->id}/test")->assertOk();

        $subject = EmailLog::latest('id')->first()->subject;
        $this->assertMatchesRegularExpression('/\(test \d{2}:\d{2}\)$/', $subject);
    }

    /**
     * Send test has to send what the editor is showing.
     *
     * It sent the stored row while the preview beside the button rendered the unsaved
     * wording, so the mail that arrived and the screen that asked for it disagreed, with
     * nothing on either side saying why.
     */
    public function test_a_test_send_carries_the_editors_unsaved_wording(): void
    {
        $this->actingAs($this->userWith(['notifications.module', 'notifications.logs', 'notifications.email_test']));
        $template = $this->template();

        $this->postJson("/api/email-templates/{$template->id}/test", [
            'name' => 'Draft name',
            'subject' => 'Draft subject for {{user.first_name}}',
            'body_html' => '<p>Draft body</p>',
        ])->assertOk();

        $log = EmailLog::latest('id')->first();
        $this->assertStringContainsString('Draft subject for', $log->subject);
        $this->assertStringContainsString('Draft body', $log->body_html);

        // …and the draft is not saved by testing it. Pressing Send test is not pressing Save.
        $this->assertSame('Hello {{user.first_name}}', $template->refresh()->subject);
        $this->assertSame('<p>Body</p>', $template->body_html);
    }

    /** With nothing posted it still sends the stored template — the row list's own test button. */
    public function test_a_test_send_without_a_draft_falls_back_to_the_saved_template(): void
    {
        $this->actingAs($this->userWith(['notifications.module', 'notifications.logs', 'notifications.email_test']));
        $template = $this->template();

        $this->postJson("/api/email-templates/{$template->id}/test")->assertOk();

        $this->assertStringContainsString('<p>Body</p>', EmailLog::latest('id')->first()->body_html);
    }

    public function test_the_detail_endpoint_rebuilds_the_email_around_the_stored_message(): void
    {
        $this->actingAs($this->userWith(['notifications.module', 'notifications.logs', 'notifications.email_test']));
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
        $this->actingAs($this->userWith(['notifications.module', 'notifications.logs', 'notifications.email_test']));

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
        $user = $this->userWith(['notifications.module', 'notifications.logs', 'notifications.email_test']);
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
