<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Services\Employee\EmployeeService;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use ReflectionObject;
use Tests\TestCase;

/**
 * The mail that tells IT a new starter still needs a login.
 *
 * It carries enough of the record to set the account up without opening it — where the
 * person sits and when they need it by. A variable the send does not fill is not blank in
 * the message: the renderer is a plain replace, so an unfilled name reaches the recipient
 * as the literal {{employee.department}}. That is what this guards.
 */
class NewEmployeeEmailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
    }

    private function credentialSetter(): User
    {
        $roleId = Role::firstOrCreate(['key' => 'itrole'], ['name' => 'IT', 'is_system' => false])->id;
        RolePermission::firstOrCreate(['role_id' => $roleId, 'permission' => 'employees.set_credentials'], ['allowed' => true]);

        return User::factory()->create(['role' => 'itrole', 'email' => 'it@inaba.co.th', 'name' => 'Anong Wattana']);
    }

    /** Sections hang off a department, so one always has to exist first. */
    private function department(string $code = 'DEP-0001', string $name = 'Information Technology'): Department
    {
        return Department::create(['code' => $code, 'name' => $name, 'name_th' => 'ฝ่ายเทคโนโลยีสารสนเทศ']);
    }

    private function notify(Employee $employee): void
    {
        $service = app(EmployeeService::class);
        $method = (new ReflectionObject($service))->getMethod('notifyCredentialSetters');
        $method->setAccessible(true);
        $method->invoke($service, $employee);
    }

    private function sentHtml(): string
    {
        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === 'employee.account_needed');

        $this->assertNotNull($job, 'No new-employee mail was queued.');

        return $this->prop($job, 'html');
    }

    private function prop(object $job, string $name): string
    {
        $property = (new ReflectionObject($job))->getProperty($name);
        $property->setAccessible(true);

        return (string) $property->getValue($job);
    }

    public function test_it_fills_every_variable_the_standard_template_asks_for(): void
    {
        Bus::fake();
        $this->credentialSetter();

        $employee = Employee::create([
            'code' => 'EMP-1042',
            'first_name' => 'Somchai',
            'last_name' => 'Suksawat',
            'department_id' => ($department = $this->department())->id,
            'section_id' => Section::create(['code' => 'SEC-0001', 'name' => 'System analyst', 'department_id' => $department->id])->id,
            'position_id' => Position::create(['code' => 'PST-0005', 'title' => 'Asst. Manager'])->id,
            'joined_at' => '2026-09-01',
            'status' => 'active',
        ]);

        $this->notify($employee);
        $html = $this->sentHtml();

        // Nothing reaches the recipient as a literal placeholder.
        $this->assertStringNotContainsString('{{', $html, 'An unfilled variable was sent as raw {{...}}.');

        $this->assertStringContainsString('EMP-1042', $html);
        $this->assertStringContainsString('Somchai Suksawat', $html);
        $this->assertStringContainsString('Asst. Manager', $html);
        $this->assertStringContainsString('System analyst', $html);
        $this->assertStringContainsString('Information Technology', $html);
        // Written the way the reader writes a date, matching the other mails.
        $this->assertStringContainsString('01-09-2026', $html);
    }

    public function test_a_starter_with_nothing_filled_in_yet_still_produces_a_readable_mail(): void
    {
        Bus::fake();
        $this->credentialSetter();

        // Recorded from a name and a code alone — the rest arrives later. Blank cells would
        // read as a broken message rather than as "not decided yet".
        $employee = Employee::create([
            'code' => 'EMP-1043',
            'first_name' => 'Manee',
            'last_name' => 'Jaidee',
            'status' => 'active',
        ]);

        $this->notify($employee);
        $html = $this->sentHtml();

        $this->assertStringNotContainsString('{{', $html);
        $this->assertStringContainsString('EMP-1043', $html);
        $text = html_entity_decode(strip_tags($html));
        foreach (['Position: -', 'Section: -', 'Department: -', 'Working Start: -'] as $label) {
            $this->assertStringContainsString($label, $text);
        }
    }

    public function test_a_section_with_only_a_thai_name_is_named_rather_than_left_blank(): void
    {
        Bus::fake();
        $this->credentialSetter();

        $employee = Employee::create([
            'code' => 'EMP-1044',
            'first_name' => 'Somsak',
            'last_name' => 'Pooprasert',
            'section_id' => Section::create([
                'code' => 'SEC-0002', 'name' => '', 'name_th' => 'ฝ่ายผลิต',
                'department_id' => $this->department('DEP-0002', 'Production')->id,
            ])->id,
            'status' => 'active',
        ]);

        $this->notify($employee);
        $this->assertStringContainsString('ฝ่ายผลิต', $this->sentHtml());
    }
}
