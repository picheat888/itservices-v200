<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Settings\Vendor;
use App\Models\User;
use App\Services\Contract\ContractService;
use App\Support\Permissions;
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

    public function test_new_contract_permissions_exist(): void
    {
        $all = Permissions::all();
        $this->assertContains('contracts.cancel', $all);
        $this->assertContains('contracts.expire', $all);
    }

    public function test_admin_default_excludes_cancel_and_expire(): void
    {
        $adminDefaults = Permissions::defaults()['admin'];
        $this->assertNotContains('contracts.cancel', $adminDefaults);
        $this->assertNotContains('contracts.expire', $adminDefaults);
    }

    public function test_expire_endpoint_requires_permission(): void
    {
        $user = User::factory()->create(['role' => 'admin']); // admin ไม่มี contracts.expire
        $c = $this->contract(['end_date' => now()->subDay()]);
        $this->actingAs($user)->postJson("/api/contracts/{$c->id}/expire")->assertForbidden();
    }

    public function test_super_can_expire_and_it_is_permanent(): void
    {
        $super = User::factory()->create(['role' => 'super']);
        $c = $this->contract(['end_date' => now()->subDay()]);

        $this->actingAs($super)->postJson("/api/contracts/{$c->id}/expire")
            ->assertOk()->assertJsonPath('data.status', 'expired');

        // second attempt is rejected (permanent)
        $this->actingAs($super)->postJson("/api/contracts/{$c->id}/expire")->assertStatus(422);
    }

    public function test_summary_separates_overdue_and_expired(): void
    {
        $super = User::factory()->create(['role' => 'super']);
        $this->contract(['end_date' => now()->subDay()]);                      // overdue
        $this->contract(['end_date' => now()->subDay(), 'expired_at' => now()]); // expired

        $this->actingAs($super)->getJson('/api/contracts/summary')
            ->assertOk()
            ->assertJsonPath('overdue', 1)
            ->assertJsonPath('expired', 1);
    }
}
