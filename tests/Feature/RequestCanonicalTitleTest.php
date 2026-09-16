<?php

namespace Tests\Feature;

use App\Enums\Request\RequestType;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Models\User;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\RequestOptionSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * A request's stored title belongs to the SERVER, in one language.
 *
 * Nobody types it — the wizard used to compose "Request: Mail group" / "คำขอ: กลุ่มเมล"
 * from the requester's own UI language and post that, so the same service produced a
 * different string depending on who filed it. That string is what the case subject, the
 * approval email and the search box all read, which made every one of them speak the
 * requester's language instead of the reader's.
 *
 * So: the server composes it, the client cannot override it, and the SPA renders its own
 * wording from `type`. Search has to find a request by its service name in either
 * language regardless of which one the row was stored in.
 */
class RequestCanonicalTitleTest extends TestCase
{
    use RefreshDatabase;

    private User $requester;

    private User $supUser;

    private User $mgrUser;

    private Employee $staff;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmployeePositionSeeder::class);
        $this->seed(RequestOptionSeeder::class);
        $this->seed(WorkflowSeeder::class);

        $mgr = Employee::create(['first_name' => 'Mgr', 'position_id' => $this->positionId('Manager')]);
        $sup = Employee::create(['first_name' => 'Sup', 'manager_id' => $mgr->id, 'position_id' => $this->positionId('Supervisor')]);
        $this->staff = Employee::create([
            'first_name' => 'Staff', 'manager_id' => $sup->id, 'position_id' => $this->positionId('Staff/Officer'),
        ]);

        $this->requester = $this->makeUser('user', ['requests.submit'], $this->staff);
        $this->supUser = $this->makeUser('user', [], $sup);
        $this->mgrUser = $this->makeUser('user', [], $mgr);
    }

    private function positionId(string $title): int
    {
        return Position::where('title', $title)->firstOrFail()->id;
    }

    /** A user on the given role key, with the role granted the listed permissions. */
    private function makeUser(string $roleKey, array $permissions = [], ?Employee $employee = null): User
    {
        $role = Role::firstOrCreate(['key' => $roleKey], ['name' => ucfirst($roleKey), 'color' => '#64748b', 'is_system' => false]);
        foreach ($permissions as $p) {
            RolePermission::updateOrCreate(['role_id' => $role->id, 'permission' => $p], ['allowed' => true]);
        }

        return User::factory()->create(['role' => $roleKey, 'employee_id' => $employee?->id]);
    }

    /** Submit a computer request, optionally posting a title the way the old wizard did. */
    private function submit(array $extra = []): ServiceRequest
    {
        $deviceId = (int) RequestOption::where('request_type', 'computer')->where('label_en', 'Laptop')->value('id');

        $response = $this->actingAs($this->requester)->postJson('/api/service-requests', [
            'type' => 'computer',
            'reason' => 'The current machine can no longer run our test suite.',
            'fields' => ['device_id' => $deviceId, 'qty' => 1],
            ...$extra,
        ])->assertCreated();

        return ServiceRequest::findOrFail($response->json('data.id'));
    }

    public function test_the_server_composes_the_title_and_ignores_whatever_the_client_sends(): void
    {
        // A Thai UI used to post its own rendering. Accepting it is what froze the language.
        $request = $this->submit(['title' => 'คำขอ: คอมพิวเตอร์']);

        $this->assertSame('Request: Computer', $request->title);
    }

    public function test_a_request_submitted_without_a_title_is_accepted(): void
    {
        $request = $this->submit();

        $this->assertSame('Request: Computer', $request->title);
    }

    public function test_the_auto_ticket_subject_does_not_follow_the_requesters_language(): void
    {
        $request = $this->submit(['title' => 'คำขอ: คอมพิวเตอร์']);

        $this->actingAs($this->supUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();
        $this->actingAs($this->mgrUser)->postJson("/api/service-requests/{$request->id}/approve")->assertOk();

        $ticket = $request->fresh()->ticket;
        $this->assertNotNull($ticket);
        $this->assertSame("[{$request->reference}] Request: Computer", $ticket->subject);
    }

    /**
     * @param  string  $term  what somebody types in the search box
     */
    #[DataProvider('searchTerms')]
    public function test_search_finds_a_request_by_its_service_name_in_either_language(string $term): void
    {
        $request = $this->submit();

        $this->actingAs($this->requester)->getJson('/api/service-requests?search='.urlencode($term))
            ->assertOk()
            ->assertJsonPath('data.0.reference', $request->reference);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function searchTerms(): array
    {
        return [
            'english service name' => ['Computer'],
            // The row is stored in English; a Thai reader searches the words they see.
            'thai service name' => ['คอมพิวเตอร์'],
            'reference' => ['RQ-'],
        ];
    }

    public function test_a_row_stored_in_thai_is_still_found_by_the_english_service_name(): void
    {
        // A legacy row, written before the server owned the title.
        $request = $this->submit();
        $request->update(['title' => 'คำขอ: คอมพิวเตอร์']);

        $this->actingAs($this->requester)->getJson('/api/service-requests?search=Computer')
            ->assertOk()
            ->assertJsonPath('data.0.reference', $request->reference);
    }

    public function test_every_type_carries_both_labels(): void
    {
        foreach (RequestType::cases() as $type) {
            $this->assertNotSame('', trim($type->label()), "{$type->value} has no English label");
            $this->assertNotSame('', trim($type->labelTh()), "{$type->value} has no Thai label");
        }
    }

    public function test_the_normalize_command_rewrites_legacy_titles_and_leaves_canonical_ones(): void
    {
        $direct = $this->submit();
        $direct->update(['title' => 'คำขอ: คอมพิวเตอร์']);
        $untouched = $this->submit();

        $this->artisan('requests:normalize-titles', ['--dry-run' => true])->assertSuccessful();
        $this->assertSame('คำขอ: คอมพิวเตอร์', $direct->fresh()->title, 'a dry run must not write');

        $this->artisan('requests:normalize-titles')->assertSuccessful();
        $this->assertSame('Request: Computer', $direct->fresh()->title);
        $this->assertSame('Request: Computer', $untouched->fresh()->title);
    }
}
