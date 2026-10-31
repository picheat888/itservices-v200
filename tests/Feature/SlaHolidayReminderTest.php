<?php

// Covers the scheduled bell that tells SLA settings owners a year has no company holidays yet.

namespace Tests\Feature;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\SlaHoliday;
use App\Models\User;
use App\Services\Settings\SlaHolidayService;
use App\Support\NotificationCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Tests\TestCase;

class SlaHolidayReminderTest extends TestCase
{
    use RefreshDatabase;

    /** An account whose role holds settings.sla. */
    private function holder(array $attributes = []): User
    {
        $user = User::factory()->create(['role' => 'user', ...$attributes]);
        RolePermission::firstOrCreate(['role_id' => $user->role_id, 'permission' => 'settings.sla'], ['allowed' => true]);

        return $user;
    }

    /** @return list<array<string, mixed>> */
    private function bells(User $user): array
    {
        return DatabaseNotification::where('notifiable_id', $user->id)
            ->get()
            ->filter(fn (DatabaseNotification $n) => ($n->data['type'] ?? null) === 'sla_holidays')
            ->map(fn (DatabaseNotification $n) => $n->data)
            ->values()
            ->all();
    }

    public function test_december_rings_the_holders_about_next_year(): void
    {
        $this->travelTo('2026-12-01 08:00:00');
        $holder = $this->holder();
        Role::firstOrCreate(['key' => 'viewer'], ['name' => 'Viewer', 'color' => '#64748b', 'is_system' => false]);
        $plain = User::factory()->create(['role' => 'viewer']);
        $gone = $this->holder(['employee_id' => Employee::create(['first_name' => 'Gone', 'status' => EmployeeStatus::Resigned, 'last_day' => now()->subWeek()->toDateString()])->id]);

        $this->artisan('tickets:remind-sla-holidays')->assertSuccessful();

        $this->assertSame([['type' => 'sla_holidays', 'subtype' => 'upcoming', 'year' => 2027]], $this->bells($holder));
        $this->assertSame([], $this->bells($plain));
        $this->assertSame([], $this->bells($gone));
    }

    public function test_a_year_with_a_holiday_rings_nobody(): void
    {
        $this->travelTo('2026-12-15 08:00:00');
        $holder = $this->holder();
        SlaHoliday::factory()->create(['date' => '2027-01-01', 'name' => 'New Year']);

        $this->artisan('tickets:remind-sla-holidays')->assertSuccessful();

        $this->assertSame([], $this->bells($holder));
    }

    public function test_a_holiday_in_the_wrong_year_does_not_count(): void
    {
        $this->travelTo('2026-12-01 08:00:00');
        $holder = $this->holder();
        SlaHoliday::factory()->create(['date' => '2026-12-31', 'name' => 'Year end']);

        $this->artisan('tickets:remind-sla-holidays')->assertSuccessful();

        $this->assertCount(1, $this->bells($holder));
    }

    public function test_january_says_the_year_has_started(): void
    {
        $this->travelTo('2027-01-02 08:00:00');
        $holder = $this->holder();

        $this->artisan('tickets:remind-sla-holidays')->assertSuccessful();

        $this->assertSame([['type' => 'sla_holidays', 'subtype' => 'started', 'year' => 2027]], $this->bells($holder));
    }

    public function test_january_with_the_year_already_set_rings_nobody(): void
    {
        $this->travelTo('2027-01-02 08:00:00');
        $holder = $this->holder();
        SlaHoliday::factory()->create(['date' => '2027-04-13', 'name' => 'Songkran']);

        $this->artisan('tickets:remind-sla-holidays')->assertSuccessful();

        $this->assertSame([], $this->bells($holder));
    }

    public function test_each_run_replaces_the_earlier_bell_for_that_year(): void
    {
        $holder = $this->holder();

        $this->travelTo('2026-12-01 08:00:00');
        $this->artisan('tickets:remind-sla-holidays')->assertSuccessful();
        $this->travelTo('2026-12-15 08:00:00');
        $this->artisan('tickets:remind-sla-holidays')->assertSuccessful();
        $this->travelTo('2027-01-02 08:00:00');
        $this->artisan('tickets:remind-sla-holidays')->assertSuccessful();

        $this->assertSame([['type' => 'sla_holidays', 'subtype' => 'started', 'year' => 2027]], $this->bells($holder));
    }

    public function test_saving_that_years_holidays_takes_the_bell_back(): void
    {
        $holder = $this->holder();
        $this->travelTo('2026-12-01 08:00:00');
        $this->artisan('tickets:remind-sla-holidays')->assertSuccessful();
        $this->assertCount(1, $this->bells($holder));

        app(SlaHolidayService::class)->replaceYear(2028, [['date' => '2028-01-01', 'name' => 'Other year']]);
        $this->assertCount(1, $this->bells($holder), 'another year leaves it');

        app(SlaHolidayService::class)->replaceYear(2027, [['date' => '2027-01-01', 'name' => 'New Year']]);
        $this->assertSame([], $this->bells($holder));
    }

    public function test_other_months_send_nothing(): void
    {
        $this->travelTo('2026-11-15 08:00:00');
        $holder = $this->holder();

        $this->artisan('tickets:remind-sla-holidays')->assertSuccessful();

        $this->assertSame([], $this->bells($holder));
    }

    public function test_the_catalogue_has_one_switch_for_it(): void
    {
        $keys = array_column(NotificationCatalogue::all(), 'key');

        $this->assertContains('notif_sla_holidays_missing', $keys);
    }
}
