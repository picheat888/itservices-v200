<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\WriteoffReason;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Write-off reasons (Settings → Assets): the list starts with the standard reasons, anybody signed
 * in may read it (the write-off dialog picks from it), only settings.assets may change it, and a
 * reason an asset was written off with cannot be deleted.
 */
class WriteoffReasonTest extends TestCase
{
    use RefreshDatabase;

    /** @param list<string> $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'wr_'.uniqid(), 'name' => 'Write-off Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    public function test_the_list_starts_with_the_standard_reasons_in_order(): void
    {
        $this->actingAs($this->userWith([]))
            ->getJson('/api/writeoff-reasons')
            ->assertOk()
            ->assertJsonCount(7, 'data')
            ->assertJsonPath('data.0.name', 'ชำรุด ซ่อมไม่คุ้ม')
            ->assertJsonPath('data.6.name', 'อื่น ๆ');
    }

    public function test_changing_the_list_needs_settings_assets(): void
    {
        $reason = WriteoffReason::firstOrFail();
        $this->actingAs($this->userWith(['assets.view']));

        $this->postJson('/api/writeoff-reasons', ['name' => 'น้ำท่วม'])->assertForbidden();
        $this->putJson("/api/writeoff-reasons/{$reason->id}", ['name' => 'x'])->assertForbidden();
        $this->deleteJson("/api/writeoff-reasons/{$reason->id}")->assertForbidden();
    }

    public function test_an_admin_adds_renames_and_deletes_a_reason(): void
    {
        $admin = $this->userWith(['settings.assets']);
        $this->actingAs($admin);

        $id = $this->postJson('/api/writeoff-reasons', ['name' => 'น้ำท่วม', 'description' => 'เสียหายจากน้ำท่วม'])
            ->assertCreated()->json('data.id');
        $this->postJson('/api/writeoff-reasons', ['name' => 'น้ำท่วม'])->assertUnprocessable()->assertJsonValidationErrors('name');

        $this->putJson("/api/writeoff-reasons/{$id}", ['name' => 'ภัยธรรมชาติ'])->assertOk()->assertJsonPath('data.name', 'ภัยธรรมชาติ');
        $reason = WriteoffReason::findOrFail($id);
        $this->assertSame($admin->id, $reason->created_by);
        $this->assertSame(['Created write-off reason', 'Updated write-off reason'], AuditLog::forSubject($reason)->pluck('action')->all());

        $this->deleteJson("/api/writeoff-reasons/{$id}")->assertOk();
        $this->assertDatabaseMissing('writeoff_reasons', ['id' => $id]);
        $this->assertSame('ภัยธรรมชาติ', AuditLog::where('action', 'Deleted write-off reason')->sole()->details['snapshot']['name']);
    }

    public function test_a_reason_in_use_cannot_be_deleted_and_a_rename_carries_to_its_assets(): void
    {
        $this->actingAs($this->userWith(['settings.assets', 'assets.view']));
        $reason = WriteoffReason::where('name', 'บริจาค')->sole();
        $asset = Asset::factory()->create(['status' => 'writeoff', 'writeoff_reason_id' => $reason->id]);

        $this->deleteJson("/api/writeoff-reasons/{$reason->id}")->assertStatus(409)->assertJson(['message' => 'in_use', 'count' => 1]);
        $this->assertDatabaseHas('writeoff_reasons', ['id' => $reason->id]);

        $this->putJson("/api/writeoff-reasons/{$reason->id}", ['name' => 'บริจาคให้โรงเรียน'])->assertOk();
        $this->getJson("/api/assets/{$asset->id}")->assertOk()->assertJsonPath('data.writeoff_reason', 'บริจาคให้โรงเรียน');
    }
}
