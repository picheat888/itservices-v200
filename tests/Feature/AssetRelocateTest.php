<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Location;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * "Update location" — the desk moved, the asset went with it.
 *
 * The whole point of this endpoint is what it does NOT do: it must not change who holds
 * the asset, must not push it back into pending-acceptance, and must not tell anybody
 * (nothing is being handed over, so there is nothing to accept). Those are the assertions
 * that matter here — a future refactor routing this through AssetService::transfer() would
 * look harmless and would quietly do all three.
 */
class AssetRelocateTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function location(string $name): Location
    {
        return Location::create(['name' => $name]);
    }

    /** An asset in active use by a real employee, sitting at a known location. */
    private function deployedAsset(Location $at, string $code = 'EMP-RL1'): Asset
    {
        $employee = Employee::create(['code' => $code, 'first_name' => 'Desk', 'last_name' => 'Mover']);

        return Asset::factory()->create([
            'status' => 'deployed',
            'owner' => null,
            'owner_employee_id' => $employee->id,
            'location_id' => $at->id,
            'warehouse_id' => null,
        ]);
    }

    public function test_it_moves_a_deployed_asset_and_leaves_custody_alone(): void
    {
        Notification::fake();
        Bus::fake();
        $this->actingAs($this->super());

        $from = $this->location('INK4 - Packing');
        $to = $this->location('HQ - 3rd floor');
        $asset = $this->deployedAsset($from);
        $owner = $asset->owner_employee_id;

        $this->postJson('/api/assets/bulk-location', [
            'ids' => [$asset->id],
            'location_id' => $to->id,
            'note' => 'Moved desk to the 3rd floor',
        ])->assertOk()->assertJsonPath('updated', 1);

        $asset->refresh();
        $this->assertSame($to->id, $asset->location_id);
        // Everything custody-related is untouched.
        $this->assertSame($owner, $asset->owner_employee_id);
        $this->assertSame('deployed', $asset->status->value);
        $this->assertNull($asset->warehouse_id);
        // Nobody has to accept a desk move, so nobody hears about it.
        Notification::assertNothingSent();
        Bus::assertNothingDispatched();
        // Silent to the staff, but not to the system log: an attribute changed by hand is
        // exactly what the audit trail is for.
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'Updated asset location',
            'target' => "{$asset->asset_code} → HQ - 3rd floor",
        ]);
    }

    public function test_the_move_is_recorded_as_place_to_place_on_the_asset_history(): void
    {
        $this->actingAs($this->super());

        $from = $this->location('INK4 - Packing');
        $to = $this->location('HQ - 3rd floor');
        $asset = $this->deployedAsset($from);

        $this->postJson('/api/assets/bulk-location', [
            'ids' => [$asset->id], 'location_id' => $to->id, 'note' => 'Desk move',
        ])->assertOk();

        // The trail row carries places, not people — that is what the History tab renders.
        $this->assertDatabaseHas('asset_transfers', [
            'asset_id' => $asset->id,
            'kind' => 'relocate',
            'from_owner' => 'INK4 - Packing',
            'to_owner' => 'HQ - 3rd floor',
            'reason' => 'Desk move',
        ]);

        $this->getJson("/api/assets/{$asset->id}")
            ->assertOk()
            ->assertJsonPath('data.transfers.0.kind', 'relocate')
            ->assertJsonPath('data.transfers.0.from_owner', 'INK4 - Packing')
            ->assertJsonPath('data.transfers.0.to_owner', 'HQ - 3rd floor');

        // …but it is not an ownership change, so it stays out of the cross-asset transfer list.
        $this->getJson('/api/assets/transfers')->assertOk()->assertJsonCount(0, 'data');
    }

    /**
     * The trail stores employee codes on purpose (a snapshot that survives a rename), which
     * reads as "EMP-14 → EMP-16" on screen. The detail payload resolves them to names so the
     * History tab can show a person; a warehouse name is not a code and must pass through.
     */
    public function test_the_history_resolves_employee_codes_to_names(): void
    {
        $this->actingAs($this->super());

        $warehouse = Warehouse::firstOrCreate(['name' => 'Central IT']);
        $employee = Employee::create(['code' => 'EMP-NAME1', 'first_name' => 'Somchai', 'last_name' => 'Jaidee']);
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null, 'warehouse_id' => $warehouse->id]);
        $location = $this->location('HQ - 3rd floor');

        $this->postJson("/api/assets/{$asset->id}/transfer", [
            'mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id,
        ])->assertOk();

        $this->getJson("/api/assets/{$asset->id}")
            ->assertOk()
            ->assertJsonPath('data.transfers.0.to_owner', 'EMP-NAME1')
            ->assertJsonPath('data.transfers.0.to_name', 'Somchai Jaidee')
            // The origin was the warehouse, not a person — nothing to resolve.
            ->assertJsonPath('data.transfers.0.from_owner', 'Central IT')
            ->assertJsonPath('data.transfers.0.from_name', null);
    }

    public function test_only_assets_in_use_can_be_relocated(): void
    {
        $this->actingAs($this->super());
        $to = $this->location('HQ - 3rd floor');
        $warehouse = Warehouse::firstOrCreate(['name' => 'Central IT']);

        // Pooled: it lives in a warehouse, it has no location to correct.
        $pooled = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null, 'warehouse_id' => $warehouse->id]);
        $this->postJson('/api/assets/bulk-location', ['ids' => [$pooled->id], 'location_id' => $to->id])->assertStatus(422);

        // Handed over but not yet accepted: it has not arrived anywhere yet.
        $pending = Asset::factory()->create(['status' => 'pending_acceptance', 'owner' => 'EMP-RL9']);
        $this->postJson('/api/assets/bulk-location', ['ids' => [$pending->id], 'location_id' => $to->id])->assertStatus(422);

        $this->assertDatabaseCount('asset_transfers', 0);
    }

    public function test_a_shared_asset_can_be_relocated(): void
    {
        $this->actingAs($this->super());
        $from = $this->location('Meeting room 1');
        $to = $this->location('Meeting room 2');
        $asset = Asset::factory()->create(['status' => 'common', 'owner' => 'Meeting room', 'owner_employee_id' => null, 'location_id' => $from->id]);

        $this->postJson('/api/assets/bulk-location', ['ids' => [$asset->id], 'location_id' => $to->id])->assertOk();

        $asset->refresh();
        $this->assertSame($to->id, $asset->location_id);
        $this->assertSame('common', $asset->status->value);
        $this->assertSame('Meeting room', $asset->owner);
    }

    public function test_it_relocates_every_selected_asset_at_once(): void
    {
        $this->actingAs($this->super());
        $from = $this->location('INK4 - Packing');
        $to = $this->location('HQ - 3rd floor');
        $one = $this->deployedAsset($from, 'EMP-RL2');
        $two = $this->deployedAsset($from, 'EMP-RL3');

        $this->postJson('/api/assets/bulk-location', ['ids' => [$one->id, $two->id], 'location_id' => $to->id])
            ->assertOk()
            ->assertJsonPath('updated', 2);

        $this->assertSame($to->id, $one->fresh()->location_id);
        $this->assertSame($to->id, $two->fresh()->location_id);
        $this->assertDatabaseCount('asset_transfers', 2);

        // "2 assets → HQ" on its own names nobody, so the codes ride along in the details.
        $entry = AuditLog::where('action', 'Updated asset location')->latest('id')->firstOrFail();
        $this->assertSame([$one->asset_code, $two->asset_code], $entry->details['items']);
    }

    public function test_updating_a_location_needs_the_edit_permission(): void
    {
        $from = $this->location('INK4 - Packing');
        $to = $this->location('HQ - 3rd floor');
        $asset = $this->deployedAsset($from);

        // Viewing the inventory is not enough to correct a record.
        $viewer = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $viewer->role_id, 'permission' => 'assets.view', 'allowed' => true]);
        $this->actingAs($viewer)
            ->postJson('/api/assets/bulk-location', ['ids' => [$asset->id], 'location_id' => $to->id])
            ->assertForbidden();
        $this->assertSame($from->id, $asset->fresh()->location_id);

        // assets.edit is the right key: this corrects an attribute, it does not move custody.
        $editor = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $editor->role_id, 'permission' => 'assets.edit', 'allowed' => true]);
        $this->actingAs($editor)
            ->postJson('/api/assets/bulk-location', ['ids' => [$asset->id], 'location_id' => $to->id])
            ->assertOk();
        $this->assertSame($to->id, $asset->fresh()->location_id);
    }
}
