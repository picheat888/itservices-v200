<?php

namespace Tests\Feature;

use App\Models\Access\FileShare;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\RequestOption;
use App\Models\User;
use App\Services\Request\RequestSourceService;
use App\Support\RequestSchemas;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

// One list of the New Request form, reloaded on its own: current rows, gated by the request type.
class RequestFieldOptionsTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string ...$permissions): User
    {
        $user = User::factory()->create(['role' => 'staff']);
        $staffRole = Role::where('key', 'staff')->first();
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $staffRole->id, 'permission' => $permission, 'allowed' => true]);
        }

        return $user;
    }

    private function share(string $code, string $path): FileShare
    {
        return FileShare::create(['code' => $code, 'name' => basename(str_replace('\\', '/', $path)), 'path' => $path]);
    }

    public function test_a_permitted_user_gets_the_current_file_shares(): void
    {
        $user = $this->userWith('requests.module', 'requests.submit', 'requests.submit_fileshare');
        $this->share('FS-1', '\\\\fs01\\Production');

        $this->actingAs($user)->getJson('/api/service-requests/options/fileshare/file_share_id')
            ->assertOk()
            ->assertJsonPath('data.0.label', '\\\\fs01\\Production');

        $this->share('FS-2', '\\\\fs01\\Engineering');

        $labels = collect($this->actingAs($user)->getJson('/api/service-requests/options/fileshare/file_share_id')->json('data'))->pluck('label');
        $this->assertEqualsCanonicalizing(['\\\\fs01\\Production', '\\\\fs01\\Engineering'], $labels->all());
    }

    public function test_without_the_type_permission_the_list_is_refused(): void
    {
        $user = $this->userWith('requests.module', 'requests.submit', 'requests.submit_mailgroup');
        $this->share('FS-1', '\\\\fs01\\Production');

        $this->actingAs($user)->getJson('/api/service-requests/options/fileshare/file_share_id')->assertForbidden();
    }

    public function test_an_unknown_type_is_refused_and_a_plain_field_is_not_found(): void
    {
        $user = $this->userWith('requests.module', 'requests.submit', 'requests.submit_fileshare');

        // No one holds requests.submit_<unknown>, so the permission check answers first
        $this->actingAs($user)->getJson('/api/service-requests/options/nope/x')->assertForbidden();
        $this->actingAs($user)->getJson('/api/service-requests/options/fileshare/access_level')->assertNotFound();
        $this->actingAs($user)->getJson('/api/service-requests/options/fileshare/missing_field')->assertNotFound();
    }

    public function test_a_managed_list_returns_only_active_choices(): void
    {
        $user = $this->userWith('requests.module', 'requests.submit', 'requests.submit_hardware');
        $active = RequestOption::create(['request_type' => 'hardware', 'field_key' => 'device_id', 'label_en' => 'Monitor', 'label_th' => 'จอภาพ', 'sort_order' => 1, 'active' => true]);
        RequestOption::create(['request_type' => 'hardware', 'field_key' => 'device_id', 'label_en' => 'Fax', 'label_th' => null, 'sort_order' => 2, 'active' => false]);

        $this->actingAs($user)->getJson('/api/service-requests/options/hardware/device_id')
            ->assertOk()
            ->assertExactJson(['data' => [['value' => (string) $active->id, 'label_en' => 'Monitor', 'label_th' => 'จอภาพ']]]);
    }

    public function test_the_catalog_only_carries_the_sources_its_types_use(): void
    {
        $user = $this->userWith('requests.module', 'requests.submit', 'requests.submit_mailgroup');

        $sources = $this->actingAs($user)->getJson('/api/service-requests/options')->assertOk()->json('data.sources');

        $this->assertArrayHasKey('email_groups', $sources);
        $this->assertArrayNotHasKey('file_shares', $sources);
    }

    public function test_one_managed_list_is_read_with_one_query(): void
    {
        RequestOption::create(['request_type' => 'hardware', 'field_key' => 'device_id', 'label_en' => 'Monitor', 'label_th' => null, 'sort_order' => 1, 'active' => true]);
        RequestSchemas::flushManagedCache();

        DB::enableQueryLog();
        $choices = app(RequestSourceService::class)->field('hardware', 'device_id');

        $this->assertCount(1, $choices);
        $this->assertCount(1, DB::getQueryLog());
    }

    public function test_an_unknown_source_has_no_rows(): void
    {
        $this->assertSame([], app(RequestSourceService::class)->rows('nope'));
    }
}
