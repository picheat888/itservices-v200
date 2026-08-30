<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
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
 * The departure announcement: somebody has left, and the people who work with the directory
 * need to know even though there is nothing for them to do about it.
 *
 * It is the one resignation mail with no task in it. The other two ask for something back —
 * the assets, the access — and go only to whoever can do that; this one is news, so its
 * audience is simply everybody allowed to look at staff records.
 */
class EmployeeDepartureEmailTest extends TestCase
{
    use RefreshDatabase;

    private const KEY = 'employee.offboarding';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
    }

    /** @param  list<string>  $permissions */
    private function userWith(array $permissions, string $email, string $name = 'Anong Wattana'): User
    {
        $roleKey = 'r_'.substr(md5(implode('|', $permissions)), 0, 8);
        $roleId = Role::firstOrCreate(['key' => $roleKey], ['name' => 'Test', 'is_system' => false])->id;
        foreach ($permissions as $permission) {
            RolePermission::firstOrCreate(['role_id' => $roleId, 'permission' => $permission], ['allowed' => true]);
        }

        return User::factory()->create(['role' => $roleKey, 'email' => $email, 'name' => $name]);
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

    private function resign(Employee $employee): void
    {
        app(EmployeeService::class)->resign($employee, 'New job', '2026-12-31');
    }

    /** @return list<string> the addresses the announcement was queued for */
    private function announcedTo(): array
    {
        return collect(Bus::dispatched(SendTemplatedEmail::class))
            ->filter(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === self::KEY)
            ->map(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'toEmail'))
            ->values()->all();
    }

    private function announcementHtml(): string
    {
        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === self::KEY);

        $this->assertNotNull($job, 'No departure announcement was queued.');

        return $this->prop($job, 'html');
    }

    private function prop(object $job, string $name): string
    {
        $property = (new ReflectionObject($job))->getProperty($name);
        $property->setAccessible(true);

        return (string) $property->getValue($job);
    }

    public function test_it_says_who_left_and_when_they_finish(): void
    {
        Bus::fake();
        $this->userWith(['employees.view'], 'hr@inaba.co.th');

        $this->resign($this->leaver());
        $html = $this->announcementHtml();

        $this->assertStringContainsString('Somchai Suksawat has resigned', $html);
        $this->assertStringContainsString('EMP-1042', $html);
        $this->assertStringContainsString('31-12-2026', $html);
        $this->assertStringNotContainsString('{{', $html, 'An unfilled variable was sent as raw {{...}}.');
    }

    public function test_everyone_who_may_see_staff_records_is_told_including_the_offboarder(): void
    {
        Bus::fake();
        // The bells split these two so nobody hears one event twice in one tray. On email
        // there is nothing to be told twice by — the offboarding task has no mail of its own
        // — so leaving the offboarder out would mean the person most involved in a departure
        // is the one person it is not announced to.
        $this->userWith(['employees.view'], 'hr@inaba.co.th', 'Manee Jaidee');
        $this->userWith(['employees.view', 'employees.set_credentials'], 'it@inaba.co.th', 'Anong Wattana');

        $this->resign($this->leaver());

        $told = $this->announcedTo();
        sort($told);
        $this->assertSame(['hr@inaba.co.th', 'it@inaba.co.th'], $told);
    }

    public function test_the_leaver_is_not_told_about_their_own_resignation(): void
    {
        Bus::fake();
        $employee = $this->leaver();

        // A leaver who has a login of their own, and who may see staff records.
        $self = $this->userWith(['employees.view'], 'somchai@inaba.co.th', 'Somchai Suksawat');
        $self->update(['employee_id' => $employee->id]);
        $this->userWith(['employees.view'], 'hr@inaba.co.th', 'Manee Jaidee');

        $this->resign($employee);

        $this->assertSame(['hr@inaba.co.th'], $this->announcedTo());
    }

    public function test_nobody_outside_the_directory_is_told(): void
    {
        Bus::fake();
        // Can raise tickets, cannot look at staff records — a departure is not their news.
        $this->userWith(['tickets.create'], 'sales@inaba.co.th');

        $this->resign($this->leaver());

        $this->assertSame([], $this->announcedTo());
    }

    public function test_a_watcher_with_no_address_is_recorded_rather_than_dropped(): void
    {
        Bus::fake();
        $this->userWith(['employees.view'], '', 'Manee Jaidee')->update(['email' => null]);

        $this->resign($this->leaver());

        // Nothing is queued — there is nowhere to send it. But it is not silently dropped
        // either: sendTemplate() writes a `skipped` row naming them, so "nobody told them"
        // is a fact somebody can look up rather than a thing that quietly never happened.
        $this->assertSame([], $this->announcedTo());
        $this->assertDatabaseHas('email_logs', [
            'template_key' => self::KEY,
            'to_email' => null,
            'recipient_name' => 'Manee Jaidee',
            'status' => 'skipped',
        ]);
    }
}
