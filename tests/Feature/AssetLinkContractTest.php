<?php

// Linking rented assets that have no contract: the list filter, the bulk endpoint and its refusals.

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AssetLinkContractTest extends TestCase
{
    use RefreshDatabase;

    private function lease(array $extra = []): Contract
    {
        return Contract::create([
            'name' => 'Lease', 'type' => 'hardware', 'start_date' => '2026-01-01',
            'end_date' => '2028-12-31', 'value' => 100, 'billing_cycle' => 'monthly', ...$extra,
        ]);
    }

    private function freeRental(string $status = 'deployed'): Asset
    {
        return Asset::factory()->rented()->create(['contract_id' => null, 'status' => $status]);
    }

    public function test_the_list_filter_shows_only_rentals_without_a_contract(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $free = $this->freeRental();
        $freeReady = $this->freeRental('ready');
        Asset::factory()->rented()->create(['status' => 'deployed']);
        Asset::factory()->rented()->create(['contract_id' => null, 'status' => 'writeoff']);
        Asset::factory()->create(['source' => 'purchased', 'status' => 'deployed']);

        $ids = collect($this->getJson('/api/assets?source=rented_unlinked')->assertOk()->json('data'))->pluck('id')->sort()->values()->all();

        $this->assertSame(collect([$free->id, $freeReady->id])->sort()->values()->all(), $ids);
    }

    public function test_an_array_source_is_ignored_not_a_500(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->getJson('/api/assets?source[]=rented')->assertOk();
    }

    public function test_contract_options_carry_the_end_date(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $lease = $this->lease(['end_date' => '2028-03-31']);

        $option = collect($this->getJson('/api/assets/contract-options')->assertOk()->json('data'))->firstWhere('id', $lease->id);

        $this->assertSame('2028-03-31', $option['end_date']);
    }

    public function test_it_links_several_free_rentals_without_telling_anyone(): void
    {
        Notification::fake();
        Bus::fake();
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $lease = $this->lease();
        $one = $this->freeRental();
        $two = $this->freeRental('ready');

        $this->postJson('/api/assets/bulk-contract', ['ids' => [$one->id, $two->id], 'contract_id' => $lease->id])
            ->assertOk()->assertJsonPath('updated', 2);

        $this->assertSame($lease->id, $one->fresh()->contract_id);
        $this->assertSame($lease->id, $two->fresh()->contract_id);
        $this->assertSame(
            ["{$one->asset_code} → {$lease->code}", "{$two->asset_code} → {$lease->code}"],
            AuditLog::where('action', 'Linked asset to contract')->orderBy('id')->pluck('target')->all(),
        );
        Notification::assertNothingSent();
        Bus::assertNothingDispatched();
    }

    public function test_one_asset_with_a_contract_refuses_the_whole_batch(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $lease = $this->lease();
        $free = $this->freeRental();
        $linked = Asset::factory()->rented()->create(['status' => 'deployed']);

        $this->postJson('/api/assets/bulk-contract', ['ids' => [$free->id, $linked->id], 'contract_id' => $lease->id])
            ->assertStatus(422)->assertJsonPath('message', 'link_not_free_rental');

        $this->assertNull($free->fresh()->contract_id);
    }

    public function test_purchased_and_written_off_assets_are_refused(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $lease = $this->lease();
        $bought = Asset::factory()->create(['source' => 'purchased', 'status' => 'deployed']);
        $gone = $this->freeRental('writeoff');

        foreach ([$bought, $gone] as $asset) {
            $this->postJson('/api/assets/bulk-contract', ['ids' => [$asset->id], 'contract_id' => $lease->id])
                ->assertStatus(422)->assertJsonPath('message', 'link_not_free_rental');
        }
    }

    public function test_only_an_open_hardware_contract_is_accepted(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $asset = $this->freeRental();
        $expired = $this->lease(['expired_at' => now()]);
        $cancelled = $this->lease(['cancelled_at' => now(), 'cancel_reason' => 'Ended']);
        $software = $this->lease(['type' => 'software']);

        foreach ([$expired, $cancelled, $software] as $contract) {
            $this->postJson('/api/assets/bulk-contract', ['ids' => [$asset->id], 'contract_id' => $contract->id])
                ->assertUnprocessable()->assertJsonValidationErrors('contract_id');
        }

        $this->assertNull($asset->fresh()->contract_id);
    }

    public function test_linking_needs_the_edit_permission(): void
    {
        $lease = $this->lease();
        $asset = $this->freeRental();

        $viewer = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $viewer->role_id, 'permission' => 'assets.view', 'allowed' => true]);
        $this->actingAs($viewer)
            ->postJson('/api/assets/bulk-contract', ['ids' => [$asset->id], 'contract_id' => $lease->id])
            ->assertForbidden();

        $editor = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $editor->role_id, 'permission' => 'assets.edit', 'allowed' => true]);
        $this->actingAs($editor)
            ->postJson('/api/assets/bulk-contract', ['ids' => [$asset->id], 'contract_id' => $lease->id])
            ->assertOk();
    }
}
