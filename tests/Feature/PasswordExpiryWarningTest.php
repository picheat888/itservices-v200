<?php

namespace Tests\Feature;

use App\Models\Notification\NotificationTemplate;
use App\Models\Permission\Role;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Support\NotificationCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Tests\TestCase;

/**
 * The heads-up before a password expiry policy locks somebody out.
 *
 * CheckPasswordExpiry already refuses every route once the window has passed, which
 * is a wall the user meets with no warning. This bell is the warning: raised at
 * sign-in once the password is inside its last fortnight, and raised again at every
 * sign-in after that, because a notice somebody dismissed on Monday has to still be
 * there on Friday when they finally have a minute to act on it.
 *
 * Raised again, not piled up — the tray holds one of these at a time, carrying today's
 * count rather than the count on the day it first appeared.
 */
class PasswordExpiryWarningTest extends TestCase
{
    use RefreshDatabase;

    /** Turn the policy on with the given window, in days. */
    private function policy(int $days): void
    {
        AppSetting::put('password_expiry_days', (string) $days);
    }

    /**
     * An account whose password was set `$daysAgo` days ago.
     *
     * The factory's password is 'password', which is what signIn() posts below.
     */
    private function user(int $daysAgo, array $attributes = []): User
    {
        Role::firstOrCreate(['key' => 'user'], ['name' => 'Staff', 'color' => '#64748b', 'is_system' => false]);

        return User::factory()->create([
            'role' => 'user',
            'password_changed_at' => now()->subDays($daysAgo),
            ...$attributes,
        ]);
    }

    /** Sign in the way the SPA does — a stateful Origin, so a session is started. */
    private function signIn(User $user): void
    {
        $this->withHeader('Origin', 'http://localhost:8000')
            ->postJson('/api/login', ['login' => $user->email, 'password' => 'password'])
            ->assertOk();
    }

    /** @return list<DatabaseNotification> */
    private function warnings(User $user): array
    {
        return DatabaseNotification::where('notifiable_id', $user->id)
            ->get()
            ->filter(fn (DatabaseNotification $n) => ($n->data['type'] ?? null) === 'password_expiring')
            ->values()
            ->all();
    }

    public function test_it_warns_on_the_first_day_of_the_last_fortnight(): void
    {
        $this->policy(90);
        // 76 days used, 14 left — the first sign-in that should say anything.
        $user = $this->user(76);

        $this->signIn($user);

        $warnings = $this->warnings($user);
        $this->assertCount(1, $warnings);
        $this->assertSame(14, $warnings[0]->data['days_remaining']);
    }

    public function test_it_stays_quiet_while_the_expiry_is_further_off(): void
    {
        $this->policy(90);
        $user = $this->user(75); // 15 days left

        $this->signIn($user);

        $this->assertSame([], $this->warnings($user));
    }

    public function test_it_stays_quiet_when_no_expiry_policy_is_set(): void
    {
        $this->policy(0);
        $user = $this->user(3650);

        $this->signIn($user);

        $this->assertSame([], $this->warnings($user));
    }

    /**
     * Past the window the account is already walled off by CheckPasswordExpiry and
     * meets a blocking dialog it cannot dismiss. A bell behind that says nothing new.
     */
    public function test_it_stays_quiet_once_the_password_has_actually_expired(): void
    {
        $this->policy(90);
        $user = $this->user(91);

        $this->signIn($user);

        $this->assertSame([], $this->warnings($user));
    }

    /** An account already owing a forced change is being asked in a louder way. */
    public function test_it_stays_quiet_for_an_account_that_must_change_anyway(): void
    {
        $this->policy(90);
        $user = $this->user(85, ['must_change_password' => true]);

        $this->signIn($user);

        $this->assertSame([], $this->warnings($user));
    }

    /**
     * Signing in twice leaves one notice, not two — and the one that survives is the
     * newer, so the tray shows the count as it stands today.
     */
    public function test_signing_in_again_replaces_the_notice_rather_than_stacking_one(): void
    {
        $this->policy(90);
        $user = $this->user(80); // 10 days left

        $this->signIn($user);
        $first = $this->warnings($user)[0];

        // The second sign-in is a day later, so the count it carries has moved.
        $this->travel(1)->days();
        $this->signIn($user->fresh());

        $warnings = $this->warnings($user);
        $this->assertCount(1, $warnings);
        $this->assertNotSame($first->id, $warnings[0]->id, 'the old notice was left in place');
        $this->assertSame(9, $warnings[0]->data['days_remaining']);
    }

    /** An administrator can silence it from Settings, like every other bell. */
    public function test_switching_it_off_silences_it(): void
    {
        $this->policy(90);
        $user = $this->user(80);

        NotificationTemplate::create([
            'key' => 'notif_password_expiring',
            'message_en' => 'x',
            'message_th' => 'x',
            'enabled' => false,
        ]);
        NotificationCatalogue::forgetSwitches();

        $this->signIn($user);

        $this->assertSame([], $this->warnings($user));
    }

    /** The new bell belongs to the catalogue's "other" group, and is seeded with the rest. */
    public function test_the_bell_is_catalogued_under_the_other_group(): void
    {
        $bell = NotificationCatalogue::find('notif_password_expiring');

        $this->assertNotNull($bell, 'the bell has no catalogue entry, so it cannot be reworded or switched off');
        $this->assertSame('system', $bell['module']);
    }
}
