<?php

namespace Tests\Feature;

use App\Enums\Request\RequestType;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\RequestAttachment;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Models\User;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\RequestOptionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Files attached to a service request: what must ride along at submit (a CCTV
 * request cannot be filed without one), who may add or remove them afterwards,
 * and the moment that stops being allowed — the first approver's signature.
 */
class RequestAttachmentTest extends TestCase
{
    use RefreshDatabase;

    private Employee $mgr;

    private Employee $sup;

    private Employee $staff;

    private User $requester;

    private User $supUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmployeePositionSeeder::class);
        $this->seed(RequestOptionSeeder::class);
        $this->seed(WorkflowSeeder::class);
        Storage::fake('local');

        $this->mgr = Employee::create(['first_name' => 'Mgr', 'position_id' => $this->positionId('Manager')]);
        $this->sup = Employee::create([
            'first_name' => 'Sup', 'manager_id' => $this->mgr->id, 'position_id' => $this->positionId('Supervisor'),
        ]);
        $this->staff = Employee::create([
            'first_name' => 'Staff', 'manager_id' => $this->sup->id, 'position_id' => $this->positionId('Staff/Officer'),
        ]);

        $this->requester = $this->makeUser('user', ['requests.submit'], $this->staff);
        $this->supUser = $this->makeUser('user', [], $this->sup);
    }

    private function positionId(string $title): int
    {
        return Position::where('title', $title)->firstOrFail()->id;
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

    /** The seeded "Laptop" choice for the computer form's managed device list. */
    private function deviceOptionId(): int
    {
        return (int) RequestOption::where('request_type', 'computer')
            ->where('label_en', 'Laptop')->value('id');
    }

    /** Submit a CCTV request carrying one file and return it. */
    private function submitCctv(): ServiceRequest
    {
        $response = $this->actingAs($this->requester)->post('/api/service-requests', [
            'type' => RequestType::Cctv->value,
            'reason' => 'The packing bay has no camera covering the loading door.',
            'files' => [UploadedFile::fake()->create('floor-plan.pdf', 120, 'application/pdf')],
        ], ['Accept' => 'application/json'])->assertCreated();

        return ServiceRequest::findOrFail($response->json('data.id'));
    }

    public function test_the_catalog_tells_the_wizard_which_service_demands_a_file(): void
    {
        // The star on the wizard's attachment block and the rule the submit is refused
        // by are the same fact (RequestSchemas::attachmentsRequired); the catalog is how
        // the SPA learns it instead of hard-coding a second copy.
        $response = $this->actingAs($this->requester)->getJson('/api/service-requests/options')->assertOk();

        $byType = collect($response->json('data.types'))->keyBy('type');
        $this->assertTrue($byType[RequestType::Cctv->value]['attachments_required']);
        $this->assertFalse($byType[RequestType::Computer->value]['attachments_required']);

        $response->assertJsonPath('data.attachments.max_files', 5)
            ->assertJsonPath('data.attachments.max_size_kb', 10240);
    }

    public function test_a_cctv_request_cannot_be_filed_without_a_file(): void
    {
        $this->actingAs($this->requester)->post('/api/service-requests', [
            'type' => RequestType::Cctv->value,
            'reason' => 'The packing bay has no camera covering the loading door.',
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('files');

        $this->assertSame(0, ServiceRequest::count());
    }

    public function test_a_cctv_request_is_filed_together_with_its_file(): void
    {
        $request = $this->submitCctv();

        $this->assertSame(1, $request->attachments()->count());
        $attachment = $request->attachments()->first();
        $this->assertSame('floor-plan.pdf', $attachment->original_name);
        Storage::disk('local')->assertExists($attachment->path);
    }

    public function test_a_service_that_does_not_ask_for_a_file_is_filed_without_one(): void
    {
        $this->actingAs($this->requester)->post('/api/service-requests', [
            'type' => RequestType::Computer->value,
            'reason' => 'The current machine can no longer run our test suite.',
            'fields' => ['device_id' => $this->deviceOptionId()],
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->assertSame(1, ServiceRequest::count());
        $this->assertSame(0, RequestAttachment::count());
    }

    public function test_the_requester_adds_a_file_while_nobody_has_signed(): void
    {
        $request = $this->submitCctv();

        $this->actingAs($this->requester)
            ->post("/api/service-requests/{$request->id}/attachments", [
                'files' => [UploadedFile::fake()->image('camera-spot.jpg')],
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.attachments.1.name', 'camera-spot.jpg');

        $this->assertSame(2, $request->attachments()->count());
    }

    public function test_the_requester_removes_a_file_while_nobody_has_signed(): void
    {
        $request = $this->submitCctv();
        $attachment = $request->attachments()->first();

        $this->actingAs($this->requester)
            ->deleteJson("/api/service-requests/{$request->id}/attachments/{$attachment->id}")
            ->assertOk();

        $this->assertDatabaseMissing('request_attachments', ['id' => $attachment->id]);
        Storage::disk('local')->assertMissing($attachment->path);
    }

    public function test_the_first_signature_freezes_the_files(): void
    {
        $request = $this->submitCctv();
        $attachment = $request->attachments()->first();

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $this->actingAs($this->requester)
            ->post("/api/service-requests/{$request->id}/attachments", [
                'files' => [UploadedFile::fake()->image('late.jpg')],
            ], ['Accept' => 'application/json'])
            ->assertForbidden();

        $this->actingAs($this->requester)
            ->deleteJson("/api/service-requests/{$request->id}/attachments/{$attachment->id}")
            ->assertForbidden();

        $this->assertSame(1, $request->attachments()->count());
    }

    public function test_an_approver_does_not_get_to_change_the_requesters_files(): void
    {
        $request = $this->submitCctv();

        // The supervisor is the current approver and may read the request, but the
        // evidence it was filed with is the requester's to manage, not theirs.
        $this->actingAs($this->supUser)
            ->post("/api/service-requests/{$request->id}/attachments", [
                'files' => [UploadedFile::fake()->image('mine.jpg')],
            ], ['Accept' => 'application/json'])
            ->assertForbidden();
    }

    public function test_an_approver_may_download_the_file_and_a_stranger_may_not(): void
    {
        $request = $this->submitCctv();
        $attachment = $request->attachments()->first();
        $url = route('files.request-attachment', $attachment);

        $this->actingAs($this->supUser)->get($url)->assertOk();

        $stranger = $this->makeUser('user', [], Employee::create([
            'first_name' => 'Outsider', 'position_id' => $this->positionId('Staff/Officer'),
        ]));
        $this->actingAs($stranger)->get($url)->assertForbidden();
    }

    public function test_a_request_may_not_carry_more_than_five_files(): void
    {
        $request = $this->submitCctv();

        $this->actingAs($this->requester)
            ->post("/api/service-requests/{$request->id}/attachments", [
                'files' => collect(range(1, 5))
                    ->map(fn (int $i) => UploadedFile::fake()->image("shot-{$i}.jpg"))->all(),
            ], ['Accept' => 'application/json'])
            ->assertStatus(422);

        $this->assertSame(1, $request->attachments()->count());
    }

    public function test_an_executable_is_refused(): void
    {
        $request = $this->submitCctv();

        $this->actingAs($this->requester)
            ->post("/api/service-requests/{$request->id}/attachments", [
                'files' => [UploadedFile::fake()->create('payload.exe', 20, 'application/octet-stream')],
            ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('files.0');

        $this->assertSame(1, $request->attachments()->count());
    }
}
