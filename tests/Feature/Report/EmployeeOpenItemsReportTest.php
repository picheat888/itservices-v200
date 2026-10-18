<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Asset\Asset;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Support\ReportCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * "สรุปเรื่องค้างของพนักงาน" (employees.open_items): leaver assets, leaver access, accounts and
 * incomplete employee data — the breakdown the cards draw and the rows the files carry.
 */
class EmployeeOpenItemsReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;
    use GrantsReports;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-10-13 10:00:00');
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

    /** @param array<string, mixed> $attributes */
    private function employee(string $name, array $attributes = []): Employee
    {
        $this->seq++;

        return Employee::create(array_merge([
            'code' => sprintf('EMP-%03d', $this->seq), 'first_name' => $name, 'last_name' => 'Test',
            'joined_at' => '2024-01-01', 'status' => 'active',
        ], $attributes));
    }

    private function grant(Employee $employee, string $name, ?string $revokedAt = null): AccessMembership
    {
        $group = EmailGroup::create(['name' => $name, 'email' => strtolower(str_replace(' ', '', $name)).'@x.co']);

        return AccessMembership::create([
            'resource_type' => 'email_group', 'resource_id' => $group->id, 'employee_id' => $employee->id,
            'access_level' => 'member', 'granted_at' => '2024-01-01', 'revoked_at' => $revokedAt,
        ]);
    }

    private function breakdown(string $query = ''): array
    {
        return $this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/employees/open-items/breakdown'.$query)->assertOk()->json('data');
    }

    public function test_asset_group_lists_every_resigned_holder_oldest_first(): void
    {
        $old = $this->employee('Old', ['status' => 'resigned', 'last_day' => '2026-07-31']);
        $today = $this->employee('Today', ['status' => 'resigned', 'last_day' => '2026-10-13']);
        $active = $this->employee('Active');
        Asset::factory()->create(['owner_employee_id' => $today->id, 'owner' => null, 'status' => 'pending_return']);
        Asset::factory()->count(2)->create(['owner_employee_id' => $old->id, 'owner' => null, 'status' => 'pending_return']);
        Asset::factory()->create(['owner_employee_id' => $active->id, 'owner' => null, 'status' => 'deployed']);

        $asset = $this->breakdown()['asset'];

        $this->assertSame(2, $asset['people']);
        $this->assertSame(3, $asset['pieces']);
        $this->assertSame(74, $asset['oldest_days']);
        $this->assertSame([$old->code, $today->code], array_column($asset['rows'], 'code'));
        $this->assertCount(2, $asset['rows'][0]['assets']);
    }

    public function test_a_leaver_without_a_last_day_comes_last_and_codes_sort_naturally(): void
    {
        $noLastDay = $this->employee('NoLastDay', ['code' => 'EMP-1', 'status' => 'resigned']);
        $ten = $this->employee('Ten', ['code' => 'EMP-10', 'status' => 'resigned', 'last_day' => '2026-09-01']);
        $nine = $this->employee('Nine', ['code' => 'EMP-9', 'status' => 'resigned', 'last_day' => '2026-09-01']);
        foreach ([$noLastDay, $ten, $nine] as $e) {
            Asset::factory()->create(['owner_employee_id' => $e->id, 'owner' => null, 'status' => 'pending_return']);
        }

        $asset = $this->breakdown()['asset'];

        $this->assertSame([$nine->code, $ten->code, $noLastDay->code], array_column($asset['rows'], 'code'));
        $this->assertSame([42, 42, null], array_column($asset['rows'], 'days_out'));
        $this->assertSame(42, $asset['oldest_days']);
    }

    public function test_file_sums_each_topic_like_the_cards(): void
    {
        $gone = $this->employee('Gone', ['status' => 'resigned', 'last_day' => '2026-09-30']);
        $this->grant($gone, 'All Gone');
        $report = ReportCatalogue::tabular('employees.open_items');

        $sections = $report->exportSections($this->userWith([...$this->reportRights('employees')]), $report->resolveFilters([]));

        $this->assertCount(3, $sections);
        $this->assertSame(['สิทธิ์ค้างถอน', 1, 1, 'สิทธิ์', 13], $sections[0]['rows'][1]);
        $this->assertSame('บัญชีเข้าใช้งาน', $sections[0]['rows'][2][0]);
    }

    public function test_access_group_counts_people_who_left_with_open_grants_only(): void
    {
        $gone = $this->employee('Gone', ['status' => 'resigned', 'last_day' => '2026-09-30']);
        $lastDayToday = $this->employee('Today', ['status' => 'resigned', 'last_day' => '2026-10-13']);
        $this->grant($gone, 'All Gone');
        $this->grant($gone, 'Revoked One', '2026-10-01');
        $this->grant($lastDayToday, 'All Today');

        $access = $this->breakdown()['access'];

        $this->assertSame(1, $access['people']);
        $this->assertSame(1, $access['grants']);
        $this->assertSame(13, $access['oldest_days']);
        $this->assertSame([['type' => 'email_group', 'name' => 'All Gone']], $access['rows'][0]['grants']);
    }

    public function test_data_issues_skip_special_positions_and_leavers_except_bad_dates(): void
    {
        $vp = Position::create(['code' => 'VP', 'title' => 'Vice President', 'allow_special_position' => true]);
        $staff = Position::create(['code' => 'ST', 'title' => 'Staff', 'allow_special_position' => false]);
        $dept = Department::create(['code' => 'D', 'name' => 'Dept']);
        $sec = Section::create(['code' => 'S', 'department_id' => $dept->id, 'name' => 'Sec']);
        $complete = ['email' => 'a@x.co', 'department_id' => $dept->id, 'section_id' => $sec->id, 'position_id' => $staff->id];
        $boss = $this->employee('Boss', ['status' => 'resigned', 'last_day' => '2026-09-30', 'email' => 'b@x.co', 'position_id' => $vp->id]);
        $this->employee('Vp', ['email' => 'vp@x.co', 'position_id' => $vp->id]);
        $orphan = $this->employee('Orphan', $complete + ['manager_id' => $boss->id, 'email' => 'o@x.co']);
        $bare = $this->employee('Bare', ['position_id' => $staff->id]);
        $this->employee('LeftBare', ['status' => 'resigned', 'last_day' => '2026-09-01']);
        $dates = $this->employee('Dates', ['status' => 'resigned', 'joined_at' => '2026-10-03', 'last_day' => '2026-09-28']);

        $data = $this->breakdown()['data'];
        $issues = collect($data['rows'])->mapWithKeys(fn (array $r) => [$r['code'] => array_column($r['issues'], 'key')]);

        $this->assertSame(['mgr_left'], $issues[$orphan->code]);
        $this->assertSame(['no_mgr', 'no_email', 'no_dept', 'no_sec'], $issues[$bare->code]);
        $this->assertContains('bad_dates', $issues[$dates->code]);
        $this->assertSame(3, $data['people']);
        $this->assertSame($boss->name, collect($data['rows'])->firstWhere('code', $orphan->code)['issues'][0]['manager']['name']);
        $orphanRow = collect($data['rows'])->firstWhere('code', $orphan->code);
        $this->assertSame(['Dept', 'Sec'], [$orphanRow['department']['name'], $orphanRow['section']['name']]);
        $this->assertSame(1, $data['by_issue']['mgr_left']);
        $this->assertSame(1, $data['by_issue']['bad_dates']);
    }

    public function test_account_group_is_shown_to_any_employee_report_reader(): void
    {
        $leaver = $this->employee('Leaver', ['status' => 'resigned', 'last_day' => '2026-09-30']);
        User::factory()->create(['employee_id' => $leaver->id, 'username' => 'leaver.acct']);
        User::factory()->create(['username' => 'fresh.acct', 'must_change_password' => true]);
        $reader = $this->userWith($this->reportRights('employees'));

        $breakdown = $this->actingAs($reader)->getJson('/api/reports/employees/open-items/breakdown')->assertOk();
        $this->assertNotNull($breakdown->json('data.acct'));
        $this->assertSame(['left' => 1, 'must_change' => 1, 'expired' => 0], $breakdown->json('data.acct.by_kind'));
        $this->assertSame(2, $breakdown->json('data.acct.accounts'));

        $rows = $this->actingAs($reader)->getJson('/api/reports/tabular/employees.open_items/rows?group=acct')->assertOk();
        $this->assertStringContainsString('leaver.acct', $rows->getContent());
    }

    public function test_searching_a_username_finds_the_account(): void
    {
        $leaver = $this->employee('Leaver', ['status' => 'resigned', 'last_day' => '2026-09-30']);
        Asset::factory()->create(['owner_employee_id' => $leaver->id, 'owner' => null]);
        User::factory()->create(['employee_id' => $leaver->id, 'username' => 'leaver.acct']);

        $this->assertSame(1, $this->breakdown('?search=leaver.acct')['asset']['people']);
    }

    public function test_expired_passwords_count_only_when_the_policy_is_on(): void
    {
        $creds = $this->userWith($this->reportRights('employees'));
        $creds->forceFill(['password_changed_at' => now()])->save();
        User::factory()->create(['username' => 'stale', 'password_changed_at' => '2026-01-01', 'must_change_password' => false]);

        $off = $this->actingAs($creds)->getJson('/api/reports/employees/open-items/breakdown')->json('data.acct.by_kind.expired');
        AppSetting::put('password_expiry_days', '90');
        $on = $this->actingAs($creds)->getJson('/api/reports/employees/open-items/breakdown')->json('data.acct');

        $this->assertSame(0, $off);
        $this->assertSame(1, $on['by_kind']['expired']);
        $this->assertSame(90, $on['expiry_days']);
        $this->assertSame('stale', $on['rows'][0]['username']);
    }

    public function test_a_never_changed_password_counts_as_expired_like_the_login_check(): void
    {
        $creds = $this->userWith($this->reportRights('employees'));
        $creds->forceFill(['password_changed_at' => now()])->save();
        User::factory()->create(['username' => 'never.changed', 'password_changed_at' => null, 'must_change_password' => false]);
        AppSetting::put('password_expiry_days', '90');

        $acct = $this->actingAs($creds)->getJson('/api/reports/employees/open-items/breakdown')->json('data.acct');

        $this->assertSame(1, $acct['by_kind']['expired']);
        $this->assertSame('never.changed', $acct['rows'][0]['username']);
    }

    public function test_search_finds_a_leaver_by_an_asset_serial(): void
    {
        $leaver = $this->employee('Gone', ['status' => 'resigned', 'last_day' => '2026-09-30']);
        $this->employee('Other', ['status' => 'resigned', 'last_day' => '2026-09-30']);
        Asset::factory()->create(['owner_employee_id' => $leaver->id, 'owner' => null, 'serial' => 'PF2ABC12']);

        $this->assertSame([$leaver->code], array_column($this->breakdown('?search=PF2ABC12')['asset']['rows'], 'code'));
    }

    public function test_search_finds_a_leaver_by_first_and_last_name_typed_together(): void
    {
        $leaver = $this->employee('Somchai', [
            'last_name' => 'Jaidee', 'first_name_th' => 'สมชาย', 'last_name_th' => 'ใจดี', 'status' => 'resigned', 'last_day' => '2026-09-30',
        ]);
        $other = $this->employee('Somying', ['last_name' => 'Jaidee', 'status' => 'resigned', 'last_day' => '2026-09-30']);
        Asset::factory()->create(['owner_employee_id' => $leaver->id, 'owner' => null]);
        Asset::factory()->create(['owner_employee_id' => $other->id, 'owner' => null]);

        $this->assertSame([$leaver->code], array_column($this->breakdown('?search='.urlencode('สมชายใจดี'))['asset']['rows'], 'code'));
        $this->assertSame([$leaver->code], array_column($this->breakdown('?search=SomchaiJaidee')['asset']['rows'], 'code'));
    }

    public function test_department_and_search_narrow_everything_and_search_is_literal(): void
    {
        $it = Department::create(['code' => 'IT', 'name' => 'IT']);
        $a = $this->employee('Somchai', ['department_id' => $it->id, 'status' => 'resigned', 'last_day' => '2026-09-30']);
        $b = $this->employee('Other', ['status' => 'resigned', 'last_day' => '2026-09-30']);
        Asset::factory()->create(['owner_employee_id' => $a->id, 'owner' => null, 'asset_code' => 'INK-IT-26-0001']);
        Asset::factory()->create(['owner_employee_id' => $b->id, 'owner' => null, 'asset_code' => 'INK-IT-26-0002']);

        $this->assertSame([$a->code], array_column($this->breakdown('?department_id='.$it->id)['asset']['rows'], 'code'));
        $this->assertSame([$b->code], array_column($this->breakdown('?search=26-0002')['asset']['rows'], 'code'));
        foreach (['%', '_', "o'", 'สมชาย'] as $q) {
            $this->assertSame(0, $this->breakdown('?search='.urlencode($q))['asset']['people'], $q);
        }
        $rows = $this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/tabular/employees.open_items/rows?search='.urlencode('%'))->assertOk();
        $this->assertSame([], $rows->json('data'));
    }

    public function test_rows_carry_one_line_per_item_with_unique_ids(): void
    {
        $leaver = $this->employee('Leaver', ['status' => 'resigned', 'last_day' => '2026-09-30']);
        Asset::factory()->count(2)->create(['owner_employee_id' => $leaver->id, 'owner' => null, 'status' => 'pending_return']);
        $this->grant($leaver, 'All Leaver');

        $body = $this->actingAs($this->userWith([...$this->reportRights('employees')]))
            ->getJson('/api/reports/tabular/employees.open_items/rows')->assertOk()->json();

        $this->assertSame(['asset', 'asset', 'access'], array_slice(array_column($body['data'], 'group'), 0, 3));
        $this->assertSame(count($body['data']), count(array_unique(array_column($body['data'], 'id'))));
        $this->assertSame($leaver->code, $body['data'][0]['employee_code']);
        $this->assertSame('All Leaver', collect($body['data'])->firstWhere('group', 'access')['item']);
        $this->assertSame(['asset'], array_values(array_unique(array_column(
            $this->actingAs($this->userWith([...$this->reportRights('employees')]))->getJson('/api/reports/tabular/employees.open_items/rows?group=asset')->json('data'), 'group'))));
    }

    public function test_nothing_open_gives_empty_groups_without_errors(): void
    {
        $this->employee('Complete', ['email' => 'c@x.co']);

        $data = $this->breakdown();

        $this->assertSame(['people_total', 'asset', 'access', 'acct', 'data'], array_keys($data));
        $this->assertSame(0, $data['asset']['people']);
        $this->assertNull($data['asset']['oldest_days']);
        $this->assertNull($data['access']['oldest_days']);
        $this->assertSame([], $data['asset']['rows']);
    }

    public function test_group_filter_narrows_the_rows(): void
    {
        $this->employee('Bare');
        User::factory()->create(['username' => 'fresh.acct', 'must_change_password' => true]);
        $creds = $this->userWith($this->reportRights('employees'));

        $rows = $this->actingAs($creds)->getJson('/api/reports/tabular/employees.open_items/rows?group=acct')->assertOk()->json('data');

        $this->assertSame(['acct'], array_values(array_unique(array_column($rows, 'group'))));
        $this->assertSame('fresh.acct', $rows[0]['item']);
        $this->assertSame('ยังไม่ได้เปลี่ยนรหัสผ่านครั้งแรก', collect($rows)->firstWhere('item', 'fresh.acct')['status']);
    }

    public function test_open_items_need_employees_view_and_old_key_is_gone(): void
    {
        $this->actingAs($this->userWith([...$this->reportRights('assets')]))->getJson('/api/reports/employees/open-items/breakdown')->assertForbidden();
        $this->actingAs($this->userWith([...$this->reportRights('employees')]))->getJson('/api/reports/tabular/employees.leaver_assets/rows')->assertNotFound();
    }

    public function test_files_carry_account_rows_for_any_employee_report_reader(): void
    {
        Excel::fake();
        $leaver = $this->employee('Leaver', ['status' => 'resigned', 'last_day' => '2026-09-30']);
        Asset::factory()->create(['owner_employee_id' => $leaver->id, 'owner' => null, 'status' => 'pending_return']);
        User::factory()->create(['employee_id' => $leaver->id, 'username' => 'leaver.acct']);
        $file = 'Report_employees-open_items_2026-10-13.xlsx';
        $kinds = fn (TabularReportExport $export) => $export->rows->pluck('grp')->all();
        $tiles = fn (TabularReportExport $export) => array_map(fn ($s) => $s->key, $export->summary);

        $this->actingAs($this->userWith($this->reportRights('employees')))->exportReport('/api/reports/tabular/employees.open_items/export?format=xlsx')->assertAccepted();
        $this->assertExportStored($file, function (TabularReportExport $export) use ($kinds, $tiles) {
            $this->assertSame(['asset', 'acct'], $kinds($export));
            $this->assertContains('open_accounts', $tiles($export));

            return true;
        });

        $pdf = $this->actingAs($this->userWith([...$this->reportRights('employees')]))->exportReport('/api/reports/tabular/employees.open_items/export?format=pdf');
        $pdf->assertOk();
        $this->assertSame('application/pdf', $pdf->headers->get('Content-Type'));
    }
}
