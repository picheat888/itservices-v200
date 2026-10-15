<?php

namespace Tests\Feature;

use App\Models\Contract\Contract;
use App\Models\Contract\ContractAttachment;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ContractAttachmentTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function contract(): Contract
    {
        return Contract::create([
            'code' => 'CT-A-1', 'vendor' => 'Microsoft', 'name' => 'M365', 'type' => 'software',
            'start_date' => now()->subYear(), 'end_date' => now()->addYear(),
            'value' => 1000, 'billing_cycle' => 'yearly',
        ]);
    }

    public function test_uploads_a_pdf_attachment(): void
    {
        Storage::fake('local');
        $this->actingAs($this->super());
        $contract = $this->contract();

        $this->postJson("/api/contracts/{$contract->id}/attachments", [
            'files' => [UploadedFile::fake()->create('agreement.pdf', 200, 'application/pdf')],
        ])->assertOk()->assertJsonPath('data.attachments.0.name', 'agreement.pdf');

        $this->assertSame(1, $contract->attachments()->count());
        Storage::disk('local')->assertExists($contract->attachments()->first()->path);
    }

    public function test_rejects_a_non_pdf_file(): void
    {
        Storage::fake('local');
        $this->actingAs($this->super());
        $contract = $this->contract();

        $this->postJson("/api/contracts/{$contract->id}/attachments", [
            'files' => [UploadedFile::fake()->create('photo.png', 100, 'image/png')],
        ])->assertStatus(422)->assertJsonValidationErrors('files.0');

        $this->assertSame(0, ContractAttachment::count());
    }

    public function test_rejects_an_oversized_pdf(): void
    {
        Storage::fake('local');
        $this->actingAs($this->super());
        $contract = $this->contract();

        // 26 MB exceeds the 25 MB cap.
        $this->postJson("/api/contracts/{$contract->id}/attachments", [
            'files' => [UploadedFile::fake()->create('big.pdf', 26000, 'application/pdf')],
        ])->assertStatus(422)->assertJsonValidationErrors('files.0');

        $this->assertSame(0, ContractAttachment::count());
    }

    public function test_enforces_the_max_file_count(): void
    {
        Storage::fake('local');
        $this->actingAs($this->super());
        $contract = $this->contract();
        for ($i = 0; $i < 5; $i++) {
            $contract->attachments()->create([
                'original_name' => "f{$i}.pdf", 'path' => "contracts/{$contract->id}/f{$i}.pdf",
                'size' => 100, 'mime' => 'application/pdf',
            ]);
        }

        $this->postJson("/api/contracts/{$contract->id}/attachments", [
            'files' => [UploadedFile::fake()->create('one-more.pdf', 100, 'application/pdf')],
        ])->assertStatus(422);

        $this->assertSame(5, $contract->attachments()->count());
    }

    public function test_deletes_an_attachment(): void
    {
        Storage::fake('local');
        $this->actingAs($this->super());
        $contract = $this->contract();
        $this->postJson("/api/contracts/{$contract->id}/attachments", [
            'files' => [UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf')],
        ])->assertOk();
        $attachment = $contract->attachments()->first();

        $this->deleteJson("/api/contracts/{$contract->id}/attachments/{$attachment->id}")->assertOk();

        $this->assertDatabaseMissing('contract_attachments', ['id' => $attachment->id]);
        Storage::disk('local')->assertMissing($attachment->path);
    }

    /** A user whose role grants only contracts.create. */
    private function creatorOnly(): User
    {
        $role = Role::create(['key' => 'creator_'.uniqid(), 'name' => 'Creator', 'is_system' => false]);
        RolePermission::create(['role_id' => $role->id, 'permission' => 'contracts.create', 'allowed' => true]);

        return User::factory()->create(['role' => $role->key]);
    }

    /** The add form uploads right after saving, so a create-only user may attach files to a contract they created. */
    public function test_a_create_only_user_can_attach_to_their_own_contract(): void
    {
        Storage::fake('local');
        $user = $this->creatorOnly();
        $this->actingAs($user);
        $contract = $this->contract();
        $this->assertSame($user->id, $contract->created_by);

        $this->postJson("/api/contracts/{$contract->id}/attachments", [
            'files' => [UploadedFile::fake()->create('agreement.pdf', 100, 'application/pdf')],
        ])->assertOk();
    }

    /** Without contracts.edit, someone else's contract is not theirs to change. */
    public function test_a_create_only_user_cannot_attach_to_another_users_contract(): void
    {
        Storage::fake('local');
        $this->actingAs($this->super());
        $contract = $this->contract();

        $this->actingAs($this->creatorOnly())
            ->postJson("/api/contracts/{$contract->id}/attachments", [
                'files' => [UploadedFile::fake()->create('agreement.pdf', 100, 'application/pdf')],
            ])->assertForbidden();

        $this->assertSame(0, ContractAttachment::count());
    }

    public function test_requires_permission_to_upload(): void
    {
        Storage::fake('local');
        $contract = $this->contract();
        $user = User::factory()->create(['role' => 'user']); // no contract permissions

        $this->actingAs($user)
            ->postJson("/api/contracts/{$contract->id}/attachments", [
                'files' => [UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf')],
            ])->assertForbidden();

        $this->assertSame(0, ContractAttachment::count());
    }

    public function test_deleting_a_contract_removes_its_attachment_files(): void
    {
        Storage::fake('local');
        $this->actingAs($this->super());
        $contract = $this->contract();
        $this->postJson("/api/contracts/{$contract->id}/attachments", [
            'files' => [UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf')],
        ])->assertOk();
        $path = $contract->attachments()->first()->path;

        $this->deleteJson("/api/contracts/{$contract->id}")->assertOk();

        Storage::disk('local')->assertMissing($path);
        $this->assertSame(0, ContractAttachment::count());
    }
}
