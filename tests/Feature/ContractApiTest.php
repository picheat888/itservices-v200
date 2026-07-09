<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Vendor;
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

    /** Create a vendor (Master Data) and return its id — contract POSTs now send vendor_id. */
    private function vendorId(string $name = 'Acme Vendor'): int
    {
        return Vendor::create(['name' => $name])->id;
    }

    public function test_guests_cannot_list_contracts(): void
    {
        $this->getJson('/api/contracts')->assertUnauthorized();
    }

    public function test_super_can_create_and_list_a_contract(): void
    {
        $this->actingAs($this->super());

        $vendor = Vendor::create(['name' => 'Microsoft Thailand']);
        $payload = [
            'code' => 'CT-TEST-001',
            'vendor_id' => $vendor->id,
            'name' => 'Microsoft 365 — 320 seats',
            'details' => 'Microsoft 365 Enterprise Agreement',
            'type' => 'software',
            'start_date' => '2025-01-01',
            'end_date' => '2027-01-01',
            'value' => 2140000,
            'total_value' => 4280000,
            'billing_cycle' => 'yearly',
        ];

        $this->postJson('/api/contracts', $payload)
            ->assertCreated()
            ->assertJsonPath('data.vendor', 'Microsoft Thailand')
            ->assertJsonPath('data.value_display', '฿2,140,000.00/yr')
            ->assertJsonPath('data.duration_months', 24)
            ->assertJsonPath('data.duration_days', 0)
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.cancelled_at', null)
            ->assertJsonStructure(['data' => ['created_at', 'updated_at']]);

        $this->assertDatabaseHas('contracts', ['vendor_id' => $vendor->id]);
        $this->getJson('/api/contracts')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_contract_payload_includes_linked_assets(): void
    {
        $this->actingAs($this->super());

        $contract = Contract::create([
            'code' => 'CT-LINK-1', 'vendor' => 'Dell', 'name' => 'Server support', 'type' => 'hardware',
            'start_date' => '2025-01-01', 'end_date' => '2027-01-01', 'value' => 100000, 'billing_cycle' => 'yearly',
        ]);
        $dell = Brand::create(['name' => 'Dell']);
        $r750 = AssetModel::create(['name' => 'PowerEdge R750', 'brand_id' => $dell->id]);
        Asset::create([
            'tag' => 'INB-SV-01', 'type' => 'server', 'brand_id' => $dell->id, 'model_id' => $r750->id,
            'status' => 'deployed', 'owner' => 'Rack 2', 'contract_id' => $contract->id,
        ]);
        // An unlinked asset must NOT appear under this contract.
        Asset::create(['tag' => 'INB-LT-01', 'type' => 'laptop', 'status' => 'ready']);

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
        // Past its end date with no admin action taken — this is "overdue" under the
        // new semantics, not "expired" (which is now reserved for the permanent,
        // admin-set `expired_at` action).
        Contract::create(['vendor' => 'C', 'name' => 'Overdue', 'type' => 'connectivity', 'start_date' => now()->subYears(2), 'end_date' => now()->subDays(5), 'value' => 50000, 'billing_cycle' => 'yearly']);
        // Explicitly marked expired by an admin — permanent, counted separately.
        $expired = Contract::create(['vendor' => 'D', 'name' => 'Closed out', 'type' => 'software', 'start_date' => now()->subYears(3), 'end_date' => now()->subYears(2), 'value' => 20000, 'billing_cycle' => 'yearly']);
        $expired->update(['expired_at' => now()]);

        $this->getJson('/api/contracts/summary')
            ->assertOk()
            ->assertJsonPath('total', 4)
            ->assertJsonPath('active', 1)
            ->assertJsonPath('expiring', 1)
            ->assertJsonPath('overdue', 1)
            ->assertJsonPath('expired', 1);
    }

    public function test_expiring_tab_returns_contracts_in_their_reminder_window(): void
    {
        $this->actingAs($this->super());

        // Far out relative to its 60-day reminder — not yet in window.
        Contract::create(['vendor' => 'Far', 'name' => 'Far', 'type' => 'software', 'start_date' => now(), 'end_date' => now()->addYear(), 'value' => 1, 'billing_cycle' => 'yearly', 'notify_60' => true]);
        // Inside its 30-day reminder window.
        Contract::create(['vendor_id' => $this->vendorId('Soon'), 'name' => 'Soon', 'type' => 'software', 'start_date' => now(), 'end_date' => now()->addDays(30), 'value' => 1, 'billing_cycle' => 'yearly', 'notify_30' => true]);

        $this->getJson('/api/contracts?tab=expiring')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.vendor', 'Soon');
    }

    public function test_expired_tab_returns_only_live_past_due_contracts(): void
    {
        $this->actingAs($this->super());

        // Past its end date and still live — should appear.
        Contract::create(['vendor_id' => $this->vendorId('Past'), 'name' => 'Past', 'type' => 'software', 'start_date' => now()->subYears(2), 'end_date' => now()->subDays(5), 'value' => 1, 'billing_cycle' => 'yearly']);
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
        $early = Contract::create(['vendor_id' => $this->vendorId('Early'), 'name' => 'Early', 'type' => 'software', 'start_date' => now(), 'end_date' => now()->addDays(118), 'value' => 1, 'billing_cycle' => 'yearly', 'notify_120' => true]);
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
            'code' => 'CT-LINK-1', 'vendor_id' => $this->vendorId('V'), 'name' => 'N', 'details' => 'T', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-01-01', 'value' => 1000, 'total_value' => 1000, 'billing_cycle' => 'yearly',
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
            'code' => 'CT-LINK-2', 'vendor_id' => $this->vendorId('V2'), 'name' => 'N', 'details' => 'T', 'type' => 'hardware',
            'start_date' => '2026-01-01', 'end_date' => '2027-01-01', 'value' => 1000, 'total_value' => 1000, 'billing_cycle' => 'yearly',
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

    public function test_contract_details_is_required(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/contracts', [
            'code' => 'CT-TEST-002', 'vendor' => 'X', 'name' => 'Y', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2026-01-01',
            'value' => 1000, 'billing_cycle' => 'yearly',
        ])->assertStatus(422)->assertJsonValidationErrors('details');
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
        $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => 'No longer needed'])
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

        $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => 'Ending lease'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('contract');

        $this->assertNull($contract->fresh()->cancelled_at);
    }

    public function test_hardware_contract_cancels_once_every_linked_asset_is_written_off(): void
    {
        $this->actingAs($this->super());

        $contract = Contract::create(['vendor' => 'Dell', 'name' => 'Leased laptops', 'type' => 'hardware', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);
        Asset::create(['tag' => 'RNT-LT-02', 'type' => 'laptop', 'brand' => 'Dell', 'model' => 'Latitude', 'status' => 'writeoff', 'source' => 'rented', 'contract_id' => $contract->id]);

        $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => 'Ending lease'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');

        $this->assertNotNull($contract->fresh()->cancelled_at);
    }

    public function test_non_hardware_contract_is_blocked_from_cancel_until_linked_asset_is_written_off(): void
    {
        $this->actingAs($this->super());

        // The write-off guard used to be hardware-only; it now applies to every
        // contract type, so a non-hardware contract with a live linked asset is
        // blocked from cancellation too.
        $contract = Contract::create(['vendor' => 'X', 'name' => 'Service plan', 'type' => 'service', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);
        $asset = Asset::create(['tag' => 'INB-SV-09', 'type' => 'server', 'brand' => 'Dell', 'model' => 'R750', 'status' => 'deployed', 'contract_id' => $contract->id]);

        $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => 'Service ended'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('contract');
        $this->assertNull($contract->fresh()->cancelled_at);

        // Once the linked asset is written off, cancellation proceeds normally.
        $asset->update(['status' => 'writeoff']);

        $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => 'Service ended'])
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
            'code' => 'CT-NOTES-01', 'vendor_id' => $this->vendorId('TestVendor'), 'name' => 'Notes test contract',
            'details' => 'Notes Round-trip', 'type' => 'software',
            'start_date' => '2026-01-01', 'end_date' => '2027-01-01',
            'value' => 50000, 'billing_cycle' => 'yearly', 'notes' => null,
        ]);

        $payload = [
            'code' => $contract->code, 'vendor_id' => $contract->vendor_id, 'name' => $contract->name,
            'details' => $contract->details, 'type' => $contract->type,
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

    public function test_renaming_a_vendor_propagates_to_contracts(): void
    {
        $this->actingAs($this->super());
        $vendor = Vendor::create(['name' => 'Old Vendor']);
        Contract::create([
            'code' => 'CT-VEN-1', 'vendor_id' => $vendor->id, 'name' => 'N', 'type' => 'software',
            'start_date' => now(), 'end_date' => now()->addYear(), 'value' => 1, 'billing_cycle' => 'yearly',
        ]);

        $vendor->update(['name' => 'New Vendor']);

        $this->getJson('/api/contracts')
            ->assertOk()
            ->assertJsonPath('data.0.vendor', 'New Vendor');
    }

    public function test_vendor_in_use_by_a_contract_cannot_be_deleted(): void
    {
        $this->actingAs($this->super());
        $vendor = Vendor::create(['name' => 'In Use Vendor']);
        Contract::create([
            'code' => 'CT-VEN-2', 'vendor_id' => $vendor->id, 'name' => 'N', 'type' => 'software',
            'start_date' => now(), 'end_date' => now()->addYear(), 'value' => 1, 'billing_cycle' => 'yearly',
        ]);

        $this->deleteJson("/api/vendors/{$vendor->id}")->assertStatus(409);
        $this->assertDatabaseHas('vendors', ['id' => $vendor->id]);
    }

    public function test_contract_json_has_expired_at_and_no_auto_renew(): void
    {
        $this->actingAs($this->super());
        $vendor = Vendor::create(['name' => 'ACME Co']);
        $c = Contract::create([
            'vendor_id' => $vendor->id, 'name' => 'X', 'details' => 'X', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2027-01-01', 'value' => 100, 'billing_cycle' => 'yearly',
        ]);

        $this->getJson("/api/contracts/{$c->id}")
            ->assertOk()
            ->assertJsonPath('data.expired_at', null)
            ->assertJsonMissingPath('data.auto_renew');
    }

    public function test_cancel_requires_a_reason(): void
    {
        $this->actingAs($this->super());
        $contract = Contract::create(['vendor' => 'A', 'name' => 'N', 'type' => 'software', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);

        $this->postJson("/api/contracts/{$contract->id}/cancel")
            ->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->assertNull($contract->fresh()->cancelled_at);
    }

    public function test_cancel_with_a_reason_stores_it(): void
    {
        $this->actingAs($this->super());
        $contract = Contract::create(['vendor' => 'A', 'name' => 'N', 'type' => 'software', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);

        $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => 'Vendor no longer used'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.cancel_reason', 'Vendor no longer used');
        $this->assertSame('Vendor no longer used', $contract->fresh()->cancel_reason);
    }

    public function test_cancel_rejects_a_whitespace_only_reason(): void
    {
        $this->actingAs($this->super());
        $contract = Contract::create(['vendor' => 'A', 'name' => 'N', 'type' => 'software', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);

        // TrimStrings + ConvertEmptyStringsToNull turn "   " into null → required fails.
        $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => '   '])
            ->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->assertNull($contract->fresh()->cancelled_at);
    }

    public function test_reactivate_clears_the_reason_and_needs_none(): void
    {
        $this->actingAs($this->super());
        $contract = Contract::create(['vendor' => 'A', 'name' => 'N', 'type' => 'software', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);
        $contract->update(['cancelled_at' => now(), 'cancel_reason' => 'Old reason']);

        // Reactivation (already cancelled) takes no reason and clears the stored one.
        $this->postJson("/api/contracts/{$contract->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.cancel_reason', null);
        $this->assertNull($contract->fresh()->cancelled_at);
        $this->assertNull($contract->fresh()->cancel_reason);
    }

    public function test_total_value_is_required_on_create_and_stored(): void
    {
        $this->actingAs($this->super());
        $vendor = Vendor::create(['name' => 'TV Co']);

        // Required on create — missing total_value fails validation.
        $this->postJson('/api/contracts', [
            'code' => 'CT-TV-0', 'vendor_id' => $vendor->id, 'name' => 'N', 'details' => 'D', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2026-01-01', 'value' => 100000, 'billing_cycle' => 'monthly',
        ])->assertStatus(422)->assertJsonValidationErrors('total_value');

        // Provided → stored and formatted for display.
        $this->postJson('/api/contracts', [
            'code' => 'CT-TV-1', 'vendor_id' => $vendor->id, 'name' => 'N', 'details' => 'D', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2026-01-01', 'value' => 100000, 'total_value' => 1250000, 'billing_cycle' => 'monthly',
        ])->assertCreated()->assertJsonPath('data.total_value_display', '฿1,250,000.00');
        $this->assertDatabaseHas('contracts', ['code' => 'CT-TV-1', 'total_value' => 1250000]);
    }

    public function test_total_value_is_optional_on_update(): void
    {
        $this->actingAs($this->super());
        $contract = Contract::create([
            'code' => 'CT-TV-UPD', 'vendor_id' => $this->vendorId('UpdV'), 'name' => 'N', 'details' => 'D', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2026-01-01', 'value' => 100000, 'billing_cycle' => 'monthly',
        ]);

        // Editing a legacy contract without a total_value is not blocked.
        $this->putJson("/api/contracts/{$contract->id}", [
            'code' => $contract->code, 'vendor_id' => $contract->vendor_id, 'name' => 'N2', 'details' => 'D', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2026-01-01', 'value' => 100000, 'billing_cycle' => 'monthly',
        ])->assertOk()->assertJsonPath('data.name', 'N2');
    }

    public function test_value_and_total_accept_two_decimals(): void
    {
        $this->actingAs($this->super());
        $vendor = Vendor::create(['name' => 'Dec Co']);

        $this->postJson('/api/contracts', [
            'code' => 'CT-DEC-1', 'vendor_id' => $vendor->id, 'name' => 'N', 'details' => 'D', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2026-01-01', 'value' => 1234.56, 'total_value' => 14814.72, 'billing_cycle' => 'monthly',
        ])->assertCreated()
            ->assertJsonPath('data.value_display', '฿1,234.56/mo')
            ->assertJsonPath('data.total_value_display', '฿14,814.72');
        $this->assertDatabaseHas('contracts', ['code' => 'CT-DEC-1', 'value' => 1234.56, 'total_value' => 14814.72]);
    }

    public function test_duration_reports_months_and_leftover_days(): void
    {
        $this->actingAs($this->super());
        $vendor = Vendor::create(['name' => 'Dur Co']);

        // A 1-day contract must read as 0 months / 1 day (not "1 month").
        $this->postJson('/api/contracts', [
            'code' => 'CT-DUR-1', 'vendor_id' => $vendor->id, 'name' => 'N', 'details' => 'D', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2025-01-02', 'value' => 1, 'total_value' => 1, 'billing_cycle' => 'monthly',
        ])->assertCreated()
            ->assertJsonPath('data.duration_months', 0)
            ->assertJsonPath('data.duration_days', 1);

        // 1 year 6 months 15 days → 18 months, 15 days.
        $this->postJson('/api/contracts', [
            'code' => 'CT-DUR-2', 'vendor_id' => $vendor->id, 'name' => 'N', 'details' => 'D', 'type' => 'software',
            'start_date' => '2025-01-01', 'end_date' => '2026-07-16', 'value' => 1, 'total_value' => 1, 'billing_cycle' => 'monthly',
        ])->assertCreated()
            ->assertJsonPath('data.duration_months', 18)
            ->assertJsonPath('data.duration_days', 15);
    }
}
