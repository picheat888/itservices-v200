<?php

namespace Tests\Feature;

use App\Models\Contract;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContractApiTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    public function test_guests_cannot_list_contracts(): void
    {
        $this->getJson('/api/contracts')->assertUnauthorized();
    }

    public function test_super_can_create_and_list_a_contract(): void
    {
        $this->actingAs($this->super());

        $payload = [
            'code' => 'CT-TEST-001',
            'vendor' => 'Microsoft Thailand',
            'name' => 'Microsoft 365 — 320 seats',
            'type' => 'software',
            'start_date' => '2025-01-01',
            'end_date' => '2027-01-01',
            'value' => 2140000,
            'billing_cycle' => 'yearly',
        ];

        $this->postJson('/api/contracts', $payload)
            ->assertCreated()
            ->assertJsonPath('data.vendor', 'Microsoft Thailand')
            ->assertJsonPath('data.value_display', '฿2,140,000/yr')
            ->assertJsonPath('data.status', 'active');

        $this->assertDatabaseHas('contracts', ['vendor' => 'Microsoft Thailand']);
        $this->getJson('/api/contracts')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_summary_reports_status_counts(): void
    {
        $this->actingAs($this->super());

        Contract::create(['vendor' => 'A', 'name' => 'Active', 'type' => 'software', 'start_date' => now()->subYear(), 'end_date' => now()->addYears(1), 'value' => 100000, 'billing_cycle' => 'yearly', 'notify_60' => true]);
        Contract::create(['vendor' => 'B', 'name' => 'Expiring', 'type' => 'service', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(20), 'value' => 10000, 'billing_cycle' => 'monthly', 'notify_30' => true]);
        Contract::create(['vendor' => 'C', 'name' => 'Expired', 'type' => 'connectivity', 'start_date' => now()->subYears(2), 'end_date' => now()->subDays(5), 'value' => 50000, 'billing_cycle' => 'yearly']);

        $this->getJson('/api/contracts/summary')
            ->assertOk()
            ->assertJsonPath('total', 3)
            ->assertJsonPath('active', 1)
            ->assertJsonPath('expiring', 1)
            ->assertJsonPath('expired', 1);
    }

    public function test_expiring_tab_returns_contracts_in_their_reminder_window(): void
    {
        $this->actingAs($this->super());

        // Far out relative to its 60-day reminder — not yet in window.
        Contract::create(['vendor' => 'Far', 'name' => 'Far', 'type' => 'software', 'start_date' => now(), 'end_date' => now()->addYear(), 'value' => 1, 'billing_cycle' => 'yearly', 'notify_60' => true]);
        // Inside its 30-day reminder window.
        Contract::create(['vendor' => 'Soon', 'name' => 'Soon', 'type' => 'software', 'start_date' => now(), 'end_date' => now()->addDays(30), 'value' => 1, 'billing_cycle' => 'yearly', 'notify_30' => true]);

        $this->getJson('/api/contracts?tab=expiring')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.vendor', 'Soon');
    }

    public function test_long_lead_reminder_threshold_enters_window(): void
    {
        $this->actingAs($this->super());

        // 120 days out with the 120-day reminder enabled — should be "in reminder".
        $early = Contract::create(['vendor' => 'Early', 'name' => 'Early', 'type' => 'software', 'start_date' => now(), 'end_date' => now()->addDays(118), 'value' => 1, 'billing_cycle' => 'yearly', 'notify_120' => true]);
        // Same horizon but only a 60-day reminder enabled — still far out.
        Contract::create(['vendor' => 'Quiet', 'name' => 'Quiet', 'type' => 'software', 'start_date' => now(), 'end_date' => now()->addDays(118), 'value' => 1, 'billing_cycle' => 'yearly', 'notify_60' => true]);

        $this->getJson("/api/contracts/{$early->id}")
            ->assertOk()
            ->assertJsonPath('data.in_reminder', true)
            ->assertJsonPath('data.reminder_days', 120);

        $this->getJson('/api/contracts?tab=expiring')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.vendor', 'Early');
    }

    public function test_contract_code_is_required(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/contracts', [
            'vendor' => 'X', 'name' => 'Y', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2026-01-01',
            'value' => 1000, 'billing_cycle' => 'yearly',
        ])->assertStatus(422)->assertJsonValidationErrors('code');
    }

    public function test_user_without_permission_cannot_create_contract(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));

        $this->postJson('/api/contracts', [
            'vendor' => 'X', 'name' => 'Y', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2026-01-01',
            'value' => 1000, 'billing_cycle' => 'yearly',
        ])->assertForbidden();
    }

    public function test_cancel_toggles_the_contract_status(): void
    {
        $this->actingAs($this->super());

        $contract = Contract::create(['vendor' => 'A', 'name' => 'N', 'type' => 'software', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);

        // Cancel.
        $this->postJson("/api/contracts/{$contract->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
        $this->assertNotNull($contract->fresh()->cancelled_at);

        // A cancelled contract is excluded from the active count.
        $this->getJson('/api/contracts/summary')
            ->assertOk()
            ->assertJsonPath('active', 0)
            ->assertJsonPath('cancelled', 1);

        // Toggling again reactivates it.
        $this->postJson("/api/contracts/{$contract->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');
        $this->assertNull($contract->fresh()->cancelled_at);
    }

    public function test_user_without_permission_cannot_cancel_contract(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']));

        $contract = Contract::create(['vendor' => 'A', 'name' => 'N', 'type' => 'software', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);

        $this->postJson("/api/contracts/{$contract->id}/cancel")->assertForbidden();
    }

    public function test_renew_extends_the_contract_term(): void
    {
        $this->actingAs($this->super());

        $contract = Contract::create(['vendor' => 'A', 'name' => 'N', 'type' => 'software', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(10), 'value' => 1, 'billing_cycle' => 'yearly']);
        $oldEnd = $contract->end_date;

        $this->postJson("/api/contracts/{$contract->id}/renew", ['months' => 12])
            ->assertOk();

        $this->assertTrue($contract->fresh()->end_date->gt($oldEnd));
    }
}
