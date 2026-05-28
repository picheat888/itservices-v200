<?php

namespace Tests\Feature;

use App\Models\Contract;
use App\Models\ContractAttachment;
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
        Storage::fake('public');
        $this->actingAs($this->super());
        $contract = $this->contract();

        $this->postJson("/api/contracts/{$contract->id}/attachments", [
            'files' => [UploadedFile::fake()->create('agreement.pdf', 200, 'application/pdf')],
        ])->assertOk()->assertJsonPath('data.attachments.0.name', 'agreement.pdf');

        $this->assertSame(1, $contract->attachments()->count());
        Storage::disk('public')->assertExists($contract->attachments()->first()->path);
    }

    public function test_rejects_a_non_pdf_file(): void
    {
        Storage::fake('public');
        $this->actingAs($this->super());
        $contract = $this->contract();

        $this->postJson("/api/contracts/{$contract->id}/attachments", [
            'files' => [UploadedFile::fake()->create('photo.png', 100, 'image/png')],
        ])->assertStatus(422)->assertJsonValidationErrors('files.0');

        $this->assertSame(0, ContractAttachment::count());
    }

    public function test_rejects_an_oversized_pdf(): void
    {
        Storage::fake('public');
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
        Storage::fake('public');
        $this->actingAs($this->super());
        $contract = $this->contract();
        for ($i = 0; $i < 10; $i++) {
            $contract->attachments()->create([
                'original_name' => "f{$i}.pdf", 'path' => "contracts/{$contract->id}/f{$i}.pdf",
                'size' => 100, 'mime' => 'application/pdf',
            ]);
        }

        $this->postJson("/api/contracts/{$contract->id}/attachments", [
            'files' => [UploadedFile::fake()->create('one-more.pdf', 100, 'application/pdf')],
        ])->assertStatus(422);

        $this->assertSame(10, $contract->attachments()->count());
    }

    public function test_deletes_an_attachment(): void
    {
        Storage::fake('public');
        $this->actingAs($this->super());
        $contract = $this->contract();
        $this->postJson("/api/contracts/{$contract->id}/attachments", [
            'files' => [UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf')],
        ])->assertOk();
        $attachment = $contract->attachments()->first();

        $this->deleteJson("/api/contracts/{$contract->id}/attachments/{$attachment->id}")->assertOk();

        $this->assertDatabaseMissing('contract_attachments', ['id' => $attachment->id]);
        Storage::disk('public')->assertMissing($attachment->path);
    }

    public function test_requires_permission_to_upload(): void
    {
        Storage::fake('public');
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
        Storage::fake('public');
        $this->actingAs($this->super());
        $contract = $this->contract();
        $this->postJson("/api/contracts/{$contract->id}/attachments", [
            'files' => [UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf')],
        ])->assertOk();
        $path = $contract->attachments()->first()->path;

        $this->deleteJson("/api/contracts/{$contract->id}")->assertOk();

        Storage::disk('public')->assertMissing($path);
        $this->assertSame(0, ContractAttachment::count());
    }
}
