<?php

namespace Tests\Feature\Report;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\ReportCatalogue;
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
            ->assertJsonPath('data.0.formats', ['xlsx', 'pdf'])
            ->assertJsonPath('data.0.kind', 'custom');
    }

    public function test_asset_and_contract_viewers_see_their_own_reports_only(): void
    {
        $user = $this->userWith(['contracts.view']);

        $keys = array_column($this->actingAs($user)->getJson('/api/reports')->assertOk()->json('data'), 'key');

        $this->assertSame(['contracts.expiring', 'contracts.monthly_cost'], $keys);
    }

    public function test_stock_reports_split_between_view_and_the_event_log(): void
    {
        $keysFor = fn (array $permissions) => array_column(
            $this->actingAs($this->userWith($permissions))->getJson('/api/reports')->assertOk()->json('data'), 'key');

        $this->assertSame(['stock.below_min', 'stock.valuation'], $keysFor(['stock.view']));
        $this->assertSame(['stock.movements'], $keysFor(['stock.view_events']));
    }

    public function test_request_employee_and_access_reports_follow_their_module_permission(): void
    {
        $keysFor = fn (array $permissions) => array_column(
            $this->actingAs($this->userWith($permissions))->getJson('/api/reports')->assertOk()->json('data'), 'key');

        $this->assertSame(['requests.summary', 'requests.approval_time', 'requests.it_pending'], $keysFor(['requests.view_all']));
        $this->assertSame(['employees.joiners_leavers', 'employees.leaver_assets'], $keysFor(['employees.view']));
        $this->assertSame(['access.software_licenses'], $keysFor(['access.software_view']));
        // Submitting or completing requests is not reading them all.
        $this->assertSame([], $keysFor(['requests.submit', 'requests.complete']));
    }

    /**
     * `range` decides whether a Report Center link hands the report the hub's period; a report
     * flagged without from/to would just shed the query, one with them but unflagged would miss it.
     */
    public function test_the_range_flag_matches_each_reports_own_date_filters(): void
    {
        foreach (ReportCatalogue::definitions() as $key => $definition) {
            $report = ReportCatalogue::tabular($key);
            $names = $report ? array_map(fn ($f) => $f->name, $report->filters()) : ['from', 'to'];
            $hasRange = in_array('from', $names, true) && in_array('to', $names, true);

            $this->assertSame($hasRange, $definition['range'] ?? false, $key);
        }

        $listed = collect($this->actingAs($this->userWith(['tickets.view_all', 'tickets.resolve', 'stock.view', 'stock.view_events']))
            ->getJson('/api/reports')->assertOk()->json('data'))->keyBy('key');
        $this->assertTrue($listed['tickets.overview']['range']);
        $this->assertTrue($listed['stock.movements']['range']);
        $this->assertFalse($listed['stock.below_min']['range']);
    }

    public function test_every_mockup_report_is_listed_for_a_reader_with_every_permission(): void
    {
        $keysFor = fn (array $permissions) => array_column(
            $this->actingAs($this->userWith($permissions))->getJson('/api/reports')->assertOk()->json('data'), 'key');

        $this->assertSame(
            ['tickets.overview', 'tickets.backlog'],
            $keysFor(['tickets.view_all', 'tickets.resolve']),
        );
        $this->assertSame(
            ['assets.register', 'assets.warranty_expiring', 'assets.by_status_department', 'assets.transfer_history'],
            $keysFor(['assets.view']),
        );
        $this->assertCount(17, $keysFor([
            'tickets.view_all', 'tickets.resolve', 'assets.view', 'contracts.view', 'stock.view', 'stock.view_events',
            'requests.view_all', 'employees.view', 'access.software_view',
        ]));
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
