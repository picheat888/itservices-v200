<?php

namespace Tests\Feature;

use App\Models\EmailTemplate;
use App\Models\Role;
use App\Models\User;
use App\Support\EmailTemplates;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Templates can be restored to their standard definition individually or all at once. */
class EmailTemplateResetTest extends TestCase
{
    use RefreshDatabase;

    /** A super-admin (bypasses permission checks) for the gated endpoints. */
    private function admin(): User
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);

        return User::factory()->create(['role' => 'super']);
    }

    public function test_seeder_populates_every_standard_template(): void
    {
        $this->seed(EmailTemplateSeeder::class);

        foreach (EmailTemplates::all() as $standard) {
            $this->assertDatabaseHas('email_templates', [
                'key' => $standard['key'],
                'name' => $standard['name'],
                'cadence' => $standard['cadence'],
            ]);
        }
    }

    public function test_reset_restores_one_template_to_standard(): void
    {
        $this->seed(EmailTemplateSeeder::class);
        $admin = $this->admin();

        $template = EmailTemplate::where('key', 'ticket.created')->firstOrFail();
        $template->update(['subject' => 'EDITED subject', 'body_html' => '<p>edited</p>', 'enabled' => false]);

        $res = $this->actingAs($admin)->postJson("/api/email-templates/{$template->id}/reset");

        $res->assertOk();
        $standard = EmailTemplates::find('ticket.created');
        $this->assertDatabaseHas('email_templates', [
            'key' => 'ticket.created',
            'subject' => $standard['subject'],
            'body_html' => $standard['body_html'],
            'enabled' => $standard['enabled'],
        ]);
        // The resource should now report the row as no longer modified.
        $res->assertJsonPath('data.is_modified', false);
        $res->assertJsonPath('data.is_standard', true);
    }

    public function test_reset_is_rejected_for_a_template_without_a_standard(): void
    {
        $admin = $this->admin();

        $custom = EmailTemplate::create([
            'key' => 'custom.one_off',
            'name' => 'Custom one-off',
            'subject' => 'Hello',
            'body_html' => '<p>Hi</p>',
            'enabled' => true,
        ]);

        $res = $this->actingAs($admin)->postJson("/api/email-templates/{$custom->id}/reset");

        $res->assertStatus(422);
    }

    public function test_reset_all_restores_every_standard_template(): void
    {
        $this->seed(EmailTemplateSeeder::class);
        $admin = $this->admin();

        // Edit two standard templates away from their standard content.
        EmailTemplate::where('key', 'ticket.created')->update(['subject' => 'changed A']);
        EmailTemplate::where('key', 'request.approved')->update(['body_html' => '<p>changed B</p>']);

        $res = $this->actingAs($admin)->postJson('/api/email-templates/reset-all');

        $res->assertOk();
        $res->assertJsonPath('reset', count(EmailTemplates::all()));

        foreach (['ticket.created', 'request.approved'] as $key) {
            $standard = EmailTemplates::find($key);
            $this->assertDatabaseHas('email_templates', [
                'key' => $key,
                'subject' => $standard['subject'],
                'body_html' => $standard['body_html'],
            ]);
        }
    }

    public function test_reset_requires_the_notifications_permission(): void
    {
        $this->seed(EmailTemplateSeeder::class);

        Role::create(['key' => 'user', 'name' => 'Staff Template', 'is_system' => false]);
        $staff = User::factory()->create(['role' => 'user']);

        $template = EmailTemplate::where('key', 'ticket.created')->firstOrFail();

        $res = $this->actingAs($staff)->postJson("/api/email-templates/{$template->id}/reset");

        $res->assertStatus(403);
    }
}
