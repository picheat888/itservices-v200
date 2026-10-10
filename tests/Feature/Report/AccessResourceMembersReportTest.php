<?php

namespace Tests\Feature\Report;

use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Services\Report\Access\AccessResourceMembersReport;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * "ตรวจสอบสมาชิกและเจ้าของ" (access.resource_members): one row per member of the email groups, file
 * shares and social accounts, the tiles, the resource table, and one resource's review sheet (PDF).
 */
class AccessResourceMembersReportTest extends TestCase
{
    use RefreshDatabase;

    private const VIEW = ['access.email_view', 'access.file_view', 'access.social_view'];

    /** @var array<string, AccessMembership> */
    private array $grants;

    /** @var array<string, Model> */
    private array $set;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');

        $prod = Department::create(['name' => 'Production', 'name_th' => 'ฝ่ายผลิต', 'tag' => 'PD']);
        $qc = Department::create(['name' => 'Quality', 'name_th' => 'ฝ่ายควบคุมคุณภาพ', 'tag' => 'QC']);
        $person = fn (string $code, Department $d, array $extra = []) => Employee::create([
            'code' => $code, 'first_name' => $code, 'last_name' => 'Test', 'department_id' => $d->id, 'status' => 'active', ...$extra,
        ]);
        $a = $person('EMP-A', $prod);
        $b = $person('EMP-B', $qc);
        $c = $person('EMP-C', $prod, ['status' => 'resigned', 'last_day' => '2026-08-31']);
        $d = $person('EMP-D', $qc);

        $this->set = [
            'eg1' => EmailGroup::create(['code' => 'MG-0001', 'name' => 'Production Team', 'email' => 'prod@x.co', 'department_id' => $prod->id, 'owner_employee_id' => $a->id]),
            'fs1' => FileShare::create(['code' => 'FS-0001', 'name' => 'QC Docs', 'path' => '\\\\fs\\qc', 'department_id' => $qc->id, 'owner_employee_id' => $c->id, 'size' => 500, 'size_unit' => 'GB']),
            'fs2' => FileShare::create(['code' => 'FS-0002', 'name' => 'Production Drive', 'path' => '\\\\fs\\prod', 'department_id' => $prod->id, 'size' => 1, 'size_unit' => 'TB']),
            'fs3' => FileShare::create(['code' => 'FS-0003', 'name' => 'QC Scans', 'path' => '\\\\fs\\scan', 'department_id' => $qc->id, 'owner_employee_id' => $b->id, 'size' => 0]),
            'sp1' => SocialPlatform::create(['code' => 'SM-0001', 'name' => 'LINE', 'url' => 'line.me']),
            'sw1' => Software::create(['name' => 'AutoCAD', 'license_type' => 'subscription', 'seats' => 10]),
        ];
        $grant = fn (Model $r, Employee $e, string $at, array $extra = []) => AccessMembership::create([
            'resource_type' => $r->getMorphClass(), 'resource_id' => $r->getKey(), 'employee_id' => $e->id, 'granted_at' => $at, ...$extra,
        ]);

        $this->grants = [
            // QC's person in Production's group: across departments.
            'm1' => $grant($this->set['eg1'], $b, '2026-03-01 09:00'),
            'm2' => $grant($this->set['eg1'], $a, '2026-02-01 09:00'),
            'm3' => $grant($this->set['fs1'], $c, '2026-01-10 09:00', ['access_level' => 'Read']),
            'm4' => $grant($this->set['fs1'], $b, '2026-04-01 09:00', ['access_level' => 'Write']),
            'm5' => $grant($this->set['sp1'], $a, '2026-05-01 09:00'),
            'm6' => $grant($this->set['fs1'], $d, '2026-02-15 09:00', ['revoked_at' => '2026-06-01 10:00']),
            // Software has its own report.
            'm7' => $grant($this->set['sw1'], $a, '2026-03-03 09:00'),
        ];
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions = self::VIEW): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @return list<int> */
    private function ids(string ...$names): array
    {
        return array_map(fn (string $name) => $this->grants[$name]->id, $names);
    }

    /** @return list<int> */
    private function rowIds(string $query = ''): array
    {
        return array_column($this->actingAs($this->userWith())->getJson('/api/reports/r/access.resource_members/rows'.$query)->assertOk()->json('data'), 'id');
    }

    private function pick(string $name): string
    {
        return $this->set[$name]->getMorphClass().':'.$this->set[$name]->getKey();
    }

    public function test_the_list_has_a_row_per_member_and_narrows_by_state_resource_todo_and_department(): void
    {
        $this->assertEqualsCanonicalizing($this->ids('m1', 'm2', 'm3', 'm4', 'm5'), $this->rowIds());
        $this->assertSame($this->ids('m1'), $this->rowIds('?state=cross'));
        $this->assertSame($this->ids('m6'), $this->rowIds('?state=revoked'));
        $this->assertEqualsCanonicalizing($this->ids('m3', 'm4'), $this->rowIds('?resource='.$this->pick('fs1')));
        $this->assertEqualsCanonicalizing($this->ids('m3', 'm4'), $this->rowIds('?todo=leaver'));
        $this->assertSame([], $this->rowIds('?todo=empty'));
        $qc = Department::where('tag', 'QC')->value('id');
        $this->assertEqualsCanonicalizing($this->ids('m3', 'm4'), $this->rowIds('?department_id='.$qc));
        $this->assertEqualsCanonicalizing($this->ids('m3', 'm4'), $this->rowIds('?search=QC+Docs'));
    }

    public function test_the_list_sorts_as_picked_and_says_what_each_member_is(): void
    {
        $this->assertSame($this->ids('m2', 'm5', 'm1', 'm4', 'm3'), $this->rowIds('?sort=employee'));
        $this->assertSame($this->ids('m5', 'm4', 'm1', 'm2', 'm3'), $this->rowIds('?sort=newest'));

        $rows = collect($this->actingAs($this->userWith())->getJson('/api/reports/r/access.resource_members/rows')->json('data'))->keyBy('id');
        $this->assertSame('cross', $rows[$this->grants['m1']->id]['status']);
        $this->assertSame('left', $rows[$this->grants['m3']->id]['status']);
        $this->assertSame('active', $rows[$this->grants['m5']->id]['status']);
        $this->assertSame('Write', $rows[$this->grants['m4']->id]['level']);
        $this->assertSame('QC Docs', $rows[$this->grants['m4']->id]['resource']);
    }

    public function test_tiles_count_resources_members_across_departments_leavers_and_owners(): void
    {
        $summary = collect($this->actingAs($this->userWith())->getJson('/api/reports/r/access.resource_members/rows')->assertOk()->json('summary'))->keyBy('key');

        $this->assertSame(5, $summary['ar_resources']['value']);
        $this->assertSame(['email_group' => 1, 'file_share' => 3, 'social_platform' => 1], array_column($summary['ar_resources']['split'], 'value', 'key'));
        $this->assertSame(5, $summary['ar_members']['value']);
        // Five memberships held by three people: the note names the people behind them.
        $this->assertSame(['people' => 3], $summary['ar_members']['note']['values']);
        $this->assertSame(1, $summary['ar_cross']['value']);
        $this->assertSame(33, $summary['ar_cross']['share']);
        $this->assertSame(1, $summary['ar_leavers']['value']);
        $this->assertSame('red', $summary['ar_leavers']['attention']);
        $this->assertSame(2, $summary['ar_owner']['value']);
        $this->assertSame(['none' => 1, 'gone' => 1], array_column($summary['ar_owner']['split'], 'value', 'key'));

        $social = collect($this->actingAs($this->userWith())->getJson('/api/reports/r/access.resource_members/rows?type=social_platform')->json('summary'))->keyBy('key');
        $this->assertNull($social['ar_cross']['value']);
        $this->assertSame('rep_n_ar_cross_social', $social['ar_cross']['note']['label_key']);
    }

    public function test_breakdown_lists_resources_most_to_do_first_with_the_segment_counts(): void
    {
        $data = $this->actingAs($this->userWith())->getJson('/api/reports/access/resource-members/breakdown')->assertOk()->json('data');

        $this->assertSame(['email_group' => 1, 'file_share' => 3, 'social_platform' => 1], $data['types']);
        $this->assertSame(['active' => 5, 'cross' => 1, 'revoked' => 1], $data['states']);
        $this->assertSame(['FS-0001', 'FS-0002', 'MG-0001', 'SM-0001', 'FS-0003'], array_column($data['resources'], 'code'));

        $fs1 = $data['resources'][0];
        $this->assertSame('gone', $fs1['owner_issue']);
        $this->assertSame(['in_dept' => 1, 'cross' => 0, 'gone' => 1, 'open' => 0], $fs1['mix']);
        $this->assertSame([1, 1], [$fs1['read'], $fs1['write']]);
        $this->assertSame(['value' => 500, 'unit' => 'GB'], $fs1['size']);
        $this->assertSame('none', $data['resources'][1]['owner_issue']);
        $this->assertNull($data['sheet']);
    }

    public function test_picking_a_resource_hands_over_its_review_sheet(): void
    {
        $sheet = $this->actingAs($this->userWith())->getJson('/api/reports/access/resource-members/breakdown?resource='.$this->pick('fs1'))->json('data.sheet');

        $this->assertSame('QC Docs', $sheet['name']);
        $this->assertSame('EMP-C', $sheet['owner']['code']);
        $this->assertSame(['EMP-B', 'EMP-C'], array_column($sheet['list'], 'code'));
        $this->assertSame(['in_dept', 'gone'], array_column($sheet['list'], 'kind'));
        $this->assertSame(['Write', 'Read'], array_column($sheet['list'], 'level'));
        // Nobody enters a purpose in the app, so the sheet leaves it out.
        $this->assertArrayNotHasKey('purpose', $sheet['list'][0]);
    }

    public function test_purpose_starts_hidden_but_stays_in_the_file(): void
    {
        $columns = collect($this->actingAs($this->userWith())->getJson('/api/reports/r/access.resource_members')->assertOk()->json('data.columns'))->keyBy('key');

        $this->assertTrue($columns['purpose']['hidden']);
    }

    public function test_the_review_sheet_prints_as_a_pdf(): void
    {
        $response = $this->actingAs($this->userWith())->get('/api/reports/access/resource-members/sheet?resource='.$this->pick('fs1'));

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
        $this->assertStringContainsString('AccessReview_FS-0001_2026-09-25.pdf', (string) $response->headers->get('Content-Disposition'));
        $this->assertStringStartsWith('%PDF', $response->streamedContent());

        $this->actingAs($this->userWith())->get('/api/reports/access/resource-members/sheet')->assertNotFound();
    }

    public function test_the_file_carries_the_resources_and_the_space_by_department(): void
    {
        $report = app(AccessResourceMembersReport::class);
        $sections = $report->exportSections($this->userWith(), $report->resolveFilters([]));

        $this->assertSame(['Resource', 'พื้นที่ File Share ตามแผนก'], array_column($sections, 'title'));
        $space = collect($sections[1]['rows'])->keyBy(0);
        $this->assertEquals(['ฝ่ายควบคุมคุณภาพ', 2, 500, 1], $space['ฝ่ายควบคุมคุณภาพ']);
        $this->assertEquals(['ฝ่ายผลิต', 1, 1024, 0], $space['ฝ่ายผลิต']);
    }

    public function test_a_picked_resource_the_filters_leave_out_has_no_sheet(): void
    {
        $prod = Department::where('tag', 'PD')->value('id');
        $data = $this->actingAs($this->userWith())
            ->getJson('/api/reports/access/resource-members/breakdown?resource='.$this->pick('fs1').'&department_id='.$prod)->json('data');

        $this->assertNull($data['sheet']);
    }

    public function test_a_member_with_no_department_is_not_counted_across_departments(): void
    {
        $nobody = Employee::create(['code' => 'EMP-N', 'first_name' => 'No', 'last_name' => 'Dept', 'status' => 'active']);
        AccessMembership::create([
            'resource_type' => 'email_group', 'resource_id' => $this->set['eg1']->id, 'employee_id' => $nobody->id, 'granted_at' => '2026-05-01 09:00',
        ]);

        $eg1 = collect($this->actingAs($this->userWith())->getJson('/api/reports/access/resource-members/breakdown')->json('data.resources'))
            ->firstWhere('code', 'MG-0001');
        $this->assertSame(['in_dept' => 1, 'cross' => 1, 'gone' => 0, 'open' => 1], $eg1['mix']);
    }

    public function test_the_report_needs_all_three_registries(): void
    {
        $partial = $this->userWith(['access.email_view', 'access.file_view']);
        $this->actingAs($partial)->getJson('/api/reports/r/access.resource_members/rows')->assertForbidden();
        $this->actingAs($partial)->getJson('/api/reports/access/resource-members/breakdown')->assertForbidden();
        $this->actingAs($partial)->get('/api/reports/access/resource-members/sheet?resource='.$this->pick('fs1'))->assertForbidden();
    }
}
