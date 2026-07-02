<?php

namespace Tests\Feature;

use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsSectionPermissionsTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string $permission): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => $permission, 'allowed' => true]);

        return $user;
    }

    public function test_company_requires_settings_company_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->putJson('/api/settings/company', ['company_name' => 'Acme'])
            ->assertForbidden();
    }

    public function test_granted_user_can_update_company(): void
    {
        $this->actingAs($this->userWith('settings.company'))
            ->putJson('/api/settings/company', ['company_name' => 'Acme', 'currency' => 'USD'])
            ->assertOk()
            ->assertJsonPath('data.company_name', 'Acme')
            ->assertJsonPath('data.currency', 'USD');

        $this->assertSame('Acme', AppSetting::get('company_name'));
    }

    public function test_super_can_update_company(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->putJson('/api/settings/company', ['company_name' => 'Acme'])
            ->assertOk();
    }

    public function test_branding_requires_settings_branding_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->putJson('/api/settings/branding', ['brand_name' => 'IT'])
            ->assertForbidden();
    }

    public function test_granted_user_can_update_branding(): void
    {
        $this->actingAs($this->userWith('settings.system'))
            ->putJson('/api/settings/branding', ['brand_name' => 'Inaba IT', 'brand_sub' => 'Desk'])
            ->assertOk()
            ->assertJsonPath('data.brand_name', 'Inaba IT');

        $this->assertSame('Inaba IT', AppSetting::get('brand_name'));
    }

    public function test_logo_upload_requires_settings_branding_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->postJson('/api/settings/logo', [])
            ->assertForbidden();
    }

    public function test_display_requires_settings_display_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->putJson('/api/settings/display', ['theme_accent' => '#123456'])
            ->assertForbidden();
    }

    public function test_granted_user_can_update_display(): void
    {
        $this->actingAs($this->userWith('settings.system'))
            ->putJson('/api/settings/display', ['theme_accent' => '#123456', 'theme_density' => 'compact', 'theme_radius' => 12])
            ->assertOk()
            ->assertJsonPath('data.theme_accent', '#123456')
            ->assertJsonPath('data.theme_radius', 12);
    }

    public function test_display_rejects_invalid_accent(): void
    {
        $this->actingAs($this->userWith('settings.system'))
            ->putJson('/api/settings/display', ['theme_accent' => 'blue'])
            ->assertStatus(422)->assertJsonValidationErrors('theme_accent');
    }

    public function test_mail_settings_require_settings_email_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->getJson('/api/settings/mail')
            ->assertForbidden();
    }

    public function test_granted_user_can_read_mail_settings(): void
    {
        $this->actingAs($this->userWith('settings.email'))
            ->getJson('/api/settings/mail')
            ->assertOk()
            ->assertJsonStructure(['data' => ['host', 'port', 'has_password', 'from_address']]);
    }

    public function test_legacy_combined_settings_route_is_gone(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->putJson('/api/settings', ['company_name' => 'X'])
            ->assertStatus(405); // only GET /settings remains
    }
}
