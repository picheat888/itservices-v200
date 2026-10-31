<?php

// GET /api/service-requests: module gate, filed-date errors and their order, tab scopes, page size and the meta keys.

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RequestListBehaviourTest extends TestCase
{
    use RefreshDatabase;

    private int $created = 0;

    /** @param  list<string>  $permissions */
    private function userWith(string $roleKey, array $permissions): User
    {
        $role = Role::firstOrCreate(['key' => $roleKey], ['name' => $roleKey, 'color' => '#64748b', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::firstOrCreate(['role_id' => $role->id, 'permission' => $permission], ['allowed' => true]);
        }

        return User::factory()->create(['role' => $roleKey]);
    }

    private function filed(string $status, ?User $owner = null): ServiceRequest
    {
        $this->created++;

        return ServiceRequest::create([
            'reference' => sprintf('RQ-2026-%04d', $this->created), 'type' => 'computer', 'origin' => 'direct',
            'requester_name' => 'Somchai', 'title' => 'Request', 'reason' => 'Needed for work.', 'status' => $status,
            'user_id' => $owner?->id,
        ]);
    }

    /** @return list<string> */
    private function references(User $viewer, string $query = ''): array
    {
        $response = $this->actingAs($viewer)->getJson('/api/service-requests?per_page=100&'.$query)->assertOk();

        return collect($response->json('data'))->pluck('reference')->sort()->values()->all();
    }

    public function test_meta_keys_and_their_order(): void
    {
        $viewer = $this->userWith('all', ['requests.module', 'requests.view_all']);
        $this->filed('pending');

        $meta = $this->actingAs($viewer)->getJson('/api/service-requests')->assertOk()->json('meta');

        $this->assertSame(
            ['total', 'per_page', 'current_page', 'last_page', 'pending', 'approved', 'rejected', 'completed', 'cancelled', 'awaiting_me', 'to_complete', 'period'],
            array_keys($meta),
        );
        $this->assertSame(['data', 'meta'], array_keys($this->actingAs($viewer)->getJson('/api/service-requests')->json()));
    }

    public function test_without_the_module_is_a_bare_403_even_with_a_bad_filed_date(): void
    {
        $outsider = $this->userWith('outsider', []);

        $this->actingAs($outsider)->getJson('/api/service-requests?filed_from=bad')
            ->assertForbidden()
            ->assertJsonPath('message', '')
            ->assertJsonMissingPath('errors');
    }

    public function test_bad_filed_dates_are_422_on_their_own_keys(): void
    {
        $viewer = $this->userWith('all', ['requests.module', 'requests.view_all']);

        $this->actingAs($viewer)->getJson('/api/service-requests?filed_from=not-a-date')
            ->assertUnprocessable()->assertJsonValidationErrors(['filed_from', 'filed_to']);
        $this->actingAs($viewer)->getJson('/api/service-requests?filed_days=0')
            ->assertUnprocessable()->assertJsonValidationErrors(['filed_days']);
    }

    public function test_a_bad_filed_date_is_reported_before_a_bad_overview_range(): void
    {
        $viewer = $this->userWith('all', ['requests.module', 'requests.view_all']);

        $errors = $this->actingAs($viewer)->getJson('/api/service-requests?filed_days=0&from=bad')
            ->assertUnprocessable()->json('errors');

        $this->assertSame(['filed_days'], array_keys($errors));
    }

    public function test_queue_scope_is_ignored_without_the_complete_right(): void
    {
        $viewer = $this->userWith('all', ['requests.module', 'requests.view_all']);
        $this->filed('pending');
        $this->filed('approved');

        $this->assertSame($this->references($viewer), $this->references($viewer, 'scope=queue'));
    }

    public function test_queue_scope_keeps_approved_only_with_the_complete_right(): void
    {
        $it = $this->userWith('it', ['requests.module', 'requests.view_all', 'requests.complete']);
        $this->filed('pending');
        $approved = $this->filed('approved');

        $this->assertSame([$approved->reference], $this->references($it, 'scope=queue'));
    }

    public function test_a_plain_member_sees_own_requests_and_the_complete_holder_also_sees_the_queue(): void
    {
        $member = $this->userWith('member', ['requests.module']);
        $closer = $this->userWith('closer', ['requests.module', 'requests.complete']);
        $mine = $this->filed('pending', $member);
        $approved = $this->filed('approved');
        $this->filed('pending');

        $this->assertSame([$mine->reference], $this->references($member));
        $this->assertSame([$approved->reference], $this->references($closer));
    }

    public function test_an_account_with_no_employee_gets_nothing_on_the_approvals_tab(): void
    {
        $viewer = $this->userWith('all', ['requests.module', 'requests.view_all']);
        $this->filed('pending');

        $this->assertSame([], $this->references($viewer, 'scope=approvals'));
    }

    public function test_per_page_is_clamped_to_10_and_100(): void
    {
        $viewer = $this->userWith('all', ['requests.module', 'requests.view_all']);

        $this->assertSame(10, $this->actingAs($viewer)->getJson('/api/service-requests?per_page=1')->json('meta.per_page'));
        $this->assertSame(100, $this->actingAs($viewer)->getJson('/api/service-requests?per_page=500')->json('meta.per_page'));
    }
}
