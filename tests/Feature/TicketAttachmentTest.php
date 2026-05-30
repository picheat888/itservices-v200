<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Ticket;
use App\Models\TicketAttachment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TicketAttachmentTest extends TestCase
{
    use RefreshDatabase;

    /** A login account linked to a fresh employee. */
    private function userWithEmployee(string $role = 'user'): User
    {
        return User::factory()->create([
            'role' => $role,
            'employee_id' => Employee::create(['name' => 'Req', 'status' => 'active'])->id,
        ]);
    }

    public function test_requester_can_upload_an_image_to_their_own_ticket(): void
    {
        Storage::fake('public');
        $user = $this->userWithEmployee();
        $ticket = Ticket::factory()->create(['requester_id' => $user->employee_id]);
        $this->actingAs($user);

        $this->postJson("/api/tickets/{$ticket->id}/attachments", [
            'files' => [UploadedFile::fake()->create('screenshot.png', 200, 'image/png')],
        ])->assertOk()->assertJsonPath('data.attachments.0.name', 'screenshot.png');

        $this->assertSame(1, $ticket->attachments()->count());
        Storage::disk('public')->assertExists($ticket->attachments()->first()->path);
    }

    public function test_pdf_is_accepted(): void
    {
        Storage::fake('public');
        $user = $this->userWithEmployee();
        $ticket = Ticket::factory()->create(['requester_id' => $user->employee_id]);
        $this->actingAs($user);

        $this->postJson("/api/tickets/{$ticket->id}/attachments", [
            'files' => [UploadedFile::fake()->create('manual.pdf', 200, 'application/pdf')],
        ])->assertOk();

        $this->assertSame(1, $ticket->attachments()->count());
    }

    public function test_disallowed_file_type_is_rejected(): void
    {
        Storage::fake('public');
        $user = $this->userWithEmployee();
        $ticket = Ticket::factory()->create(['requester_id' => $user->employee_id]);
        $this->actingAs($user);

        $this->postJson("/api/tickets/{$ticket->id}/attachments", [
            'files' => [UploadedFile::fake()->create('virus.exe', 100, 'application/octet-stream')],
        ])->assertStatus(422)->assertJsonValidationErrors('files.0');

        $this->assertSame(0, TicketAttachment::count());
    }

    public function test_a_stranger_cannot_upload_to_someone_elses_ticket(): void
    {
        Storage::fake('public');
        $ticket = Ticket::factory()->create(); // requested by some other employee
        $this->actingAs($this->userWithEmployee('user'));

        $this->postJson("/api/tickets/{$ticket->id}/attachments", [
            'files' => [UploadedFile::fake()->create('x.png', 100, 'image/png')],
        ])->assertForbidden();
    }

    public function test_attachment_can_be_deleted(): void
    {
        Storage::fake('public');
        $user = $this->userWithEmployee();
        $ticket = Ticket::factory()->create(['requester_id' => $user->employee_id]);
        $this->actingAs($user);

        $this->postJson("/api/tickets/{$ticket->id}/attachments", [
            'files' => [UploadedFile::fake()->create('a.png', 100, 'image/png')],
        ])->assertOk();

        $attachment = $ticket->attachments()->first();

        $this->deleteJson("/api/tickets/{$ticket->id}/attachments/{$attachment->id}")
            ->assertOk()
            ->assertJsonCount(0, 'data.attachments');

        $this->assertSame(0, TicketAttachment::count());
        Storage::disk('public')->assertMissing($attachment->path);
    }
}
