<?php

namespace Tests\Feature;

use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Support\DateDisplay;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DateTimeSettingsTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string $permission): User
    {
        $user = User::factory()->create(['role' => 'admin']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => $permission, 'allowed' => true]);

        return $user;
    }

    public function test_settings_payload_carries_the_defaults(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->getJson('/api/settings')
            ->assertOk()
            ->assertJsonPath('data.date_format', 'dmy_slash')
            ->assertJsonPath('data.date_era', 'ce')
            ->assertJsonPath('data.time_format', '24');
    }

    public function test_guests_do_not_get_the_date_settings(): void
    {
        $this->getJson('/api/settings')
            ->assertOk()
            ->assertJsonMissingPath('data.date_format');
    }

    public function test_granted_user_saves_the_date_settings(): void
    {
        $this->actingAs($this->userWith('settings.system'))
            ->putJson('/api/settings/datetime', ['date_format' => 'd_month_y', 'date_era' => 'be', 'time_format' => '12'])
            ->assertOk()
            ->assertJsonPath('data.date_format', 'd_month_y')
            ->assertJsonPath('data.date_era', 'be')
            ->assertJsonPath('data.time_format', '12');

        $this->assertSame('be', AppSetting::get('date_era'));
        $this->assertSame('03 ตุลาคม 2569 2:05 PM', DateDisplay::dateTime('2026-10-03 14:05:00'));
    }

    public function test_unknown_values_are_refused(): void
    {
        $this->actingAs($this->userWith('settings.system'))
            ->putJson('/api/settings/datetime', ['date_format' => 'mdy', 'date_era' => 'ad', 'time_format' => '13'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['date_format', 'date_era', 'time_format']);
    }

    public function test_all_three_values_are_required(): void
    {
        $this->actingAs($this->userWith('settings.system'))
            ->putJson('/api/settings/datetime', ['date_format' => 'ymd_dash'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['date_era', 'time_format']);
    }

    public function test_saving_requires_settings_system_permission(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->putJson('/api/settings/datetime', ['date_format' => 'ymd_dash', 'date_era' => 'ce', 'time_format' => '24'])
            ->assertForbidden();
    }

    public function test_a_bad_stored_value_falls_back_to_the_default(): void
    {
        AppSetting::put('date_format', 'bogus');

        $this->assertSame('03/10/2026', DateDisplay::date('2026-10-03'));
    }
}
