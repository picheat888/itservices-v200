<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\RolePermission;
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
}
