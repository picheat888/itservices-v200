<?php

// What the delivery log records about a send, and the header stats built from it.

namespace Tests\Feature;

use App\Models\Email\EmailLog;
use App\Models\Email\EmailTemplate;
use App\Models\Permission\Role;
use App\Models\Settings\MailSetting;
use App\Models\User;
use App\Services\Email\EmailNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class EmailDeliveryRecordTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'super', 'email' => 'admin@example.com']);
    }

    private function template(): EmailTemplate
    {
        return EmailTemplate::create([
            'key' => 'test.template', 'name' => 'Test template', 'subject' => 'Hello',
            'body_html' => '<p>Body</p>', 'enabled' => true, 'cadence' => 'realtime',
        ]);
    }

    private function configureSmtp(): void
    {
        MailSetting::current()->update(['host' => 'smtp.example.com', 'port' => 587, 'from_address' => 'desk@example.com']);
    }

    private function log(string $status, array $extra = []): void
    {
        EmailLog::create(array_merge(['template_key' => 'test.template', 'to_email' => 'a@example.com', 'subject' => 'S', 'status' => $status], $extra));
    }

    private function service(): EmailNotificationService
    {
        return app(EmailNotificationService::class);
    }

    public function test_a_send_stamps_last_sent_without_touching_last_edited(): void
    {
        $this->configureSmtp();
        $template = $this->template();
        $edited = $template->updated_at;
        $this->travel(2)->days();

        $this->service()->deliver('a@example.com', 'Hello', '<p>Body</p>', 'test.template');

        $template->refresh();
        $this->assertNotNull($template->last_sent_at);
        $this->assertTrue($edited->equalTo($template->updated_at));
    }

    public function test_a_test_send_is_flagged_and_does_not_count_as_use(): void
    {
        $this->configureSmtp();
        $template = $this->template();

        $admin = $this->admin();

        $this->actingAs($admin)->postJson("/api/email-templates/{$template->id}/test")->assertOk();

        $log = EmailLog::query()->latest('id')->firstOrFail();
        $this->assertTrue($log->is_test);
        $this->assertNull($template->fresh()->last_sent_at);
        $stats = $this->actingAs($admin)->getJson('/api/email-templates')->json('stats');
        $this->assertSame(0, $stats['sent_today']);
    }

    public function test_a_cleared_field_in_a_test_send_falls_back_to_the_saved_wording(): void
    {
        $this->configureSmtp();
        $template = $this->template();

        $this->actingAs($this->admin())->postJson("/api/email-templates/{$template->id}/test", ['subject' => ''])->assertOk();

        $this->assertStringContainsString('Hello', EmailLog::query()->latest('id')->value('subject'));
    }

    public function test_the_rate_covers_30_days_of_real_sends_and_leaves_out_mail_that_never_left(): void
    {
        $this->configureSmtp();
        $this->log('sent');
        $this->log('sent');
        $this->log('sent');
        $this->log('failed', ['error' => 'Connection refused']);
        $this->log('failed', ['error' => EmailNotificationService::NOT_CONFIGURED_ERROR]);
        $this->log('failed', ['is_test' => true, 'error' => 'Connection refused']);
        $this->travel(-40)->days();
        $this->log('failed', ['error' => 'Connection refused']);
        $this->travelBack();

        $stats = $this->service()->deliveryStats();

        $this->assertSame(75.0, $stats['delivery_rate']);
        $this->assertSame(3, $stats['delivery_sent']);
        $this->assertSame(4, $stats['delivery_attempts']);
        $this->assertTrue($stats['mail_configured']);
    }

    public function test_without_smtp_the_rate_says_not_set_up(): void
    {
        $this->log('sent');

        $stats = $this->service()->deliveryStats();

        $this->assertNull($stats['delivery_rate']);
        $this->assertFalse($stats['mail_configured']);
    }

    public function test_the_log_shows_the_button_the_mail_carried(): void
    {
        $this->configureSmtp();
        $this->service()->deliver('a@example.com', 'Report', '<p>Body</p>', 'test.template', 'https://desk.example/files/1', 'Download file');
        $this->service()->deliver('a@example.com', 'Notice', '<p>Body</p>', 'test.template');
        [$withButton, $without] = EmailLog::query()->orderBy('id')->get()->all();

        $this->assertSame(['url' => 'https://desk.example/files/1', 'label' => 'Download file'], $withButton->action);
        $this->assertSame([], $without->action);

        $admin = $this->admin();
        $this->assertStringContainsString('Download file', $this->actingAs($admin)->getJson("/api/email-logs/{$withButton->id}")->json('data.preview_html'));
        $this->assertStringNotContainsString('Open in portal', $this->actingAs($admin)->getJson("/api/email-logs/{$without->id}")->json('data.preview_html'));
    }

    public function test_an_older_row_without_a_recorded_button_shows_none_and_says_so(): void
    {
        $this->log('sent', ['body_html' => '<p>Old</p>']);
        $log = EmailLog::query()->firstOrFail();

        $data = $this->actingAs($this->admin())->getJson("/api/email-logs/{$log->id}")->json('data');

        $this->assertStringNotContainsString('Open in portal', $data['preview_html']);
        $this->assertFalse($data['action_recorded']);
    }

    public function test_a_subject_longer_than_the_column_is_cut_to_fit(): void
    {
        $this->configureSmtp();

        $this->service()->deliver('a@example.com', str_repeat('ก', 300), '<p>Body</p>', 'test.template');

        $this->assertSame(255, mb_strlen(EmailLog::query()->value('subject')));
    }
}
