<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Custody actions refuse rights first, then the asset's status, then the fields (AST-20). */
class AssetActionOrderTest extends TestCase
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

    public function test_a_transfer_names_the_asset_status_before_the_missing_fields(): void
    {
        $this->actingAs($this->userWith('assets.transfer'));
        $deployed = Asset::factory()->create(['status' => 'deployed']);
        $writtenOff = Asset::factory()->create(['status' => 'writeoff']);

        $this->postJson("/api/assets/{$deployed->id}/transfer", [])->assertStatus(422)->assertJsonPath('message', 'in_use_return_first');
        $this->postJson("/api/assets/{$writtenOff->id}/transfer", [])->assertStatus(422)->assertJsonPath('message', 'handover_not_ready');
    }

    public function test_no_right_is_a_403_before_anything_else(): void
    {
        $this->actingAs($this->userWith('assets.view'));
        $asset = Asset::factory()->create(['status' => 'writeoff']);

        $this->postJson("/api/assets/{$asset->id}/transfer", [])->assertForbidden();
        $this->postJson("/api/assets/{$asset->id}/recall", [])->assertForbidden();
        $this->postJson('/api/assets/bulk-transfer', [])->assertForbidden();
        $this->postJson('/api/assets/bulk-recall', [])->assertForbidden();
        $this->deleteJson("/api/assets/{$asset->id}")->assertForbidden();
    }

    public function test_a_bulk_action_checks_its_fields_before_the_picked_statuses(): void
    {
        $this->actingAs($this->userWith('assets.transfer', 'assets.receive', 'assets.edit'));
        $writtenOff = Asset::factory()->create(['status' => 'writeoff']);

        $this->postJson('/api/assets/bulk-transfer', ['ids' => [$writtenOff->id]])->assertStatus(422)->assertJsonValidationErrors(['mode', 'location_id']);
        $this->postJson('/api/assets/bulk-receive', ['ids' => [$writtenOff->id]])->assertStatus(422)->assertJsonValidationErrors('warehouse');
        $this->postJson('/api/assets/bulk-location', ['ids' => [$writtenOff->id]])->assertStatus(422)->assertJsonValidationErrors('location_id');
    }

    public function test_a_recall_by_a_transfer_role_keeps_its_refusal_codes(): void
    {
        $this->actingAs($this->userWith('assets.transfer'));
        $deployed = Asset::factory()->create(['status' => 'deployed']);

        $this->postJson("/api/assets/{$deployed->id}/recall", [])->assertStatus(422)->assertJsonPath('message', 'recall_not_allowed');
    }
}
