<?php

namespace Tests\Feature\Report;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\ReportCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

// Reports open by the reports.* switches alone, never by Workspace rights.
class ReportGateTest extends TestCase
{
    use RefreshDatabase;

    /** @param list<string> $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'gate_'.uniqid(), 'name' => 'Report Gate', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @return list<string> */
    private function listedFor(User $user): array
    {
        return array_column($this->actingAs($user)->getJson('/api/reports')->assertOk()->json('data'), 'key');
    }

    public function test_the_report_switch_alone_opens_the_domain(): void
    {
        $user = $this->userWith(['reports.module', 'reports.assets']);

        $this->assertSame(['assets.overview', 'assets.warranty_expiring', 'assets.transfer_history', 'assets.writeoffs'], $this->listedFor($user));
        $this->actingAs($user)->getJson('/api/reports/tabular/assets.overview/rows')->assertOk();
    }

    public function test_workspace_rights_alone_open_nothing(): void
    {
        $user = $this->userWith(['assets.module', 'assets.view', 'tickets.view_all', 'tickets.resolve']);

        $this->assertSame([], $this->listedFor($user));
        $this->actingAs($user)->getJson('/api/reports/tabular/assets.overview/rows')->assertForbidden();
        $this->actingAs($user)->getJson('/api/reports/tickets/overview')->assertForbidden();
    }

    public function test_a_domain_switch_without_the_master_opens_nothing(): void
    {
        $user = $this->userWith(['reports.assets']);

        $this->assertSame([], $this->listedFor($user));
        $this->actingAs($user)->getJson('/api/reports/tabular/assets.overview/rows')->assertForbidden();
    }

    public function test_rentals_open_without_any_asset_right(): void
    {
        $user = $this->userWith(['reports.module', 'reports.contracts']);

        $this->assertSame(['contracts.overview', 'contracts.renewals', 'contracts.rentals'], $this->listedFor($user));
    }

    public function test_each_switch_opens_exactly_its_own_domain(): void
    {
        $expected = [
            'tickets' => ['tickets.overview', 'tickets.backlog', 'tickets.request_sla', 'tickets.manual_sla'],
            'stock' => ['stock.movements', 'stock.below_min', 'stock.valuation'],
            'requests' => ['requests.overview', 'requests.approvals', 'requests.it_pending'],
            'employees' => ['employees.overview', 'employees.open_items'],
            'access' => ['access.overview', 'access.resource_members', 'access.software_licenses'],
        ];

        foreach ($expected as $domain => $keys) {
            $this->assertSame($keys, $this->listedFor($this->userWith(['reports.module', "reports.{$domain}"])), $domain);
        }
    }

    public function test_the_hub_list_reads_the_readers_grants_once(): void
    {
        $user = $this->userWith(['reports.module', 'reports.assets', 'reports.stock'])->fresh();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $keys = array_column(ReportCatalogue::forUser($user), 'key');
        DB::disableQueryLog();
        $grantReads = array_filter(array_column(DB::getQueryLog(), 'query'), fn (string $sql) => str_contains($sql, 'role_permissions'));

        $this->assertCount(7, $keys);
        $this->assertCount(1, $grantReads);
    }

    public function test_ticket_reports_still_keep_to_the_readers_levels(): void
    {
        $none = $this->userWith(['reports.module', 'reports.tickets']);
        $hardware = $this->userWith(['reports.module', 'reports.tickets', 'tickets.level_hardware']);

        $this->actingAs($none)->getJson('/api/reports/tickets/overview?from=2026-09-01&to=2026-09-30')->assertOk()->assertJsonPath('data.options.categories', []);
        $this->actingAs($hardware)->getJson('/api/reports/tickets/overview?from=2026-09-01&to=2026-09-30')->assertOk()->assertJsonPath('data.options.categories', ['hardware']);
    }
}
