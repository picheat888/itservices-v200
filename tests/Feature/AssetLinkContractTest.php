<?php

// Linking rented assets that have no contract: the list filter, the bulk endpoint and its refusals.

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
