<?php

namespace Tests\Feature\Report;

use App\Enums\Request\RequestType;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pins the requests.overview breakdown cards on a mixed dataset (every type and origin, item kinds,
 * orphaned requesters, range edges) against tests/Fixtures/request-overview-breakdown.json.
 */
class RequestOverviewBreakdownFixtureTest extends TestCase
{
    use RefreshDatabase;

    private const FIXTURE = __DIR__.'/../../Fixtures/request-overview-breakdown.json';

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
        $this->seedRequests();
    }

    private function seedRequests(): void
    {
        $prod = Department::create(['name' => 'Production', 'name_th' => 'ฝ่ายผลิต', 'tag' => 'PD']);
        $qc = Department::create(['name' => 'Quality', 'name_th' => 'ฝ่ายควบคุมคุณภาพ', 'tag' => 'QC']);
        $hr = Department::create(['name' => 'HR', 'name_th' => null, 'tag' => 'HR']);
        $person = fn (string $code, ?Department $d) => Employee::create(['code' => $code, 'first_name' => $code, 'last_name' => 'Test', 'department_id' => $d?->id]);
        $employees = [$person('E1', $prod), $person('E2', $qc), $person('E3', $hr), $person('E4', null), $person('E5', $prod)];

        $options = [];
        foreach (['computer', 'hardware', 'mobile', 'telephone', 'network', 'cctv', 'other'] as $type) {
            $options[$type] = [
                RequestOption::create(['request_type' => $type, 'field_key' => 'device_id', 'label_en' => "{$type} A", 'label_th' => "{$type} เอ"]),
                RequestOption::create(['request_type' => $type, 'field_key' => 'device_id', 'label_en' => "{$type} B", 'label_th' => null]),
            ];
        }
        $software = [Software::create(['name' => 'AutoCAD', 'license_type' => 'subscription', 'seats' => 5]), Software::create(['name' => 'Office', 'license_type' => 'subscription', 'seats' => 5])];
        $shares = [FileShare::create(['name' => 'QC Docs', 'path' => '\\\\fs\\qc', 'department_id' => $qc->id]), FileShare::create(['name' => 'PD Docs', 'path' => '\\\\fs\\pd', 'department_id' => $prod->id])];
        $groups = [EmailGroup::create(['name' => 'All staff', 'email' => 'all@example.test']), EmailGroup::create(['name' => 'Plant', 'email' => 'plant@example.test'])];
        $social = [SocialPlatform::create(['name' => 'Facebook', 'url' => 'https://facebook.test'])];

        $types = RequestType::cases();
        $statuses = ['pending', 'approved', 'completed', 'rejected', 'cancelled', 'completed'];
        for ($i = 0; $i < 120; $i++) {
            $type = $types[$i % count($types)];
            $status = $statuses[($i * 7) % count($statuses)];
            $created = match ($i) {
                0 => '2026-01-01 00:00:00',
                1 => '2026-09-25 23:59:59',
                2 => '2025-12-31 23:59:59',
                3 => '2026-09-26 00:00:00',
                default => date('Y-m-d H:i:s', strtotime('2026-01-01 00:00:00') + (($i * 211) % 268) * 86400 + (($i * 7919) % 86400)),
            };
            $approved = in_array($status, ['approved', 'completed'], true) && $i % 11 !== 0 ? date('Y-m-d H:i:s', strtotime($created) + ($i % 5) * 86400 + 3600 * ($i % 20)) : null;
            $completed = $status === 'completed' && $i % 13 !== 0 ? date('Y-m-d H:i:s', strtotime($approved ?? $created) + ($i % 7) * 86400 + 60 * ($i % 90)) : null;
            $employee = $employees[$i % count($employees)];
            $extra = match (true) {
                in_array($type->value, array_keys($options), true) => ['request_option_id' => $options[$type->value][$i % 2]->id],
                $type === RequestType::Software => ['software_id' => $software[$i % 2]->id],
                $type === RequestType::Fileshare, $type === RequestType::Recovery => ['file_share_id' => $shares[$i % 2]->id],
                $type === RequestType::Mailgroup => ['email_group_id' => $groups[$i % 2]->id],
                $type === RequestType::Social => ['social_platform_id' => $social[0]->id],
                default => [],
            };
            $request = ServiceRequest::create([
                'reference' => sprintf('RQ-2026-%04d', $i + 1), 'type' => $type->value, 'origin' => $i % 3 === 0 ? 'onboarding' : 'direct',
                'employee_id' => $employee->id, 'requester_name' => $employee->name, 'title' => "Request {$i}", 'reason' => 'Needed.', 'status' => $status,
                'approved_at' => $approved, 'completed_at' => $completed,
                'rejected_at' => $status === 'rejected' ? $created : null, 'cancelled_at' => $status === 'cancelled' ? $created : null,
            ] + $extra);
            // Requesters whose employee row is gone: named by the department written on the request
            $orphan = match ($i % 17) {
                0 => 'Production', 1 => 'ฝ่ายควบคุมคุณภาพ', 2 => 'Unknown Dept', 3 => '',
                default => null,
            };
            $update = ['created_at' => $created];
            if ($orphan !== null) {
                $update += ['employee_id' => null, 'department_name' => $orphan === '' ? null : $orphan];
            }
            ServiceRequest::query()->whereKey($request->id)->update($update);
        }
    }

    private function viewer(): User
    {
        $role = Role::create(['key' => 'rep_fx', 'name' => 'Report Test', 'is_system' => false]);
        RolePermission::create(['role_id' => $role->id, 'permission' => 'requests.view_all', 'allowed' => true]);

        return User::factory()->create(['role' => $role->key]);
    }

    /** @return array<string, mixed> */
    private function cards(): array
    {
        $viewer = $this->viewer();
        $out = [];
        foreach (['all' => '', 'type' => '?type=computer', 'status' => '?status=completed', 'range' => '?from=2026-03-01&to=2026-05-31', 'empty' => '?from=2024-01-01&to=2024-01-31'] as $name => $query) {
            $out[$name] = $this->actingAs($viewer)->getJson('/api/reports/requests/overview/breakdown'.$query)->assertOk()->json('data');
        }
        $department = Department::query()->where('tag', 'QC')->value('id');
        $out['department'] = $this->actingAs($viewer)->getJson("/api/reports/requests/overview/breakdown?department_id={$department}")->assertOk()->json('data');

        return $out;
    }

    public function test_breakdown_cards_match_the_pinned_fixture(): void
    {
        $cards = $this->cards();
        if (getenv('WRITE_FIXTURE')) {
            file_put_contents(self::FIXTURE, json_encode($cards, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n");
        }

        $this->assertSame(json_decode(file_get_contents(self::FIXTURE), true), json_decode(json_encode($cards), true));
    }
}
