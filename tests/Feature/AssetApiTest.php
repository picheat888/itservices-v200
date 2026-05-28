<?php

namespace Tests\Feature;

use App\Models\Asset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AssetApiTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_guests_cannot_list_assets(): void
    {
        $this->getJson('/api/assets')->assertUnauthorized();
    }

    public function test_super_can_register_and_list_an_asset(): void
    {
        $this->actingAs($this->super());

        $payload = [
            'type' => 'laptop',
            'source' => 'purchased',
            'model' => 'Dell Latitude 5440',
            'owner' => 'EMP-1042',
            'value' => 32100,
            'purchase_date' => '2025-01-10',
            'warranty_end' => '2028-01-10',
        ];

        $this->postJson('/api/assets', $payload)
            ->assertCreated()
            ->assertJsonPath('data.model', 'Dell Latitude 5440')
            ->assertJsonPath('data.value_display', '฿32,100')
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.initial_owner', 'EMP-1042');

        $this->getJson('/api/assets')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_tag_is_auto_generated_when_blank(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/assets', [
            'type' => 'laptop', 'source' => 'purchased', 'model' => 'X', 'value' => 100,
        ])->assertCreated()
            ->assertJsonPath('data.tag', fn ($tag) => is_string($tag) && str_starts_with($tag, 'INB-LA-'));
    }

    public function test_rented_asset_value_display_is_monthly(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/assets', [
            'type' => 'network', 'source' => 'rented', 'model' => 'Cisco 9300', 'value' => 8500,
        ])->assertCreated()
            ->assertJsonPath('data.value_display', '฿8,500/mo')
            ->assertJsonPath('data.tag', fn ($tag) => str_starts_with($tag, 'RNT-NE-'));
    }

    public function test_model_is_required(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/assets', ['type' => 'laptop', 'source' => 'purchased', 'value' => 1])
            ->assertStatus(422)->assertJsonValidationErrors('model');
    }

    public function test_user_without_permission_cannot_register(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));

        $this->postJson('/api/assets', [
            'type' => 'laptop', 'source' => 'purchased', 'model' => 'X', 'value' => 1,
        ])->assertForbidden();
    }

    public function test_transfer_moves_asset_to_pending_acceptance(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => 'Pool — IT']);

        $this->postJson("/api/assets/{$asset->id}/transfer", ['owner' => 'EMP-2000', 'reason' => 'New hire'])
            ->assertOk()
            ->assertJsonPath('data.status', 'pending_acceptance')
            ->assertJsonPath('data.owner', 'EMP-2000');
    }

    public function test_cannot_transfer_a_deployed_asset(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'deployed', 'owner' => 'EMP-1042']);

        $this->postJson("/api/assets/{$asset->id}/transfer", ['owner' => 'EMP-2000'])
            ->assertStatus(422);
    }

    public function test_mark_received_returns_asset_to_pool(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'pending_return', 'owner' => 'EMP-1500']);

        $this->postJson("/api/assets/{$asset->id}/receive")
            ->assertOk()
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.owner', 'Pool — IT');
    }

    public function test_summary_reports_status_counts(): void
    {
        $this->actingAs($this->super());
        Asset::factory()->create(['status' => 'deployed', 'value' => 40000]);
        Asset::factory()->create(['status' => 'ready', 'value' => 20000]);
        Asset::factory()->create(['status' => 'maintenance', 'value' => 10000]);

        $this->getJson('/api/assets/summary')
            ->assertOk()
            ->assertJsonPath('total', 3)
            ->assertJsonPath('deployed', 1)
            ->assertJsonPath('ready', 1)
            ->assertJsonPath('maintenance', 1);
    }

    public function test_bulk_writeoff_updates_many_assets(): void
    {
        $this->actingAs($this->super());
        $a = Asset::factory()->create(['status' => 'ready']);
        $b = Asset::factory()->create(['status' => 'ready']);

        $this->postJson('/api/assets/bulk', ['ids' => [$a->id, $b->id], 'op' => 'writeoff', 'reason' => 'EOL'])
            ->assertOk()
            ->assertJsonPath('updated', 2);

        $this->assertSame('writeoff', $a->fresh()->status->value);
    }

    public function test_transfer_is_recorded_in_the_transfer_log(): void
    {
        $this->actingAs($this->super());
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => 'Pool — IT']);

        $this->postJson("/api/assets/{$asset->id}/transfer", ['owner' => 'EMP-2000', 'reason' => 'New hire'])->assertOk();

        $this->getJson('/api/assets/transfers')
            ->assertOk()
            ->assertJsonPath('data.0.to_owner', 'EMP-2000')
            ->assertJsonPath('data.0.from_owner', 'Pool — IT')
            ->assertJsonPath('data.0.reason', 'New hire');
    }
}
