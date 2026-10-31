<?php

// Email and in-app template pages and the delivery log: answer shapes, reset rules, unknown keys, audit rows.

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Email\EmailTemplate;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TemplateEndpointsBehaviourTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $role = Role::firstOrCreate(['key' => 'notif_admin'], ['name' => 'Notif admin', 'color' => '#64748b', 'is_system' => false]);
        $keys = ['notifications.module', 'notifications.email_edit', 'notifications.email_toggle', 'notifications.email_test',
            'notifications.inapp_edit', 'notifications.inapp_toggle', 'notifications.inapp_test', 'notifications.logs'];
        foreach ($keys as $permission) {
            RolePermission::firstOrCreate(['role_id' => $role->id, 'permission' => $permission], ['allowed' => true]);
        }

        return User::factory()->create(['role' => 'notif_admin']);
    }

    public function test_the_email_page_answer_shape(): void
    {
        $this->seed(EmailTemplateSeeder::class);

        $response = $this->actingAs($this->admin())->getJson('/api/email-templates')->assertOk();

        $this->assertSame(['data', 'stats', 'mail'], array_keys($response->json()));
        $this->assertSame(['templates', 'enabled', 'sent_today', 'delivery_rate', 'delivery_sent', 'delivery_attempts', 'mail_configured'], array_keys($response->json('stats')));
        $this->assertSame(['from_address', 'from_name'], array_keys($response->json('mail')));
    }

    public function test_an_email_save_answers_with_the_row_and_writes_one_audit_row(): void
    {
        $this->seed(EmailTemplateSeeder::class);
        $template = EmailTemplate::query()->orderBy('id')->firstOrFail();

        $response = $this->actingAs($this->admin())->putJson("/api/email-templates/{$template->id}", ['subject' => 'New subject'])->assertOk();

        $this->assertSame('success', $response->json('message'));
        $this->assertSame('New subject', $response->json('data.subject'));
        $audit = AuditLog::query()->latest('id')->firstOrFail();
        $this->assertSame(['Updated email template', $template->name], [$audit->action, $audit->target]);
    }

    public function test_resetting_a_template_with_no_standard_is_refused_in_todays_words(): void
    {
        $custom = EmailTemplate::create(['key' => 'custom.nothing', 'name' => 'Custom', 'subject' => 'S', 'body_html' => '<p>B</p>', 'enabled' => true]);

        $this->actingAs($this->admin())->postJson("/api/email-templates/{$custom->id}/reset")
            ->assertUnprocessable()->assertJsonPath('message', 'This template has no standard to reset to.');
    }

    public function test_reset_all_counts_every_standard_row_and_audits_only_changed_ones(): void
    {
        $this->seed(EmailTemplateSeeder::class);
        $total = EmailTemplate::count();
        EmailTemplate::query()->orderBy('id')->firstOrFail()->update(['subject' => 'Edited']);
        $before = AuditLog::count();

        $response = $this->actingAs($this->admin())->postJson('/api/email-templates/reset-all')->assertOk();

        $this->assertSame(['message' => 'success', 'reset' => $total], $response->json());
        $this->assertSame($before + 1, AuditLog::count());
    }

    public function test_a_test_send_without_an_email_address_is_refused_in_todays_words(): void
    {
        $this->seed(EmailTemplateSeeder::class);
        $admin = $this->admin();
        $admin->forceFill(['email' => null])->save();
        $template = EmailTemplate::query()->orderBy('id')->firstOrFail();

        $this->actingAs($admin)->postJson("/api/email-templates/{$template->id}/test")
            ->assertUnprocessable()->assertJsonPath('message', 'Your account has no email address.');
    }

    public function test_the_preview_is_html(): void
    {
        $response = $this->actingAs($this->admin())->postJson('/api/email-templates/render-preview', ['subject' => 'Hi', 'body_html' => '<p>{{user.first_name}}</p>'])->assertOk();

        $this->assertStringContainsString('text/html', (string) $response->headers->get('Content-Type'));
        $this->assertStringStartsWith('<!doctype html>', $response->getContent());
    }

    public function test_an_unknown_bell_key_is_404_before_any_validation(): void
    {
        $this->actingAs($this->admin())->putJson('/api/notification-templates/notif_no_such_key', [])->assertNotFound();
        $this->actingAs($this->admin())->postJson('/api/notification-templates/notif_no_such_key/reset')->assertNotFound();
    }

    public function test_the_bell_page_and_the_delivery_log_answer_shapes(): void
    {
        $admin = $this->admin();

        $bells = $this->actingAs($admin)->getJson('/api/notification-templates')->assertOk();
        $this->assertSame(['total', 'enabled', 'disabled', 'edited'], array_keys($bells->json('stats')));

        $log = $this->actingAs($admin)->getJson('/api/email-logs')->assertOk();
        $this->assertSame(['all', 'sent', 'failed', 'skipped'], array_keys($log->json('meta.counts')));
    }
}
