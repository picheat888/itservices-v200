<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Models\Ticket\TicketAttachment;
use App\Models\User;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\RequestOptionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The files a request was filed with, seen from the ticket it opened.
 *
 * The auto-ticket already copies the request into words — subject, requester, the
 * typed fields. The evidence rides along too, but as a reference rather than a
 * second copy: the ticket's row carries the same `path` and names the request
 * attachment it mirrors. What that buys, and what it costs, is held here — one
 * file on disk, reachable under the ticket's own permission, and not the
 * technician's to delete out from under an approved request.
 */
class RequestTicketFileBridgeTest extends TestCase
{
    use RefreshDatabase;

    private User $requester;

    private User $bossUser;

    private User $technician;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmployeePositionSeeder::class);
        $this->seed(RequestOptionSeeder::class);
        $this->seed(WorkflowSeeder::class);
        Storage::fake('local');

        // The boss holds the Supervisor rung the Computer route asks for first; the
        // Manager rung above finds nobody and is skipped, which finishes the chain.
        $boss = Employee::create([
            'first_name' => 'Boss',
            'position_id' => Position::where('title', 'Supervisor')->firstOrFail()->id,
        ]);
        $staff = Employee::create(['first_name' => 'Staff', 'manager_id' => $boss->id]);

        $this->requester = $this->makeUser('user', ['requests.submit'], $staff);
        $this->bossUser = $this->makeUser('user', [], $boss);
        // Deliberately holds no requests.* permission: the point of reading a request's
        // file through the ticket is that the ticket's own permission is enough.
        $this->technician = $this->makeUser('it', ['tickets.view_all'], Employee::create(['first_name' => 'Tech']));
    }

    /** A user on the given role key, with the role granted the listed permissions. */
    private function makeUser(string $roleKey, array $permissions = [], ?Employee $employee = null): User
    {
        $role = Role::firstOrCreate(
            ['key' => $roleKey],
            ['name' => ucfirst($roleKey), 'color' => '#64748b', 'is_system' => false],
        );
        foreach ($permissions as $p) {
            RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => $p], ['allowed' => true]);
        }

        return User::factory()->create(['role' => $roleKey, 'employee_id' => $employee?->id]);
    }

    /** Submit a computer request carrying the given files. */
    private function submitComputer(array $files): ServiceRequest
    {
        $deviceId = (int) RequestOption::where('request_type', 'computer')
            ->where('label_en', 'Desktop PC')->value('id');

        $response = $this->actingAs($this->requester)->post('/api/service-requests', [
            'type' => 'computer',
            'reason' => 'The old machine no longer boots after the last power outage.',
            'fields' => ['device_id' => $deviceId, 'qty' => 1],
            'files' => $files,
        ], ['Accept' => 'application/json'])->assertCreated();

        return ServiceRequest::findOrFail($response->json('data.id'));
    }

    /** Submit with one file and approve it through, returning the finished request. */
    private function approvedRequestWithOneFile(): ServiceRequest
    {
        $request = $this->submitComputer([UploadedFile::fake()->create('quote.pdf', 80, 'application/pdf')]);
        $this->actingAs($this->bossUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        return $request->refresh();
    }

    public function test_the_auto_ticket_shows_the_files_the_request_was_filed_with(): void
    {
        $request = $this->submitComputer([
            UploadedFile::fake()->create('quote.pdf', 80, 'application/pdf'),
            UploadedFile::fake()->image('old-machine.jpg'),
        ]);
        $filesOnDisk = count(Storage::disk('local')->allFiles());

        $this->actingAs($this->bossUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $ticket = $request->refresh()->ticket;
        $this->assertNotNull($ticket, 'the request opened a case');

        $linked = $ticket->attachments()->orderBy('id')->get();
        $this->assertSame(['quote.pdf', 'old-machine.jpg'], $linked->pluck('original_name')->all());

        // A reference, not a copy: same bytes, and nothing new was written.
        $this->assertSame(
            $request->attachments()->orderBy('id')->pluck('path')->all(),
            $linked->pluck('path')->all(),
        );
        $this->assertSame(
            $request->attachments()->orderBy('id')->pluck('id')->all(),
            $linked->pluck('request_attachment_id')->all(),
        );
        $this->assertCount($filesOnDisk, Storage::disk('local')->allFiles(), 'the bytes were duplicated');
    }

    public function test_a_case_that_came_from_no_request_still_opens_with_no_files(): void
    {
        $request = $this->submitComputer([]);
        $this->actingAs($this->bossUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $this->assertSame(0, $request->refresh()->ticket->attachments()->count());
    }

    /**
     * The one hole this arrangement could open: ticket attachments are deleted
     * bytes-and-all, so removing a mirrored file from the case would destroy the
     * evidence an approved request was decided on. It is refused outright.
     */
    public function test_a_technician_may_not_delete_a_file_that_belongs_to_the_request(): void
    {
        $request = $this->approvedRequestWithOneFile();
        $ticket = $request->ticket;
        $mirror = $ticket->attachments()->firstOrFail();

        $this->actingAs($this->technician)
            ->deleteJson("/api/tickets/{$ticket->id}/attachments/{$mirror->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('ticket_attachments', ['id' => $mirror->id]);
        Storage::disk('local')->assertExists($request->attachments()->firstOrFail()->path);
    }

    /** A file the technician uploaded themselves is still theirs to take back. */
    public function test_a_technician_still_deletes_a_file_they_attached_themselves(): void
    {
        $request = $this->approvedRequestWithOneFile();
        $ticket = $request->ticket;

        $this->actingAs($this->technician)->post("/api/tickets/{$ticket->id}/attachments", [
            'files' => [UploadedFile::fake()->image('bench-photo.jpg')],
        ], ['Accept' => 'application/json'])->assertOk();

        $own = $ticket->attachments()->whereNull('request_attachment_id')->firstOrFail();

        $this->actingAs($this->technician)
            ->deleteJson("/api/tickets/{$ticket->id}/attachments/{$own->id}")
            ->assertOk();

        $this->assertDatabaseMissing('ticket_attachments', ['id' => $own->id]);
        Storage::disk('local')->assertMissing($own->path);
    }

    /**
     * Reading the request's file needs nothing from the Request module: the ticket
     * route gates on the ticket's own permission, which is the whole point of
     * showing it there.
     */
    public function test_the_technician_reads_the_request_file_through_the_ticket_route(): void
    {
        $request = $this->approvedRequestWithOneFile();
        $mirror = $request->ticket->attachments()->firstOrFail();

        $this->assertFalse($this->technician->hasPermission('requests.view_all'));

        $this->actingAs($this->technician)->get($mirror->url())->assertOk();
    }

    /** Somebody with no claim on the case reads nothing, mirrored file or not. */
    public function test_a_stranger_reads_nothing_through_the_ticket_route(): void
    {
        $request = $this->approvedRequestWithOneFile();
        $mirror = $request->ticket->attachments()->firstOrFail();

        $stranger = $this->makeUser('outsider', [], Employee::create(['first_name' => 'Nobody']));

        $this->actingAs($stranger)->get($mirror->url())->assertForbidden();
    }

    /**
     * The cap is on what a technician uploads, not on what the request brought with
     * it — otherwise a case that arrived with five files would silently halve the
     * room left for the photos taken while working it.
     */
    public function test_the_mirrored_files_do_not_eat_the_tickets_own_upload_quota(): void
    {
        $request = $this->submitComputer([
            UploadedFile::fake()->create('quote.pdf', 20, 'application/pdf'),
            UploadedFile::fake()->create('specs.pdf', 20, 'application/pdf'),
        ]);
        $this->actingAs($this->bossUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
        $ticket = $request->refresh()->ticket;

        $ten = array_map(fn (int $i) => UploadedFile::fake()->image("bench-{$i}.jpg"), range(1, 10));

        $this->actingAs($this->technician)
            ->post("/api/tickets/{$ticket->id}/attachments", ['files' => $ten], ['Accept' => 'application/json'])
            ->assertOk();

        $this->assertSame(12, $ticket->attachments()->count());

        // And the eleventh upload is still refused.
        $this->actingAs($this->technician)
            ->post("/api/tickets/{$ticket->id}/attachments", [
                'files' => [UploadedFile::fake()->image('one-too-many.jpg')],
            ], ['Accept' => 'application/json'])
            ->assertStatus(422);
    }

    /** The case's file list says where a mirrored file came from. */
    public function test_the_ticket_names_the_request_each_mirrored_file_came_from(): void
    {
        $request = $this->approvedRequestWithOneFile();

        $response = $this->actingAs($this->technician)
            ->getJson("/api/tickets/{$request->ticket_id}")
            ->assertOk();

        $this->assertSame($request->reference, $response->json('data.attachments.0.from_request'));
    }

    /** The database itself refuses to let the original go while a case still shows it. */
    public function test_the_request_file_cannot_be_deleted_while_a_ticket_mirrors_it(): void
    {
        $request = $this->approvedRequestWithOneFile();
        $original = $request->attachments()->firstOrFail();

        $this->assertTrue(
            TicketAttachment::where('request_attachment_id', $original->id)->exists(),
            'the case is mirroring the file',
        );

        $this->expectException(QueryException::class);
        $original->delete();
    }
}
