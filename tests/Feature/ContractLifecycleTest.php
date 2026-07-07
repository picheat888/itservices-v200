<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Settings\Vendor;
use App\Services\Contract\ContractService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ContractLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private function contract(array $overrides = []): Contract
    {
        $vendor = Vendor::create(['name' => 'V-'.uniqid()]);

        return Contract::create(array_merge([
            'vendor_id' => $vendor->id, 'name' => 'T', 'title' => 'T', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2027-01-01', 'value' => 100, 'billing_cycle' => 'yearly',
        ], $overrides));
    }

    public function test_expire_sets_expired_at(): void
    {
        $c = $this->contract();
        $c = app(ContractService::class)->expire($c);
        $this->assertNotNull($c->expired_at);
        $this->assertSame('expired', $c->status);
    }

    public function test_expire_twice_throws(): void
    {
        $c = $this->contract(['expired_at' => now()]);
        $this->expectException(ValidationException::class);
        app(ContractService::class)->expire($c);
    }

    public function test_expire_blocked_by_pending_assets_any_type(): void
    {
        $c = $this->contract(['type' => 'software']);
        Asset::create(['tag' => 'A-1', 'category_id' => null, 'status' => 'deployed', 'contract_id' => $c->id]);
        $this->expectException(ValidationException::class);
        app(ContractService::class)->expire($c);
    }
}
