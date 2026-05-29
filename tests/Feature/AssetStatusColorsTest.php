<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AssetStatusColorsTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_settings_return_default_asset_status_colors(): void
    {
        $this->actingAs($this->super());

        $this->getJson('/api/settings')
            ->assertOk()
            ->assertJsonPath('data.asset_status_colors.deployed', '#0284c7')
            ->assertJsonPath('data.asset_status_colors.writeoff', '#dc2626');
    }

    public function test_super_can_update_asset_status_colors(): void
    {
        $this->actingAs($this->super());

        $this->putJson('/api/settings', [
            'asset_status_colors' => [
                'deployed' => '#7c3aed',
                'ready' => '#0ea5e9',
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.asset_status_colors.deployed', '#7c3aed')
            ->assertJsonPath('data.asset_status_colors.ready', '#0ea5e9')
            // Statuses left untouched still resolve to their default color.
            ->assertJsonPath('data.asset_status_colors.writeoff', '#dc2626');

        $this->assertSame(
            '#7c3aed',
            json_decode((string) AppSetting::get('asset_status_colors'), true)['deployed']
        );
    }

    public function test_asset_status_colors_reject_invalid_hex(): void
    {
        $this->actingAs($this->super());

        $this->putJson('/api/settings', [
            'asset_status_colors' => ['deployed' => 'red'],
        ])->assertStatus(422)->assertJsonValidationErrors('asset_status_colors.deployed');
    }

    public function test_non_super_cannot_update_asset_status_colors(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));

        $this->putJson('/api/settings', [
            'asset_status_colors' => ['deployed' => '#7c3aed'],
        ])->assertForbidden();
    }
}
