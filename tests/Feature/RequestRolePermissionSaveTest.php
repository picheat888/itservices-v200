<?php

// Saving a role on the Permission page stores per-type filing keys and applies the request tree.

namespace Tests\Feature;

use App\Enums\Request\RequestType;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RequestRolePermissionSaveTest extends TestCase
{
    use RefreshDatabase;

    private Role $role;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->role = Role::create(['key' => 'req_save', 'name' => 'Request Save', 'is_system' => false]);
    }

    /** @param list<string> $permissions */
    private function save(array $permissions): void
    {
        $this->putJson("/api/permissions/{$this->role->key}", ['permissions' => $permissions, 'version' => $this->role->permissionsVersion()])->assertOk();
    }

    private function stored(string $key): ?bool
    {
        $row = RolePermission::where('role_id', $this->role->id)->where('permission', $key)->first();

        return $row === null ? null : (bool) $row->allowed;
    }

    public function test_saving_two_types_stores_those_allowed_and_the_other_eleven_denied(): void
    {
        $this->save(['requests.module', 'requests.submit', 'requests.submit_cctv', 'requests.submit_email']);

        $allowed = [];
        foreach (RequestType::cases() as $type) {
            $key = "requests.submit_{$type->value}";
            $this->assertNotNull($this->stored($key));
            if ($this->stored($key)) {
                $allowed[] = $key;
            }
        }

        $this->assertEqualsCanonicalizing(['requests.submit_cctv', 'requests.submit_email'], $allowed);
        $this->assertCount(13, RequestType::cases());
    }

    public function test_cancel_any_without_view_all_is_stored_denied(): void
    {
        $this->save(['requests.module', 'requests.cancel_any']);

        $this->assertFalse($this->stored('requests.cancel_any'));
    }

    public function test_a_type_without_submit_is_stored_denied(): void
    {
        $this->save(['requests.module', 'requests.submit_cctv']);

        $this->assertFalse($this->stored('requests.submit_cctv'));
    }
}
