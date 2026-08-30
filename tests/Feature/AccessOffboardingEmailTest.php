<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
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
use App\Services\Employee\EmployeeService;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use ReflectionObject;
use Tests\TestCase;

/**
 * The mail that tells whoever clears access that somebody has left still holding some.
 *
 * The bell for this has existed since access offboarding was built, but it only carries
 * counts — "5 access items" says there is work without saying what it is. The asset half of
 * the same resignation has had its own mail since ET-32; this is the other half.
 *
 * It is read away from the screen, so the message has to stand on its own: the whole list in
 * one table, with "Held as" saying which rows are a membership to revoke and which are a
 * resource that needs a new owner, and a Resource column carrying the address the reader
 * searches for at the other end — the group's address, the share's path, the platform's URL.
 */
class AccessOffboardingEmailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
    }

    /** Somebody who may open the Access Directory and edit at least one registry. */
    private function accessAdmin(): User
    {
        $roleId = Role::firstOrCreate(['key' => 'itrole'], ['name' => 'IT', 'is_system' => false])->id;
        foreach (['access.module', 'access.email_edit', 'access.file_edit', 'access.software_edit'] as $permission) {
            RolePermission::firstOrCreate(['role_id' => $roleId, 'permission' => $permission], ['allowed' => true]);
        }

        return User::factory()->create(['role' => 'itrole', 'email' => 'it@inaba.co.th', 'name' => 'Anong Wattana']);
    }

    private function leaver(): Employee
    {
        return Employee::create([
            'code' => 'EMP-1042',
            'first_name' => 'Somchai',
            'last_name' => 'Suksawat',
            'status' => 'active',
        ]);
    }

    private function department(): Department
    {
        return Department::firstOrCreate(['code' => 'DEP-0001'], ['name' => 'Information Technology']);
    }

    private function resign(Employee $employee): void
    {
        app(EmployeeService::class)->resign($employee, 'New job', '2026-09-30');
    }

    private function offboardingHtml(): string
    {
        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === 'access.offboarding');

        $this->assertNotNull($job, 'No access-offboarding mail was queued.');

        return $this->prop($job, 'html');
    }

    private function sentSubject(): string
    {
        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === 'access.offboarding');

        return $job === null ? '' : $this->prop($job, 'subject');
    }

    private function prop(object $job, string $name): string
    {
        $property = (new ReflectionObject($job))->getProperty($name);
        $property->setAccessible(true);

        return (string) $property->getValue($job);
    }

    public function test_one_table_lists_everything_the_leaver_still_holds(): void
    {
        Bus::fake();
        $this->accessAdmin();
        $employee = $this->leaver();

        // One of each registry, so every column rule is exercised at once. Owned: a file
        // share, which is somebody else's job — it needs a new owner, not a revocation.
        $software = Software::create(['code' => 'SW-0021', 'name' => 'Microsoft 365 E3']);
        $group = EmailGroup::create([
            'code' => 'MG-0007', 'name' => 'Sales TH', 'email' => 'sales-th@inaba-foods.co.th',
            'department_id' => $this->department()->id,
        ]);
        $social = SocialPlatform::create([
            'code' => 'SM-0003', 'name' => 'Company LINE OA', 'url' => 'https://line.me/R/ti/p/@inaba',
        ]);
        $share = FileShare::create([
            'code' => 'FS-0012', 'name' => 'Sales reports', 'path' => '\\\\server\\sales\\reports',
            'department_id' => $this->department()->id,
        ]);
        FileShare::create([
            'code' => 'FS-0044', 'name' => 'Archive', 'path' => '\\\\server\\archive',
            'department_id' => $this->department()->id, 'owner_employee_id' => $employee->id,
        ]);

        // Only file shares grade access; the other three carry no level at all.
        foreach ([[$software, null], [$group, null], [$social, null], [$share, 'Write']] as [$resource, $level]) {
            AccessMembership::create([
                'resource_type' => $resource->getMorphClass(),
                'resource_id' => $resource->id,
                'employee_id' => $employee->id,
                'access_level' => $level,
                'granted_at' => now()->subYear(),
            ]);
        }

        $this->resign($employee);
        $html = $this->offboardingHtml();

        // One table, not two: the difference between a membership and an ownership is a word
        // in the "Held as" column, and two tables made the reader check two places to answer
        // "what does this person still have".
        $this->assertSame(1, substr_count($html, '<table'));

        // The Resource column carries the address, not a second copy of the name: the value
        // whoever clears the access searches for in the system at the other end.
        $this->assertStringContainsString('sales-th@inaba-foods.co.th', $html);
        $this->assertStringContainsString('server\sales\reports', $html);
        $this->assertStringContainsString('https://line.me/R/ti/p/@inaba', $html);
        // Software has no address of its own — the product IS the name.
        $this->assertStringContainsString('Microsoft 365 E3', $html);

        // "Held as" is what separates the two jobs, so it has to be filled on every row.
        // Only the graded file share carries a level; the rest are plainly members.
        $this->assertSame(3, substr_count($html, '>Member<'), 'Email group, social and software carry no level.');
        // Stored as "Write", shown the way the Access Directory shows it.
        $this->assertStringContainsString('>Read/Write<', $html);
        $this->assertStringNotContainsString('>Write<', $html);
        $this->assertStringContainsString('>Owner<', $html);

        // Grants first, then the resources they own — not interleaved.
        $this->assertLessThan(strpos($html, 'FS-0044'), strpos($html, 'SW-0021'));

        // The subject counts all five.
        $this->assertStringContainsString('5 access item(s)', $this->sentSubject());
        // Who left, and by when it has to be done.
        $this->assertStringContainsString('EMP-1042', $html);
        $this->assertStringContainsString('30-09-2026', $html);
        $this->assertStringNotContainsString('{{', $html);
    }

    public function test_a_grant_with_no_level_recorded_still_says_how_it_is_held(): void
    {
        Bus::fake();
        $this->accessAdmin();
        $employee = $this->leaver();

        $software = Software::create(['code' => 'SW-0021', 'name' => 'Microsoft 365 E3']);
        AccessMembership::create([
            'resource_type' => $software->getMorphClass(), 'resource_id' => $software->id,
            'employee_id' => $employee->id, 'granted_at' => now(),
        ]);

        $this->resign($employee);

        // A blank cell in the one column that tells the two jobs apart would be the worst
        // place to leave one.
        $this->assertStringContainsString('>Member<', $this->offboardingHtml());
    }

    public function test_a_leaver_holding_no_access_is_not_mailed_about(): void
    {
        Bus::fake();
        $this->accessAdmin();

        $this->resign($this->leaver());

        // The asset half of the resignation may still send; this half must not.
        $accessMails = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->filter(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === 'access.offboarding');
        $this->assertCount(0, $accessMails, 'Mailed a list with nothing on it.');
    }

    public function test_somebody_who_cannot_edit_access_is_not_mailed(): void
    {
        Bus::fake();
        // Can open the Access Directory but may not change anything — a to-do they cannot
        // carry out, which is the same rule the bell already applies.
        $roleId = Role::firstOrCreate(['key' => 'viewer'], ['name' => 'Viewer', 'is_system' => false])->id;
        RolePermission::firstOrCreate(['role_id' => $roleId, 'permission' => 'access.module'], ['allowed' => true]);
        User::factory()->create(['role' => 'viewer', 'email' => 'viewer@inaba.co.th']);

        $employee = $this->leaver();
        $software = Software::create(['code' => 'SW-0021', 'name' => 'Microsoft 365 E3']);
        AccessMembership::create([
            'resource_type' => $software->getMorphClass(), 'resource_id' => $software->id,
            'employee_id' => $employee->id, 'granted_at' => now(),
        ]);

        $this->resign($employee);

        $accessMails = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->filter(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === 'access.offboarding');
        $this->assertCount(0, $accessMails);
    }
}
