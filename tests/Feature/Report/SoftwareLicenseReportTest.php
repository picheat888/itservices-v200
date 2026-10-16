<?php

namespace Tests\Feature\Report;

use App\Models\Access\AccessMembership;
use App\Models\Access\Software;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Services\Report\Access\SoftwareLicenseReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * "การใช้ License ซอฟต์แวร์" (access.software_licenses): one row per licence holder, the tiles,
 * and the breakdown (seats per software, leavers to take seats back from, requests waiting).
 */
class SoftwareLicenseReportTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    /** @var array<string, Software> */
    private array $sw;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');

        $this->sw = [
            // Two seats, three active holders: data from before the seat check (or a hand edit).
            'adobe' => $this->software('Adobe', 2, ['active', 'active', 'resigned', 'revoked']),
            'office' => $this->software('Office', 5, ['active']),
            'vscode' => $this->software('VS Code', null, ['active', 'active'], 'free'),
            'zoom' => $this->software('Zoom', 1, ['active']),
        ];
        $this->request($this->sw['zoom'], 'pending', '2026-09-10');
        $this->request($this->sw['zoom'], 'pending', '2026-09-20');
        $this->request($this->sw['office'], 'approved', '2026-09-22');
        // Closed requests wait for nothing.
        $this->request($this->sw['zoom'], 'completed', '2026-08-01');
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions = ['access.software_view']): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @param list<string> $holders one entry per holder: 'active' | 'resigned' | 'revoked' */
    private function software(string $name, ?int $seats, array $holders, string $licenseType = 'subscription'): Software
    {
        $software = Software::create(['name' => $name, 'seats' => $seats, 'license_type' => $licenseType]);
        foreach ($holders as $holder) {
            $this->seq++;
            $employee = Employee::create([
                'code' => sprintf('EMP-%03d', $this->seq), 'first_name' => "Holder{$this->seq}", 'last_name' => 'Test',
                'status' => $holder === 'resigned' ? 'resigned' : 'active', 'last_day' => $holder === 'resigned' ? '2026-09-15' : null,
            ]);
            AccessMembership::create([
                'resource_type' => 'software', 'resource_id' => $software->id, 'employee_id' => $employee->id,
                'granted_at' => '2026-01-0'.min(9, $this->seq), 'revoked_at' => $holder === 'revoked' ? '2026-06-01' : null,
            ]);
        }

        return $software;
    }

    private function request(Software $software, string $status, string $at): ServiceRequest
    {
        $request = ServiceRequest::create([
            'reference' => 'RQ-2026-'.str_pad((string) (++$this->seq), 4, '0', STR_PAD_LEFT), 'type' => 'software', 'status' => $status,
            'requester_name' => 'Requester', 'title' => "Install {$software->name}", 'reason' => 'Work', 'software_id' => $software->id,
        ]);
        $request->forceFill(['created_at' => "{$at} 09:00:00"])->save();

        return $request;
    }

    /** @return list<array<string, mixed>> */
    private function rows(string $query = ''): array
    {
        return $this->actingAs($this->userWith())->getJson('/api/reports/tabular/access.software_licenses/rows'.$query)->assertOk()->json('data');
    }

    public function test_purpose_starts_hidden_but_stays_in_the_file(): void
    {
        $columns = collect($this->actingAs($this->userWith())->getJson('/api/reports/tabular/access.software_licenses')->assertOk()->json('data.columns'))->keyBy('key');

        $this->assertTrue($columns['purpose']['hidden']);
    }

    public function test_the_list_has_a_row_per_holder_leavers_first(): void
    {
        $rows = $this->rows();

        $this->assertCount(7, $rows);
        $this->assertSame('left', $rows[0]['status']);
        $this->assertSame('Adobe', $rows[0]['software']);
        $this->assertSame(10, $rows[0]['left_days']);
        $this->assertSame('subscription', $rows[0]['license_type']);
        $this->assertCount(1, $this->rows('?state=revoked'));
        $this->assertSame(['Zoom'], array_column($this->rows('?software_id='.$this->sw['zoom']->id), 'software'));
    }

    public function test_the_filters_narrow_the_holders_to_the_software_they_keep(): void
    {
        $software = fn (string $query) => array_values(array_unique(array_column($this->rows($query), 'software')));

        $this->assertSame(['Adobe'], $software('?usage=over'));
        $this->assertSame(['Zoom'], $software('?usage=full'));
        $this->assertSame(['Office'], $software('?usage=available'));
        $this->assertSame(['VS Code'], $software('?usage=unlimited'));
        $this->assertSame(['VS Code'], $software('?license_type=free'));
        $this->assertSame(['Zoom'], $software('?search=zoo'));
        $this->assertSame(['Adobe'], $software('?search=Holder1'));
    }

    public function test_tiles_count_software_seats_used_full_and_leavers(): void
    {
        $summary = collect($this->actingAs($this->userWith())->getJson('/api/reports/tabular/access.software_licenses/rows')->assertOk()->json('summary'))->keyBy('key');

        $this->assertSame(4, $summary['sl_software']['value']);
        $this->assertSame(['perpetual' => 0, 'subscription' => 3, 'free' => 1, 'open_source' => 0], array_column($summary['sl_software']['split'], 'value', 'key'));
        // Eight seats on the limited software: four held by people working, one by a leaver, four free (Adobe is one over).
        $this->assertSame(8, $summary['sl_bought']['value']);
        $this->assertSame(['work' => 4, 'gone' => 1, 'free' => 4], array_column($summary['sl_bought']['split'], 'value', 'key'));
        $this->assertSame(7, $summary['sl_used']['value']);
        // Zoom is full with two requests waiting; Adobe is over.
        $this->assertSame(2, $summary['sl_full']['value']);
        $this->assertSame('red', $summary['sl_full']['attention']);
        $this->assertSame(['blocked' => 1, 'full' => 1, 'room' => 1], array_column($summary['sl_full']['split'], 'value', 'key'));
        $this->assertSame(1, $summary['sl_leavers']['value']);
        $this->assertSame(['n' => 1, 'days' => 10], $summary['sl_leavers']['note']['values']);
    }

    public function test_tile_charts_draw_seats_by_month_and_how_long_leavers_have_gone(): void
    {
        $summary = collect($this->actingAs($this->userWith())->getJson('/api/reports/tabular/access.software_licenses/rows')->assertOk()->json('summary'))->keyBy('key');

        // Eight seats held since January; one Adobe seat handed back on 1 June.
        $line = $summary['sl_used']['chart'];
        $this->assertSame('line', $line['kind']);
        $this->assertSame(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'], $line['months']);
        $this->assertSame([8, 8, 7, 7, 7, 7], $line['points']);
        $this->assertSame(['direction' => 'down', 'label_key' => 'rep_n_ac_net_down', 'values' => ['net' => 1]], $summary['sl_used']['note']['trend']);

        // The full tile draws its split bar instead of a chart.
        $this->assertNull($summary['sl_full']['chart']);

        // The leaver left ten days ago.
        $columns = $summary['sl_leavers']['chart'];
        $this->assertSame('columns', $columns['kind']);
        $this->assertSame(['week' => 0, 'month' => 1, 'quarter' => 0, 'older' => 0], array_column($columns['items'], 'value', 'key'));
    }

    public function test_breakdown_ranks_software_and_lists_leavers_and_requests_waiting(): void
    {
        $data = $this->actingAs($this->userWith())->getJson('/api/reports/access/software-licenses/breakdown')->assertOk()->json('data');

        $this->assertSame(['all' => 4, 'full' => 1, 'available' => 1, 'unlimited' => 1, 'over' => 1], $data['usage']);
        $this->assertSame(['active' => 7, 'revoked' => 1], $data['states']);
        $this->assertSame(['Adobe', 'Zoom', 'Office', 'VS Code'], array_column($data['softwares'], 'name'));
        $zoom = $data['softwares'][1];
        $this->assertSame([1, 1, 0, 'full', 2, true], [$zoom['seats'], $zoom['used'], $zoom['left'], $zoom['usage'], $zoom['requests'], $zoom['blocked']]);
        $this->assertSame(1, $data['softwares'][0]['gone']);

        $this->assertSame('EMP-003', $data['leavers'][0]['code']);
        $this->assertSame(['Adobe'], array_column($data['leavers'][0]['grants'], 'name'));

        $this->assertCount(3, $data['requests']);
        $this->assertSame(['Zoom', 'Zoom', 'Office'], array_column(array_column($data['requests'], 'software'), 'name'));
        $this->assertSame([15, 0], [$data['requests'][0]['days'], $data['requests'][0]['seats_left']]);
        $this->assertSame('approved', $data['requests'][2]['status']);
    }

    public function test_the_file_carries_software_leavers_and_requests_as_sheets(): void
    {
        $report = app(SoftwareLicenseReport::class);
        $sections = $report->exportSections($this->userWith(), $report->resolveFilters([]));

        $this->assertSame(['การใช้ License ต่อซอฟต์แวร์', 'เรียกคืนได้จากผู้ลาออก', 'คำขอที่รอ License'], array_column($sections, 'title'));
        $this->assertSame(['Adobe', 2, 3, -1, 150, 'ใช้เกิน'], [$sections[0]['rows'][0][1], ...array_slice($sections[0]['rows'][0], 4, 5)]);
        $this->assertSame('ผู้ถือ License', $report->sheetTitle());
    }

    public function test_searching_a_holder_lists_that_holder_not_every_holder_of_their_software(): void
    {
        $rows = $this->rows('?search=Holder1+Test');
        $this->assertSame(['EMP-001'], array_column($rows, 'employee_code'));
        $this->assertSame(['EMP-001'], array_column($this->rows('?search=Holder1Test'), 'employee_code'));
        $this->assertSame(['EMP-001'], array_column($this->rows('?search=Adobe+Holder1Test'), 'employee_code'));

        // A software found by its own name keeps all its holders.
        $this->assertCount(3, $this->rows('?search=Adobe'));
    }

    public function test_a_picked_software_the_filters_leave_out_is_not_named(): void
    {
        $data = $this->actingAs($this->userWith())
            ->getJson('/api/reports/access/software-licenses/breakdown?software_id='.$this->sw['zoom']->id.'&license_type=free')->json('data');
        $this->assertNull($data['picked']);

        $kept = $this->actingAs($this->userWith())->getJson('/api/reports/access/software-licenses/breakdown?software_id='.$this->sw['zoom']->id)->json('data');
        $this->assertSame('Zoom', $kept['picked']);
    }

    public function test_needs_software_view(): void
    {
        $this->actingAs($this->userWith(['access.module', 'access.email_view']))
            ->getJson('/api/reports/tabular/access.software_licenses/rows')->assertForbidden();
        $this->actingAs($this->userWith(['access.module', 'access.email_view']))
            ->getJson('/api/reports/access/software-licenses/breakdown')->assertForbidden();
    }
}
