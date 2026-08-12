<?php

namespace Tests\Feature;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * A resignation closes the account — the day AFTER the last working day.
 *
 * Resigning only flips employees.status, and nothing used to read it on the way in:
 * LoginRequest::authenticate() called Auth::attempt and stopped there, so the account of
 * somebody who had left kept working with their role and every permission on it. The
 * notice period is the other half of the rule: locking somebody out the moment their
 * resignation is recorded takes the system away from a person who still works here.
 */
class ResignedAccountAccessTest extends TestCase
{
    use RefreshDatabase;

    /** Posts credentials the way the SPA does — the stateful Origin is what attaches the session. */
    private function attemptLogin(string $login): TestResponse
    {
        return $this->withHeader('Origin', 'http://localhost:8000')
            ->postJson('/api/login', ['login' => $login, 'password' => 'password']);
    }

    /** @param  string|null  $lastDay  a date, or null for a resignation with no notice period */
    private function staff(string $username, EmployeeStatus $status, ?string $lastDay = null): User
    {
        $employee = Employee::create([
            'first_name' => ucfirst(strtok($username, '.')),
            'status' => $status,
            'last_day' => $lastDay,
        ]);

        return User::factory()->create(['username' => $username, 'employee_id' => $employee->id]);
    }

    /**
     * Where each day of a resignation timeline lands. `null` = resigned with no last day.
     *
     * @return array<string, array{0: string|null, 1: bool}>
     */
    public static function resignationDays(): array
    {
        return [
            'the day after the last day' => ['-1 day', false],
            'a week after the last day' => ['-7 days', false],
            // The case that matters: a last day of 2026-08-12 must still work ON the 12th.
            'the last day itself' => ['today', true],
            'still serving out the notice period' => ['+1 month', true],
            'resigned with no last day recorded' => [null, false],
        ];
    }

    #[DataProvider('resignationDays')]
    public function test_a_resignation_closes_the_account_the_day_after_the_last_day(?string $lastDay, bool $canSignIn): void
    {
        $this->staff('leaver', EmployeeStatus::Resigned, $lastDay === null ? null : date('Y-m-d', strtotime($lastDay)));

        $response = $this->attemptLogin('leaver');

        if ($canSignIn) {
            $response->assertOk();
            $this->assertAuthenticated();

            return;
        }

        // 403 + a code, not the 422 that means "wrong username or password": the sign-in
        // form renders its own copy per status, and telling somebody whose account is
        // closed to check for a typo sends them (and support) after a ghost.
        $response->assertForbidden()->assertJsonPath('message', 'account_closed');
        $this->assertGuest();
    }

    public function test_an_active_employee_still_signs_in(): void
    {
        // The guard must key off the resignation, not merely on having an employee record.
        $this->staff('here.staff', EmployeeStatus::Active);

        $this->attemptLogin('here.staff')->assertOk();
    }

    public function test_an_account_with_no_employee_record_still_signs_in(): void
    {
        // The administrator account is not a person in the directory; a guard that read
        // "no employee" as "not allowed" would lock the system's own admin out.
        User::factory()->create(['username' => 'admin.only', 'employee_id' => null]);

        $this->attemptLogin('admin.only')->assertOk();
    }

    public function test_an_open_session_stops_working_once_the_last_day_has_passed(): void
    {
        $user = $this->staff('leaving.staff', EmployeeStatus::Active);

        // Signed in while still employed…
        $this->actingAs($user)->getJson('/api/me')->assertOk();

        // …resignation recorded, last day still to come: nothing changes for them yet.
        $user->employee->update(['status' => EmployeeStatus::Resigned, 'last_day' => now()->addWeek()->toDateString()]);
        $this->actingAs($user)->getJson('/api/me')->assertOk();

        // …and once that day is behind them the open session stops answering, rather than
        // lasting until it happens to time out.
        $user->employee->update(['last_day' => now()->subDay()->toDateString()]);
        $this->actingAs($user)->getJson('/api/me')->assertUnauthorized();
    }

    public function test_somebody_shut_out_can_still_clear_their_own_session(): void
    {
        // logout opts out of the guard: without that, the one route that tidies up after
        // them answers 401 and the stale cookie stays in their browser.
        $user = $this->staff('gone.staff', EmployeeStatus::Resigned, now()->subDay()->toDateString());

        // The Origin header is what attaches the session middleware logout() clears.
        $this->actingAs($user)
            ->withHeader('Origin', 'http://localhost:8000')
            ->postJson('/api/logout')
            ->assertOk();
    }
}
