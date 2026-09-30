<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Access\AccessMembership;
use App\Models\Access\Software;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\TestCase;

/**
 * "การใช้ License ซอฟต์แวร์" (access.software_licenses) through /reports/r/{key}: seats bought
 * against active memberships, who holds them, and how many holders have resigned.
 */
class SoftwareLicenseReportTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
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

    /** @param list<string> $holders one entry per holder: 'active' | 'resigned' | 'revoked' */
    private function software(string $name, ?int $seats, array $holders, string $licenseType = 'subscription'): Software
    {
        $software = Software::create(['name' => $name, 'seats' => $seats, 'license_type' => $licenseType]);
        foreach ($holders as $holder) {
            $this->seq++;
            $employee = Employee::create([
                'code' => sprintf('EMP-%03d', $this->seq), 'first_name' => "Holder{$this->seq}", 'last_name' => 'Test',
                'status' => $holder === 'resigned' ? 'resigned' : 'active',
            ]);
            AccessMembership::create([
                'resource_type' => 'software', 'resource_id' => $software->id, 'employee_id' => $employee->id,
                'granted_at' => '2026-01-0'.min(9, $this->seq), 'revoked_at' => $holder === 'revoked' ? '2026-06-01' : null,
            ]);
        }

        return $software;
    }

    /** @return array{0: Software, 1: Software, 2: Software, 3: Software} */
    private function catalogue(): array
    {
        return [
            $this->software('Adobe', 2, ['active', 'active', 'resigned', 'revoked']),
            $this->software('Office', 5, ['active']),
            $this->software('VS Code', null, ['active', 'active'], 'free'),
            $this->software('Zoom', 1, ['active']),
        ];
    }

    public function test_seats_bought_against_seats_used_with_holders(): void
    {
        [$adobe, $office, $vscode, $zoom] = $this->catalogue();

        $body = $this->actingAs($this->userWith(['access.software_view']))
            ->getJson('/api/reports/r/access.software_licenses/rows')->assertOk()->json();

        $this->assertSame([$adobe->id, $office->id, $vscode->id, $zoom->id], array_column($body['data'], 'id'));
        $rows = collect($body['data'])->keyBy('id');
        $this->assertEquals(3, $rows[$adobe->id]['seats_used']);
        $this->assertEquals(-1, $rows[$adobe->id]['seats_left']);
        $this->assertEquals(150, $rows[$adobe->id]['usage_pct']);
        $this->assertEquals(1, $rows[$adobe->id]['held_by_leavers']);
        $this->assertSame(3, substr_count($rows[$adobe->id]['holders'], '(EMP-'));
        $this->assertEquals(20, $rows[$office->id]['usage_pct']);
        $this->assertNull($rows[$vscode->id]['seats_left']);
        $this->assertNull($rows[$vscode->id]['usage_pct']);
        $this->assertSame('free', $rows[$vscode->id]['license_type']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(4, $summary['total']['value']);
        $this->assertSame(8, $summary['seats_total']['value']);
        $this->assertSame(7, $summary['seats_used']['value']);
        $this->assertSame(1, $summary['over_allocated']['value']);
        $this->assertSame(1, $summary['held_by_leavers']['value']);
    }

    public function test_usage_and_type_filters(): void
    {
        [$adobe, $office, $vscode, $zoom] = $this->catalogue();
        $user = $this->userWith(['access.software_view']);
        $ids = fn (string $query) => array_column($this->actingAs($user)->getJson('/api/reports/r/access.software_licenses/rows?'.$query)->assertOk()->json('data'), 'id');

        $this->assertSame([$adobe->id], $ids('usage=over'));
        $this->assertSame([$zoom->id], $ids('usage=full'));
        $this->assertSame([$office->id], $ids('usage=available'));
        $this->assertSame([$vscode->id], $ids('usage=unlimited'));
        $this->assertSame([$vscode->id], $ids('license_type=free'));
        $this->assertSame([$zoom->id], $ids('search=zoo'));
    }

    public function test_needs_software_view(): void
    {
        $this->actingAs($this->userWith(['access.module', 'access.email_view']))
            ->getJson('/api/reports/r/access.software_licenses/rows')->assertForbidden();
    }

    public function test_exports(): void
    {
        Excel::fake();
        $this->catalogue();
        $user = $this->userWith(['access.software_view']);

        $this->actingAs($user)->get('/api/reports/r/access.software_licenses/export?format=xlsx')->assertOk();
        Excel::assertDownloaded('Report_access-software_licenses_2026-09-25.xlsx', function (TabularReportExport $export) {
            return in_array('ผู้ลาออกที่ยังถือ', $export->sheets()[1]->headings(), true)
                && in_array('ฟรี', $export->sheets()[1]->map($export->rows->firstWhere('name', 'VS Code')), true);
        });

        $pdf = $this->actingAs($user)->get('/api/reports/r/access.software_licenses/export?format=pdf');
        $pdf->assertOk();
        $this->assertSame('application/pdf', $pdf->headers->get('Content-Type'));
    }
}
