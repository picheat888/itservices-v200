<?php

// The asset list's awaiting_contract status: rented assets with no contract, in any status but write-off.

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AssetAwaitingContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_awaiting_contract_status_lists_unlinked_rentals_in_any_status(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $ready = Asset::factory()->rented()->create(['contract_id' => null, 'status' => 'ready']);
        $deployed = Asset::factory()->rented()->create(['contract_id' => null, 'status' => 'deployed']);
        $linked = Asset::factory()->rented()->create(['status' => 'deployed']);
        $bought = Asset::factory()->create(['contract_id' => null, 'status' => 'ready']);
        $writeoff = Asset::factory()->rented()->create(['contract_id' => null, 'status' => 'writeoff']);

        $ids = collect($this->getJson('/api/assets?status=awaiting_contract')->assertOk()->json('data'))->pluck('id');

        $this->assertEqualsCanonicalizing([$ready->id, $deployed->id], $ids->all());
        $this->assertNotContains($linked->id, $ids);
        $this->assertNotContains($bought->id, $ids);
        $this->assertNotContains($writeoff->id, $ids);
    }

    public function test_an_unknown_status_lists_nothing_not_a_500(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        Asset::factory()->rented()->create(['contract_id' => null, 'status' => 'ready']);

        $this->getJson('/api/assets?status=nonsense')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_an_array_status_is_ignored_not_a_500(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        Asset::factory()->rented()->create(['contract_id' => null, 'status' => 'ready']);

        $this->getJson('/api/assets?status[]=ready')->assertOk()->assertJsonCount(1, 'data');
    }
}
