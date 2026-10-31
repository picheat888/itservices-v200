<?php

// /api/settings: guest and signed-in key sets, each section's save answer and audit row, SLA hook messages, logo audit.

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SettingsBehaviourTest extends TestCase
{
    use RefreshDatabase;

    private const ALL_KEYS = [
        'brand_name', 'brand_sub', 'company_name', 'legal_name', 'tax_id', 'industry', 'address', 'country', 'currency',
        'theme_accent', 'theme_density', 'theme_radius', 'date_format', 'date_era', 'time_format',
        'notification_sound', 'notification_sound_enabled', 'vapid_public_key', 'logo_url', 'default_employee_role_label',
        'asset_status_colors', 'ticket_sla', 'ticket_sla_response', 'ticket_sla_goal', 'ticket_sla_hours',
        'ticket_sla_request', 'ticket_sla_work_class',
    ];

    private function admin(): User
    {
        $role = Role::firstOrCreate(['key' => 'settings_admin'], ['name' => 'Settings admin', 'color' => '#64748b', 'is_system' => false]);
        foreach (['settings.company', 'settings.system', 'settings.sound', 'settings.assets', 'settings.sla', 'settings.security', 'settings.email'] as $permission) {
            RolePermission::firstOrCreate(['role_id' => $role->id, 'permission' => $permission], ['allowed' => true]);
        }

        return User::factory()->create(['role' => 'settings_admin']);
    }

    private function lastAudit(): AuditLog
    {
        return AuditLog::query()->latest('id')->firstOrFail();
    }

    public function test_a_guest_gets_the_public_keys_only(): void
    {
        $data = $this->getJson('/api/settings')->assertOk()->json('data');

        $this->assertSame(['brand_name', 'brand_sub', 'theme_accent', 'theme_density', 'theme_radius', 'logo_url'], array_keys($data));
    }

    public function test_a_signed_in_reader_gets_every_key_in_order(): void
    {
        $response = $this->actingAs($this->admin())->getJson('/api/settings')->assertOk();

        $this->assertSame(self::ALL_KEYS, array_keys($response->json('data')));
        $this->assertSame('success', $response->json('message'));
    }

    public function test_each_section_save_answers_with_the_settings_and_writes_its_audit_row(): void
    {
        $admin = $this->admin();
        $saves = [
            ['settings/company', ['company_name' => 'Inaba', 'country' => null], 'Updated company settings', 'company_name, country'],
            ['settings/branding', ['brand_name' => 'Desk', 'brand_sub' => null], 'Updated branding settings', 'brand_name, brand_sub'],
            ['settings/display', ['theme_accent' => '#123456', 'theme_radius' => 8], 'Updated display settings', 'theme_accent, theme_radius'],
            ['settings/datetime', ['date_format' => 'dmy_slash', 'date_era' => 'be', 'time_format' => '24'], 'Updated date and time settings', 'date_format, date_era, time_format'],
            ['settings/sound', ['sound' => 'pluck', 'enabled' => false], 'Updated notification sound', 'pluck, off'],
            ['settings/assets', ['asset_status_colors' => ['ready' => '#00ff00']], 'Updated asset settings', 'asset_status_colors'],
        ];

        foreach ($saves as [$path, $body, $action, $target]) {
            $response = $this->actingAs($admin)->putJson("/api/{$path}", $body)->assertOk();
            $this->assertSame(self::ALL_KEYS, array_keys($response->json('data')), $path);
            $this->assertSame([$action, $target], [$this->lastAudit()->action, $this->lastAudit()->target], $path);
        }

        $settings = $this->actingAs($admin)->getJson('/api/settings')->json('data');
        $this->assertSame('', $settings['country']);
        $this->assertSame('', $settings['brand_sub']);
        $this->assertSame(8, $settings['theme_radius']);
        $this->assertSame('0', $settings['notification_sound_enabled']);
        $this->assertSame('#00ff00', $settings['asset_status_colors']['ready']);
        $this->assertSame('#0284c7', $settings['asset_status_colors']['deployed']);
    }

    public function test_the_two_sla_hooks_report_on_the_row_with_todays_wording(): void
    {
        $errors = $this->actingAs($this->admin())->putJson('/api/settings/sla', [
            'ticket_sla' => ['high' => ['resolve' => 1]],
            'ticket_sla_response' => 120,
            'ticket_sla_work_class' => [
                ['category' => 'hardware', 'work_class' => 'repair_vendor', 'resolve' => 48],
                ['category' => 'hardware', 'work_class' => 'repair_vendor', 'resolve' => 72],
            ],
        ])->assertUnprocessable()->json('errors');

        $this->assertSame(['This kind of work already has a target for that ticket type.'], $errors['ticket_sla_work_class.1.work_class']);
        $this->assertSame(['Resolution must be at least the first-response target.'], $errors['ticket_sla.high.resolve']);
    }

    public function test_a_sla_save_writes_one_audit_row_and_answers_with_the_settings(): void
    {
        $response = $this->actingAs($this->admin())->putJson('/api/settings/sla', [
            'ticket_sla' => ['high' => ['resolve' => 8]],
        ])->assertOk();

        $this->assertSame(self::ALL_KEYS, array_keys($response->json('data')));
        $this->assertSame(['Updated SLA settings', 'ticket_sla'], [$this->lastAudit()->action, $this->lastAudit()->target]);
    }

    public function test_the_security_answer_keys_and_a_no_change_save_writes_no_audit(): void
    {
        $admin = $this->admin();
        $keys = array_keys($this->actingAs($admin)->getJson('/api/settings/security')->assertOk()->json('data'));
        $this->assertSame([
            'session_timeout_minutes', 'session_lifetime_minutes', 'session_timeout_effective_minutes', 'password_expiry_days',
            'email_log_body_days', 'email_log_days', 'audit_log_days', 'notification_days', 'login_log_days', 'device_limit', 'geoip_updated_at',
        ], $keys);

        $before = AuditLog::count();
        $this->actingAs($admin)->putJson('/api/settings/security', ['session_timeout_minutes' => 0, 'password_expiry_days' => 0])
            ->assertOk()->assertJsonPath('message', 'success');
        $this->assertSame($before, AuditLog::count());
    }

    public function test_the_logo_upload_and_delete_audit_only_when_a_logo_was_there(): void
    {
        Storage::fake('public');
        $admin = $this->admin();

        $before = AuditLog::count();
        $this->actingAs($admin)->deleteJson('/api/settings/logo')->assertOk();
        $this->assertSame($before, AuditLog::count());

        $this->actingAs($admin)->postJson('/api/settings/logo', ['logo' => UploadedFile::fake()->image('logo.png')])->assertOk()
            ->assertJsonPath('data.logo_url', fn ($url) => is_string($url) && str_contains($url, 'branding/'));
        $this->assertSame(['Uploaded logo', 'Branding'], [$this->lastAudit()->action, $this->lastAudit()->target]);

        $this->actingAs($admin)->deleteJson('/api/settings/logo')->assertOk()->assertJsonPath('data.logo_url', null);
        $this->assertSame(['Removed logo', 'Branding'], [$this->lastAudit()->action, $this->lastAudit()->target]);
    }

    public function test_the_mail_answer_keys_and_its_audit_row(): void
    {
        $response = $this->actingAs($this->admin())->putJson('/api/settings/mail', [
            'host' => 'smtp.example.com', 'port' => 587, 'username' => '', 'password' => 'secret',
            'encryption' => 'tls', 'from_address' => 'it@example.com', 'from_name' => 'IT',
        ])->assertOk();

        $this->assertSame(['host', 'port', 'username', 'has_password', 'encryption', 'from_address', 'from_name'], array_keys($response->json('data')));
        $this->assertFalse($response->json('data.has_password'));
        $this->assertSame(['Updated mail settings', 'SMTP'], [$this->lastAudit()->action, $this->lastAudit()->target]);
    }
}
