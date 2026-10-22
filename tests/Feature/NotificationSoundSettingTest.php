<?php

// Covers the system-wide notification sound setting and its settings.sound permission gate.

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Support\PermissionLayout;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationSoundSettingTest extends TestCase
{
    use RefreshDatabase;

    /** @param list<string> $permissions */
    private function userWith(array $permissions): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $user->role_id, 'permission' => $permission, 'allowed' => true]);
        }

        return $user;
    }

    public function test_settings_default_to_the_pluck_sound(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->getJson('/api/settings')
            ->assertOk()
            ->assertJsonPath('data.notification_sound', 'pluck')
            ->assertJsonPath('data.notification_sound_enabled', '1');
    }

    public function test_guest_settings_do_not_carry_the_sound(): void
    {
        $this->getJson('/api/settings')
            ->assertOk()
            ->assertJsonMissingPath('data.notification_sound')
            ->assertJsonMissingPath('data.notification_sound_enabled');
    }

    public function test_a_user_with_settings_sound_picks_a_sound_and_switches_it_off(): void
    {
        $this->actingAs($this->userWith(['settings.access', 'settings.sound']))
            ->putJson('/api/settings/sound', ['sound' => 'pop', 'enabled' => false])
            ->assertOk()
            ->assertJsonPath('data.notification_sound', 'pop')
            ->assertJsonPath('data.notification_sound_enabled', '0');

        $this->assertSame('pop', AppSetting::get('notification_sound'));
        $this->assertTrue(AuditLog::where('action', 'Updated notification sound')->exists());
    }

    public function test_unknown_sound_is_rejected(): void
    {
        $this->actingAs($this->userWith(['settings.access', 'settings.sound']))
            ->putJson('/api/settings/sound', ['sound' => 'airhorn', 'enabled' => true])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('sound');
    }

    public function test_without_settings_sound_nothing_changes(): void
    {
        $this->actingAs($this->userWith(['settings.access', 'settings.system']))
            ->putJson('/api/settings/sound', ['sound' => 'pop', 'enabled' => false])
            ->assertForbidden();

        $this->assertNull(AppSetting::get('notification_sound'));
    }

    public function test_settings_sound_is_in_the_catalogue_and_the_supervisor_default(): void
    {
        $this->assertContains('settings.sound', Permissions::all());
        $this->assertContains('settings.sound', Permissions::defaults()['it_supervisorleader']);

        $settingsCard = collect(PermissionLayout::cards())->firstWhere('module', 'settings');
        $this->assertStringContainsString('settings.sound', json_encode($settingsCard));
    }
}
