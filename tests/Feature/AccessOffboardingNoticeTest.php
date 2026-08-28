<?php

namespace Tests\Feature;

use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\Software;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Notifications\AccessOffboardingNotification;
use App\Notifications\EmployeeResignedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Recording a resignation recalled the person's devices and told IT to close their login,
 * but said nothing about the access they still held — their grants and owned resources sat
 * there until somebody happened to open the Access Directory.
 *
 * The bell does not revoke anything: access stays a manual job (the same rule that stops an
 * approved request from auto-granting). It only makes sure the work is known about.
 */
class AccessOffboardingNoticeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
    }

    /** Create a non-super user holding exactly the given permissions. */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'off_'.uniqid(), 'name' => 'Offboarding Test', 'is_system' => false]);
        foreach ($permissions as $p) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $p, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    private function leaver(): Employee
    {
        return Employee::create(['code' => 'EMP-OFF', 'first_name' => 'Off', 'last_name' => 'Boarding']);
    }

    private function grantTo(Employee $employee): void
    {
        AccessMembership::create([
            'resource_type' => (new Software)->getMorphClass(),
            'resource_id' => Software::create(['code' => 'SW-OFF-'.uniqid(), 'name' => 'App'])->id,
            'employee_id' => $employee->id,
            'granted_at' => now(),
        ]);
    }

    private function resign(Employee $employee): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->postJson("/api/employees/{$employee->id}/resign", ['reason' => 'Moving on'])->assertOk();
    }

    public function test_whoever_can_clear_the_access_is_told(): void
    {
        Notification::fake();

        $employee = $this->leaver();
        $this->grantTo($employee);
        $editor = $this->userWith(['access.module', 'access.software_view', 'access.software_edit']);

        $this->resign($employee);

        Notification::assertSentToTimes($editor, AccessOffboardingNotification::class, 1);
    }

    public function test_one_bell_covers_the_whole_person(): void
    {
        Notification::fake();

        $employee = $this->leaver();
        for ($i = 0; $i < 3; $i++) {
            $this->grantTo($employee);
        }
        EmailGroup::create(['code' => 'EG-OFF', 'name' => 'Owned', 'email' => 'off@x.test', 'owner_employee_id' => $employee->id]);
        $editor = $this->userWith(['access.module', 'access.software_edit']);

        $this->resign($employee);

        // Five things to clear is still one piece of news — five bells would bury the tray.
        Notification::assertSentToTimes($editor, AccessOffboardingNotification::class, 1);
        Notification::assertSentTo($editor, AccessOffboardingNotification::class, function ($notification) use ($editor) {
            $payload = $notification->toDatabase($editor);

            // Split as well as totalled: revoking and reassigning are different jobs.
            return $payload['grants'] === 3 && $payload['owned'] === 1 && $payload['total'] === 4;
        });
    }

    public function test_a_viewer_who_cannot_edit_is_not_given_the_job(): void
    {
        Notification::fake();

        $employee = $this->leaver();
        $this->grantTo($employee);
        $viewer = $this->userWith(['access.module', 'access.overview', 'access.software_view']);

        $this->resign($employee);

        Notification::assertNotSentTo($viewer, AccessOffboardingNotification::class);
    }

    public function test_a_leaver_holding_no_access_raises_nothing(): void
    {
        Notification::fake();

        $employee = $this->leaver();
        $editor = $this->userWith(['access.module', 'access.software_edit']);

        $this->resign($employee);

        // An alert about nothing teaches people to ignore the tray.
        Notification::assertNotSentTo($editor, AccessOffboardingNotification::class);
    }

    public function test_a_revoked_grant_is_not_something_left_behind(): void
    {
        Notification::fake();

        $employee = $this->leaver();
        AccessMembership::create([
            'resource_type' => (new Software)->getMorphClass(),
            'resource_id' => Software::create(['code' => 'SW-OFF-REV', 'name' => 'App'])->id,
            'employee_id' => $employee->id,
            'granted_at' => now()->subDay(),
            'revoked_at' => now(),
        ]);
        $editor = $this->userWith(['access.module', 'access.software_edit']);

        $this->resign($employee);

        Notification::assertNotSentTo($editor, AccessOffboardingNotification::class);
    }

    public function test_owning_a_resource_alone_is_enough_to_raise_it(): void
    {
        Notification::fake();

        $employee = $this->leaver();
        FileShare::create(['code' => 'FS-OFF', 'name' => 'Owned share', 'path' => '\\srv\off', 'owner_employee_id' => $employee->id]);
        $editor = $this->userWith(['access.module', 'access.file_edit']);

        $this->resign($employee);

        Notification::assertSentTo($editor, AccessOffboardingNotification::class, function ($notification) use ($editor) {
            $payload = $notification->toDatabase($editor);

            return $payload['grants'] === 0 && $payload['owned'] === 1;
        });
    }

    public function test_the_person_filing_the_resignation_is_told_too(): void
    {
        Notification::fake();

        $employee = $this->leaver();
        $this->grantTo($employee);
        $actor = $this->userWith(['employees.module', 'employees.resign', 'access.module', 'access.software_edit']);

        $this->actingAs($actor);
        $this->postJson("/api/employees/{$employee->id}/resign", ['reason' => 'Moving on'])->assertOk();

        // Filing a resignation is not the same act as clearing the access it leaves behind,
        // and in most installs one admin holds both permissions. Excluding them as "the
        // person who just did it" left the bell with nobody to go to at all.
        Notification::assertSentTo($actor, AccessOffboardingNotification::class);
    }

    public function test_a_lone_admin_still_gets_both_offboarding_bells(): void
    {
        Notification::fake();

        $employee = $this->leaver();
        $this->grantTo($employee);
        // The shape that broke it in the live database: one super user holding every
        // permission, filing the resignation themselves.
        $admin = User::factory()->create(['role' => 'super']);

        $this->actingAs($admin);
        $this->postJson("/api/employees/{$employee->id}/resign", ['reason' => 'Moving on'])->assertOk();

        Notification::assertSentTo($admin, AccessOffboardingNotification::class);
        Notification::assertSentTo($admin, EmployeeResignedNotification::class);
    }

    public function test_a_grant_editor_who_cannot_open_the_page_is_not_belled(): void
    {
        Notification::fake();

        $employee = $this->leaver();
        $this->grantTo($employee);
        // An older role can still hold a child key without the master that opens the page.
        // A bell whose link lands on 403 is worse than no bell.
        $stranded = $this->userWith(['access.software_edit']);

        $this->resign($employee);

        Notification::assertNotSentTo($stranded, AccessOffboardingNotification::class);
    }

    public function test_the_directory_hears_about_a_departure_as_news(): void
    {
        Notification::fake();

        $employee = $this->leaver();
        $watcher = $this->userWith(['employees.module', 'employees.view']);

        $this->resign($employee);

        // They cannot close the account, so it arrives as news, not as a task — and unlike
        // the access bell it is not conditional on work being left over: that someone left
        // is worth knowing on its own.
        Notification::assertSentTo($watcher, EmployeeResignedNotification::class, function ($notification) use ($watcher) {
            return $notification->toDatabase($watcher)['subtype'] === 'departure';
        });
    }

    public function test_nobody_is_told_twice_about_the_same_person(): void
    {
        Notification::fake();

        $employee = $this->leaver();
        // Holds both gates: the task is the useful copy, so the news one is not also sent.
        $both = $this->userWith(['employees.module', 'employees.view', 'employees.set_credentials']);

        $this->resign($employee);

        Notification::assertSentToTimes($both, EmployeeResignedNotification::class, 1);
        Notification::assertSentTo($both, EmployeeResignedNotification::class, function ($notification) use ($both) {
            return $notification->toDatabase($both)['subtype'] === 'offboarding';
        });
    }
}
