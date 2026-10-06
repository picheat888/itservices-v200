<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\WriteoffReason;
use App\Models\User;
use App\Services\Contract\ContractService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * "Return to lessor" — a rented asset's own way out of the register (POST
 * /assets/bulk-return-to-vendor). It leaves as a write-off but is stamped returned_to_vendor_at/by,
 * so the return does not hang on a reason from the editable Settings list. Undone through
 * cancel-writeoff, which a closed contract refuses; a contract edit never unlinks it.
 */
class AssetReturnToVendorTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-10-06 10:00:00');
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'ret_'.uniqid(), 'name' => 'Return Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    private function rentedReady(): Asset
    {
        return Asset::factory()->rented()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null]);
    }

    public function test_a_rented_ready_asset_goes_back_to_its_lessor(): void
    {
        $user = User::factory()->create(['role' => 'super']);
        $asset = $this->rentedReady();
        $contractId = $asset->contract_id;

        $this->actingAs($user)->postJson('/api/assets/bulk-return-to-vendor', ['ids' => [$asset->id], 'reason' => 'Lease ended'])
            ->assertOk()
            ->assertJsonPath('updated', 1);

        $asset->refresh();
        $this->assertSame('writeoff', $asset->status->value);
        $this->assertSame('2026-10-06 10:00:00', $asset->written_off_at->toDateTimeString());
        $this->assertSame($user->id, $asset->written_off_by);
        $this->assertSame('2026-10-06 10:00:00', $asset->returned_to_vendor_at->toDateTimeString());
        $this->assertSame($user->id, $asset->returned_to_vendor_by);
        $this->assertNull($asset->writeoff_reason_id);
        $this->assertSame('Lease ended', $asset->last_reason);
        // The contract keeps counting it.
        $this->assertSame($contractId, $asset->contract_id);

        $this->getJson("/api/assets/{$asset->id}")->assertOk()
            ->assertJsonPath('data.returned_to_vendor_at', '2026-10-06 10:00')
            ->assertJsonPath('data.returned_to_vendor_by_name', $user->name);

        $log = AuditLog::where('action', 'Returned asset to lessor')->sole();
        $this->assertSame($asset->id, $log->subject_id);
    }

    public function test_only_rented_assets_go_back_to_a_lessor(): void
    {
        $bought = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null]);
        $rented = $this->rentedReady();

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson('/api/assets/bulk-return-to-vendor', ['ids' => [$rented->id, $bought->id]])
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $message) => str_contains($message, $bought->asset_code));

        // Nothing moves when any of them is refused.
        $this->assertSame('ready', $rented->fresh()->status->value);
        $this->assertSame('ready', $bought->fresh()->status->value);
    }

    public function test_an_asset_still_out_must_come_back_to_the_pool_first(): void
    {
        $out = Asset::factory()->rented()->create(['status' => 'common', 'owner' => 'Meeting room', 'owner_employee_id' => null]);

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson('/api/assets/bulk-return-to-vendor', ['ids' => [$out->id]])
            ->assertStatus(422);

        $this->assertSame('common', $out->fresh()->status->value);
    }

    /** The same permission as a write-off; undoing it takes the cancel-write-off permission. */
    public function test_returning_takes_the_writeoff_permission_and_undoing_it_the_cancel_permission(): void
    {
        $asset = $this->rentedReady();

        $this->actingAs($this->userWith(['assets.view', 'assets.manage']))
            ->postJson('/api/assets/bulk-return-to-vendor', ['ids' => [$asset->id]])
            ->assertForbidden();

        $this->actingAs($this->userWith(['assets.view', 'assets.retire']))
            ->postJson('/api/assets/bulk-return-to-vendor', ['ids' => [$asset->id]])
            ->assertOk();

        $this->actingAs($this->userWith(['assets.view', 'assets.retire']))
            ->postJson("/api/assets/{$asset->id}/cancel-writeoff")
            ->assertForbidden();

        $this->actingAs($this->userWith(['assets.view', 'assets.cancel_writeoff']))
            ->postJson("/api/assets/{$asset->id}/cancel-writeoff")
            ->assertOk();
    }

    public function test_cancelling_a_return_brings_it_back_and_clears_the_return(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $asset = $this->rentedReady();
        $this->postJson('/api/assets/bulk-return-to-vendor', ['ids' => [$asset->id]])->assertOk();

        $this->postJson("/api/assets/{$asset->id}/cancel-writeoff")->assertOk();

        $asset->refresh();
        $this->assertSame('ready', $asset->status->value);
        $this->assertNull($asset->returned_to_vendor_at);
        $this->assertNull($asset->returned_to_vendor_by);
        $this->assertNull($asset->written_off_at);
        $this->assertTrue(AuditLog::where('action', 'Cancelled asset return to lessor')->where('subject_id', $asset->id)->exists());
        $this->assertFalse(AuditLog::where('action', 'Cancelled asset write-off')->exists());
    }

    /** Once its contract is closed, neither a return nor a write-off can be undone. */
    public function test_a_closed_contract_refuses_bringing_its_assets_back(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $returned = $this->rentedReady();
        $contract = Contract::findOrFail($returned->contract_id);
        $lost = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null, 'source' => 'rented', 'contract_id' => $contract->id]);

        $this->postJson('/api/assets/bulk-return-to-vendor', ['ids' => [$returned->id]])->assertOk();
        $lostReason = (int) WriteoffReason::where('name', 'สูญหาย / ถูกโจรกรรม')->value('id');
        $this->postJson('/api/assets/bulk', ['ids' => [$lost->id], 'op' => 'writeoff', 'writeoff_reason_id' => $lostReason])->assertOk();

        // Every asset is out, so the contract can close.
        app(ContractService::class)->cancel($contract->fresh(), 'Lease ended');

        foreach ([$returned, $lost] as $asset) {
            $this->postJson("/api/assets/{$asset->id}/cancel-writeoff")
                ->assertStatus(422)
                ->assertJsonPath('message', fn (string $message) => str_contains($message, (string) $contract->code));
            $this->assertSame('writeoff', $asset->fresh()->status->value);
        }

        // Reopened, it is allowed again.
        app(ContractService::class)->reactivate($contract->fresh());
        $this->postJson("/api/assets/{$returned->id}/cancel-writeoff")->assertOk();
    }

    public function test_a_contract_with_an_asset_still_in_use_cannot_close(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $returned = $this->rentedReady();
        Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null, 'source' => 'rented', 'contract_id' => $returned->contract_id]);
        $this->postJson('/api/assets/bulk-return-to-vendor', ['ids' => [$returned->id]])->assertOk();

        $this->expectException(ValidationException::class);
        app(ContractService::class)->cancel(Contract::findOrFail($returned->contract_id), 'Lease ended');
    }

    /** Editing the contract never unlinks what already went back (or was written off). */
    public function test_editing_the_contract_keeps_returned_assets_linked(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $returned = $this->rentedReady();
        $inUse = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null, 'source' => 'rented', 'contract_id' => $returned->contract_id]);
        $this->postJson('/api/assets/bulk-return-to-vendor', ['ids' => [$returned->id]])->assertOk();

        // Save the contract with no asset selected.
        app(ContractService::class)->update(Contract::findOrFail($returned->contract_id), ['asset_ids' => []]);

        $this->assertSame($returned->contract_id, $returned->fresh()->contract_id);
        $this->assertNull($inUse->fresh()->contract_id);

        $linked = collect($this->getJson("/api/contracts/{$returned->contract_id}")->assertOk()->json('data.linked_assets'))->keyBy('id');
        $this->assertTrue($linked[$returned->id]['returned_to_vendor']);
    }

    /** It cannot stop being a hardware contract while it holds assets that came back. */
    public function test_a_contract_holding_returned_assets_stays_hardware(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $returned = $this->rentedReady();
        $this->postJson('/api/assets/bulk-return-to-vendor', ['ids' => [$returned->id]])->assertOk();
        $contract = Contract::findOrFail($returned->contract_id);

        try {
            app(ContractService::class)->update($contract, ['type' => 'service', 'asset_ids' => []]);
            $this->fail('The type change should have been refused.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('type', $e->errors());
        }

        $this->assertSame('hardware', $contract->fresh()->type->value);
        $this->assertSame($contract->id, $returned->fresh()->contract_id);
    }

    /** "คืนผู้ให้เช่า" left the write-off reasons: the action replaces it. */
    public function test_the_reason_list_no_longer_offers_returning_to_the_lessor(): void
    {
        $this->assertFalse(WriteoffReason::where('name', 'คืนผู้ให้เช่า')->exists());
    }
}
