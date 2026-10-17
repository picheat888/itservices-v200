<?php

// Contract list, detail and summary carry vendor_th (and linked asset type_th) next to the English names.

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Settings\Category;
use App\Models\Settings\Vendor;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContractThaiNamesTest extends TestCase
{
    use RefreshDatabase;

    private function contractFor(Vendor $vendor): Contract
    {
        return Contract::create([
            'vendor_id' => $vendor->id, 'name' => 'Lease', 'type' => 'hardware',
            'start_date' => now()->subMonth()->toDateString(), 'end_date' => now()->addDays(20)->toDateString(),
            'value' => 1000, 'billing_cycle' => 'monthly',
        ]);
    }

    public function test_list_detail_and_summary_carry_vendor_thai_name(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $contract = $this->contractFor(Vendor::create(['name' => 'Acme', 'name_th' => 'แอคมี']));

        $this->getJson('/api/contracts')->assertOk()->assertJsonPath('data.0.vendor_th', 'แอคมี');
        $this->getJson("/api/contracts/{$contract->id}")->assertOk()->assertJsonPath('data.vendor_th', 'แอคมี');
        $summary = $this->getJson('/api/contracts/summary')->assertOk();
        $summary->assertJsonPath('top_vendors.0.vendor_th', 'แอคมี');
        $summary->assertJsonPath('timeline.0.vendor_th', 'แอคมี');
        $summary->assertJsonPath('action_queue.0.vendor_th', 'แอคมี');
    }

    public function test_vendor_twin_is_null_without_thai_name_and_linked_asset_carries_type_th(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $contract = $this->contractFor(Vendor::create(['name' => 'Acme']));
        $category = Category::create(['name' => 'Laptop', 'name_th' => 'แล็ปท็อป']);
        Asset::factory()->create(['contract_id' => $contract->id, 'category_id' => $category->id, 'source' => 'rented']);

        $data = $this->getJson("/api/contracts/{$contract->id}")->assertOk()->json('data');

        $this->assertArrayHasKey('vendor_th', $data);
        $this->assertNull($data['vendor_th']);
        $this->assertSame('แล็ปท็อป', $data['linked_assets'][0]['type_th']);
    }
}
