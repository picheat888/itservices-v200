<?php

namespace Tests\Feature\Report;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The Report Center lists only what the reader may open — a report they would get a
 * 403 from must not appear on the page at all.
 */
class ReportCatalogueTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    public function test_a_desk_member_sees_the_ticket_report(): void
    {
        $user = $this->userWith(['tickets.view_all', 'tickets.resolve']);

        $this->actingAs($user)->getJson('/api/reports')
            ->assertOk()
            ->assertJsonPath('data.0.key', 'tickets.overview')
            ->assertJsonPath('data.0.domain', 'tickets')
            ->assertJsonPath('data.0.formats', ['xlsx', 'pdf']);
    }

    public function test_view_all_without_resolve_is_not_enough(): void
    {
        $user = $this->userWith(['tickets.view_all']);

        $this->actingAs($user)->getJson('/api/reports')->assertOk()->assertExactJson(['data' => []]);
    }

    public function test_an_ordinary_employee_sees_nothing(): void
    {
        $user = $this->userWith(['tickets.create', 'tickets.my']);

        $this->actingAs($user)->getJson('/api/reports')->assertOk()->assertExactJson(['data' => []]);
    }

    public function test_guests_are_rejected(): void
    {
        $this->getJson('/api/reports')->assertUnauthorized();
    }
}
