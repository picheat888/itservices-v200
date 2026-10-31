<?php

// Asset list, summary, transfer log, contract picker and bulk actions: answer shapes, refusals and one audit row per asset.

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Location;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AssetEndpointsBehaviourTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string ...$permissions): User
    {
        $user = User::factory()->create(['role' => 'user']);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $user->role_id, 'permission' => $permission, 'allowed' => true]);
        }

        return $user;
    }

    public function test_the_list_and_summary_answer_shapes(): void
    {
        $this->actingAs($this->userWith('assets.view', 'assets.view_dashboard'));
        Asset::factory()->create(['status' => 'ready']);

        $list = $this->getJson('/api/assets')->assertOk();
        $this->assertSame(['total', 'per_page', 'current_page', 'last_page'], array_keys($list->json('meta')));

        $summary = $this->getJson('/api/assets/summary')->assertOk()->json();
        $this->assertSame(['total', 'deployed', 'ready', 'common', 'pending_acceptance', 'pending_return', 'writeoff', 'total_value', 'by_type', 'top_purchased', 'top_rented', 'activity'], array_keys($summary));
        $this->assertSame(['unit', 'data'], array_keys($summary['activity']));
    }

    public function test_the_transfer_log_row_keys(): void
    {
        $this->actingAs($this->userWith('assets.view', 'assets.transfer'));
        $warehouse = Warehouse::create(['name' => 'Main']);
        $location = Location::create(['name' => 'Floor 1']);
        $asset = Asset::factory()->create(['status' => 'ready', 'warehouse_id' => $warehouse->id]);
        $this->postJson("/api/assets/{$asset->id}/transfer", ['mode' => 'shared', 'owner_label' => 'Meeting room', 'location_id' => $location->id])->assertOk();

        $row = $this->getJson('/api/assets/transfers')->assertOk()->json('data.0');

        $this->assertSame(['id', 'date', 'asset_id', 'asset_tag', 'asset_model', 'kind', 'from_owner', 'to_owner', 'from_name', 'to_name', 'from_name_th', 'to_name_th', 'reason', 'performed_by', 'performed_by_th'], array_keys($row));
    }

    public function test_the_contract_picker_is_a_bare_403_without_a_contract_right(): void
    {
        $this->actingAs($this->userWith('assets.view'));

        $this->getJson('/api/assets/linkable')->assertForbidden()->assertJsonPath('message', '')->assertJsonMissingPath('code');
    }

    public function test_the_contract_picker_answer_shape(): void
    {
        $this->actingAs($this->userWith('contracts.create'));
        Asset::factory()->create(['status' => 'ready', 'contract_id' => null]);

        $response = $this->getJson('/api/assets/linkable')->assertOk();

        $this->assertSame(['id', 'asset_code', 'name', 'type', 'status', 'on_contract'], array_keys($response->json('data.0')));
        $this->assertSame(['total', 'per_page', 'current_page', 'last_page'], array_keys($response->json('meta')));
    }

    public function test_a_bulk_recall_names_each_asset_normal_or_forced(): void
    {
        $this->actingAs($this->userWith('assets.transfer', 'assets.force_recall'));
        $warehouse = Warehouse::create(['name' => 'Main']);
        $common = Asset::factory()->create(['status' => 'common', 'owner' => 'Meeting room']);
        $held = Asset::factory()->create(['status' => 'deployed']);

        $this->postJson('/api/assets/bulk-recall', ['ids' => [$common->id, $held->id], 'warehouse' => $warehouse->name])
            ->assertOk()->assertExactJson(['message' => 'success', 'updated' => 2]);

        $this->assertSame('Recalled asset', AuditLog::where('subject_id', $common->id)->latest('id')->value('action'));
        $this->assertSame('Force-recalled asset', AuditLog::where('subject_id', $held->id)->latest('id')->value('action'));
    }

    public function test_a_bulk_receive_writes_one_audit_row_per_asset(): void
    {
        $this->actingAs($this->userWith('assets.receive'));
        $warehouse = Warehouse::create(['name' => 'Main']);
        $assets = Asset::factory()->count(2)->create(['status' => 'pending_return']);
        $before = AuditLog::where('action', 'Received asset')->count();

        $this->postJson('/api/assets/bulk-receive', ['ids' => $assets->pluck('id')->all(), 'warehouse' => $warehouse->name])
            ->assertOk()->assertExactJson(['message' => 'success', 'updated' => 2]);

        $this->assertSame($before + 2, AuditLog::where('action', 'Received asset')->count());
    }

    public function test_a_bulk_relocate_counts_only_the_assets_that_moved(): void
    {
        $this->actingAs($this->userWith('assets.edit'));
        $here = Location::create(['name' => 'Floor 1']);
        $moving = Asset::factory()->create(['status' => 'deployed']);
        $staying = Asset::factory()->create(['status' => 'deployed', 'location_id' => $here->id]);

        $this->postJson('/api/assets/bulk-location', ['ids' => [$moving->id, $staying->id], 'location_id' => $here->id])
            ->assertOk()->assertExactJson(['message' => 'success', 'updated' => 1]);
        $this->assertSame(1, AuditLog::where('action', 'Updated asset location')->count());
    }

    public function test_a_delete_writes_its_audit_row_and_answers_success(): void
    {
        $this->actingAs($this->userWith('assets.delete'));
        $asset = Asset::factory()->create(['status' => 'ready', 'contract_id' => null]);

        $this->deleteJson("/api/assets/{$asset->id}")->assertOk()->assertExactJson(['message' => 'success']);

        $this->assertModelMissing($asset);
        $this->assertSame('Deleted asset', AuditLog::query()->latest('id')->value('action'));
    }
}
