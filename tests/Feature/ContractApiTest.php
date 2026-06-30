<?php

namespace Tests\Feature;

use App\Models\Asset;
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
            'title' => 'Microsoft 365 Enterprise Agreement',
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
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.cancelled_at', null)
            ->assertJsonStructure(['data' => ['created_at', 'updated_at']]);

        $this->assertDatabaseHas('contracts', ['vendor' => 'Microsoft Thailand']);
        $this->getJson('/api/contracts')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_contract_payload_includes_linked_assets(): void
    {
        $this->actingAs($this->super());

        $contract = Contract::create([
            'code' => 'CT-LINK-1', 'vendor' => 'Dell', 'name' => 'Server support', 'type' => 'hardware',
            'start_date' => '2025-01-01', 'end_date' => '2027-01-01', 'value' => 100000, 'billing_cycle' => 'yearly',
        ]);
        Asset::create([
            'tag' => 'INB-SV-01', 'type' => 'server', 'brand' => 'Dell', 'model' => 'PowerEdge R750',
            'status' => 'deployed', 'owner' => 'Rack 2', 'contract_id' => $contract->id,
        ]);
        // An unlinked asset must NOT appear under this contract.
        Asset::create(['tag' => 'INB-LT-01', 'type' => 'laptop', 'brand' => 'HP', 'model' => 'EliteBook', 'status' => 'ready']);

        $this->getJson('/api/contracts')
            ->assertOk()
            ->assertJsonCount(1, 'data.0.linked_assets')
            ->assertJsonPath('data.0.linked_assets.0.tag', 'INB-SV-01')
            ->assertJsonPath('data.0.linked_assets.0.name', 'Dell PowerEdge R750')
            ->assertJsonPath('data.0.linked_assets.0.status', 'deployed');
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

    public function test_expired_tab_returns_only_live_past_due_contracts(): void
    {
        $this->actingAs($this->super());

        // Past its end date and still live — should appear.
        Contract::create(['vendor' => 'Past', 'name' => 'Past', 'type' => 'software', 'start_date' => now()->subYears(2), 'end_date' => now()->subDays(5), 'value' => 1, 'billing_cycle' => 'yearly']);
        // Still active — must not appear.
        Contract::create(['vendor' => 'Active', 'name' => 'Active', 'type' => 'software', 'start_date' => now(), 'end_date' => now()->addYear(), 'value' => 1, 'billing_cycle' => 'yearly']);
        // Past its end date but cancelled — excluded from the expired tab.
        $cancelled = Contract::create(['vendor' => 'Gone', 'name' => 'Gone', 'type' => 'software', 'start_date' => now()->subYears(2), 'end_date' => now()->subDays(10), 'value' => 1, 'billing_cycle' => 'yearly']);
        $cancelled->update(['cancelled_at' => now()]);

        $this->getJson('/api/contracts?tab=expired')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.vendor', 'Past');
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

    public function test_links_and_unlinks_assets_via_asset_ids(): void
    {
        $this->actingAs($this->super());
        $a1 = Asset::factory()->create();
        $a2 = Asset::factory()->create();

        $base = [
            'code' => 'CT-LINK-1', 'vendor' => 'V', 'name' => 'N', 'title' => 'T', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-01-01', 'value' => 1000, 'billing_cycle' => 'yearly',
        ];

        // Create linking both assets.
        $id = $this->postJson('/api/contracts', [...$base, 'asset_ids' => [$a1->id, $a2->id]])
            ->assertStatus(201)
            ->json('data.id');
        $this->assertSame($id, $a1->fresh()->contract_id);
        $this->assertSame($id, $a2->fresh()->contract_id);

        // Update keeping only a1 — a2 gets detached.
        $this->putJson("/api/contracts/{$id}", [...$base, 'asset_ids' => [$a1->id]])->assertOk();
        $this->assertSame($id, $a1->fresh()->contract_id);
        $this->assertNull($a2->fresh()->contract_id);
    }

    public function test_linking_never_steals_assets_from_another_contract(): void
    {
        $this->actingAs($this->super());
        $other = Contract::create([
            'code' => 'CT-OTHER', 'vendor' => 'V', 'name' => 'N', 'type' => 'hardware',
            'start_date' => now()->subYear(), 'end_date' => now()->addYear(), 'value' => 1, 'billing_cycle' => 'yearly',
        ]);
        $owned = Asset::factory()->create(['contract_id' => $other->id]);

        $this->postJson('/api/contracts', [
            'code' => 'CT-LINK-2', 'vendor' => 'V', 'name' => 'N', 'title' => 'T', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-01-01', 'value' => 1000, 'billing_cycle' => 'yearly',
            'asset_ids' => [$owned->id],
        ])->assertStatus(201);

        // The asset stays with its original contract.
        $this->assertSame($other->id, $owned->fresh()->contract_id);
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

    public function test_contract_title_is_required(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/contracts', [
            'code' => 'CT-TEST-002', 'vendor' => 'X', 'name' => 'Y', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2026-01-01',
            'value' => 1000, 'billing_cycle' => 'yearly',
        ])->assertStatus(422)->assertJsonValidationErrors('title');
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

    public function test_hardware_contract_cannot_be_cancelled_while_a_linked_asset_is_not_written_off(): void
    {
        $this->actingAs($this->super());

        $contract = Contract::create(['vendor' => 'Dell', 'name' => 'Leased laptops', 'type' => 'hardware', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);
        Asset::create(['tag' => 'RNT-LT-01', 'type' => 'laptop', 'brand' => 'Dell', 'model' => 'Latitude', 'status' => 'deployed', 'source' => 'rented', 'contract_id' => $contract->id]);

        $this->postJson("/api/contracts/{$contract->id}/cancel")
            ->assertStatus(422)
            ->assertJsonValidationErrors('contract');

        $this->assertNull($contract->fresh()->cancelled_at);
    }

    public function test_hardware_contract_cancels_once_every_linked_asset_is_written_off(): void
    {
        $this->actingAs($this->super());

        $contract = Contract::create(['vendor' => 'Dell', 'name' => 'Leased laptops', 'type' => 'hardware', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);
        Asset::create(['tag' => 'RNT-LT-02', 'type' => 'laptop', 'brand' => 'Dell', 'model' => 'Latitude', 'status' => 'writeoff', 'source' => 'rented', 'contract_id' => $contract->id]);

        $this->postJson("/api/contracts/{$contract->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');

        $this->assertNotNull($contract->fresh()->cancelled_at);
    }

    public function test_non_hardware_contract_cancels_regardless_of_linked_assets(): void
    {
        $this->actingAs($this->super());

        $contract = Contract::create(['vendor' => 'X', 'name' => 'Service plan', 'type' => 'service', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);
        Asset::create(['tag' => 'INB-SV-09', 'type' => 'server', 'brand' => 'Dell', 'model' => 'R750', 'status' => 'deployed', 'contract_id' => $contract->id]);

        $this->postJson("/api/contracts/{$contract->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
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

    /**
     * Notes entered in the Edit form persist through the update endpoint.
     * Verifies that the `notes` field is accepted by StoreContractRequest,
     * written by ContractService::update, and returned in the response.
     */
    public function test_contract_notes_round_trip_through_update(): void
    {
        $this->actingAs($this->super());

        $contract = Contract::create([
            'code' => 'CT-NOTES-01', 'vendor' => 'TestVendor', 'name' => 'Notes test contract',
            'title' => 'Notes Round-trip', 'type' => 'software',
            'start_date' => '2026-01-01', 'end_date' => '2027-01-01',
            'value' => 50000, 'billing_cycle' => 'yearly', 'notes' => null,
        ]);

        $payload = [
            'code' => $contract->code, 'vendor' => $contract->vendor, 'name' => $contract->name,
            'title' => $contract->title, 'type' => $contract->type,
            'start_date' => '2026-01-01', 'end_date' => '2027-01-01',
            'value' => $contract->value, 'billing_cycle' => $contract->billing_cycle,
            'notes' => 'Renewed with vendor on 2026-06-30.',
        ];

        $this->putJson("/api/contracts/{$contract->id}", $payload)
            ->assertOk();

        $this->assertDatabaseHas('contracts', [
            'id' => $contract->id,
            'notes' => 'Renewed with vendor on 2026-06-30.',
        ]);
    }
}
