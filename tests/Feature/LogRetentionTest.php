<?php

namespace Tests\Feature;

use App\Enums\Auth\LoginEventType;
use App\Models\AuditLog;
use App\Models\Auth\LoginEvent;
use App\Models\Auth\UserDevice;
use App\Models\Email\EmailLog;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

// The nightly retention sweep (logs:prune): row and body windows, unread bells kept, 0 = keep forever.
class LogRetentionTest extends TestCase
{
    use RefreshDatabase;

    // EmailLog does not accept created_at as fillable, so the age is set afterwards
    private function emailLog(int $daysAgo, string $status = 'sent'): EmailLog
    {
        $log = EmailLog::create([
            'template_key' => 'ticket.assigned',
            'to_email' => 'someone@abcd.co.th',
            'subject' => 'A ticket was assigned to you',
            'body_html' => '<p>Body kept so the entry can be reopened and read.</p>',
            'status' => $status,
        ]);
        EmailLog::where('id', $log->id)->update(['created_at' => now()->subDays($daysAgo)]);

        return $log->refresh();
    }

    private function notification(int $daysAgo, ?int $readDaysAgo): string
    {
        $id = (string) Str::uuid();
        DB::table('notifications')->insert([
            'id' => $id,
            'type' => 'App\\Notifications\\StockAlertNotification',
            'notifiable_type' => User::class,
            'notifiable_id' => 1,
            'data' => '{"message":"Stock is low"}',
            'read_at' => $readDaysAgo === null ? null : now()->subDays($readDaysAgo),
            'created_at' => now()->subDays($daysAgo),
            'updated_at' => now()->subDays($daysAgo),
        ]);

        return $id;
    }

    private function loginEvent(int $daysAgo): LoginEvent
    {
        return LoginEvent::create([
            'login_name' => 'someone',
            'event' => LoginEventType::SignedIn,
            'ip' => '203.0.113.5',
            'created_at' => now()->subDays($daysAgo),
        ]);
    }

    public function test_an_old_email_keeps_its_row_after_its_body_is_emptied(): void
    {
        AppSetting::put('email_log_body_days', '90');
        AppSetting::put('email_log_days', '730');
        $old = $this->emailLog(120);
        $recent = $this->emailLog(10);

        $this->artisan('logs:prune')->assertSuccessful();

        // The weight goes, the record stays — subject, recipient and result all still readable.
        $old->refresh();
        $this->assertNull($old->body_html);
        $this->assertSame('A ticket was assigned to you', $old->subject);
        $this->assertSame('sent', $old->status);

        $this->assertNotNull($recent->refresh()->body_html, 'a recent email keeps its body');
        $this->assertSame(2, EmailLog::count(), 'neither row was deleted at this window');
    }

    public function test_the_email_statistics_survive_the_body_sweep(): void
    {
        AppSetting::put('email_log_body_days', '30');
        $this->emailLog(120);
        $this->emailLog(120, 'failed');

        $this->artisan('logs:prune')->assertSuccessful();

        // What the Email Templates page counts, read the way that page reads it.
        $this->assertSame(1, EmailLog::where('status', 'sent')->count());
        $this->assertSame(1, EmailLog::where('status', 'failed')->count());
    }

    public function test_an_email_log_row_goes_once_it_is_past_the_row_window(): void
    {
        AppSetting::put('email_log_body_days', '90');
        AppSetting::put('email_log_days', '365');
        $ancient = $this->emailLog(400);
        $old = $this->emailLog(120);

        $this->artisan('logs:prune')->assertSuccessful();

        $this->assertDatabaseMissing('email_logs', ['id' => $ancient->id]);
        $this->assertDatabaseHas('email_logs', ['id' => $old->id]);
    }

    public function test_a_read_notification_is_pruned_but_an_unread_one_never_is(): void
    {
        AppSetting::put('notification_days', '90');
        $read = $this->notification(daysAgo: 120, readDaysAgo: 110);
        $unread = $this->notification(daysAgo: 400, readDaysAgo: null);
        $recentlyRead = $this->notification(daysAgo: 10, readDaysAgo: 9);

        $this->artisan('logs:prune')->assertSuccessful();

        $this->assertDatabaseMissing('notifications', ['id' => $read]);
        $this->assertDatabaseHas('notifications', ['id' => $unread]);
        $this->assertDatabaseHas('notifications', ['id' => $recentlyRead]);
    }

    public function test_login_events_older_than_the_window_are_pruned(): void
    {
        // Shipped default window is 365 days
        $expired = $this->loginEvent(366);
        $kept = $this->loginEvent(364);

        $this->artisan('logs:prune')->expectsOutputToContain('login events: 1')->assertSuccessful();

        $this->assertDatabaseMissing('login_events', ['id' => $expired->id]);
        $this->assertDatabaseHas('login_events', ['id' => $kept->id]);
        $this->assertStringContainsString('login_events: 1', AuditLog::where('action', 'Pruned logs')->sole()->target);

        AppSetting::put('login_log_days', '0');
        $ancient = $this->loginEvent(5000);

        $this->artisan('logs:prune')->assertSuccessful();

        $this->assertDatabaseHas('login_events', ['id' => $ancient->id]);
        $this->assertDatabaseHas('login_events', ['id' => $kept->id]);
    }

    public function test_ended_and_expired_devices_past_the_login_window_are_pruned_and_active_ones_never_are(): void
    {
        $user = User::factory()->create();
        $endedLongAgo = UserDevice::factory()->for($user)->ended()->create(['last_active_at' => now()->subDays(366)]);
        $endedRecently = UserDevice::factory()->for($user)->ended()->create(['last_active_at' => now()->subDays(364)]);
        $plainLongAgo = UserDevice::factory()->for($user)->create(['last_active_at' => now()->subDays(400)]);
        $rememberedLongAgo = UserDevice::factory()->for($user)->remembered()->create([
            'last_active_at' => now()->subDays(400), 'remember_expires_at' => now()->subDays(393),
        ]);
        $stillRemembered = UserDevice::factory()->for($user)->remembered()->create(['last_active_at' => now()->subDays(400)]);
        $inUse = UserDevice::factory()->for($user)->create();

        $this->artisan('logs:prune')->assertSuccessful();

        foreach ([$endedLongAgo, $plainLongAgo, $rememberedLongAgo] as $pruned) {
            $this->assertDatabaseMissing('user_devices', ['id' => $pruned->id]);
        }
        foreach ([$endedRecently, $stillRemembered, $inUse] as $kept) {
            $this->assertDatabaseHas('user_devices', ['id' => $kept->id]);
        }
        $this->assertStringContainsString('user_devices: 3', AuditLog::where('action', 'Pruned logs')->sole()->target);
    }

    public function test_a_login_window_of_zero_keeps_every_device(): void
    {
        AppSetting::put('login_log_days', '0');
        $ancient = UserDevice::factory()->ended()->create(['last_active_at' => now()->subDays(5000)]);

        $this->artisan('logs:prune')->assertSuccessful();

        $this->assertDatabaseHas('user_devices', ['id' => $ancient->id]);
    }

    public function test_audit_logs_are_kept_forever_unless_a_window_is_set(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        AuditLog::record('Signed in', 'someone');
        AuditLog::query()->update(['created_at' => now()->subDays(3000)]);

        // Shipped default: no window at all, so nothing is removed however old it is.
        $this->artisan('logs:prune')->assertSuccessful();
        $this->assertSame(1, AuditLog::count());

        AppSetting::put('audit_log_days', '365');
        $this->artisan('logs:prune')->assertSuccessful();
        $this->assertSame(1, AuditLog::count(), 'the sweep logs its own run, and that entry is new');
        $this->assertSame('Pruned logs', AuditLog::first()->action);
    }

    public function test_a_window_of_zero_keeps_everything(): void
    {
        foreach (['email_log_body_days', 'email_log_days', 'audit_log_days', 'notification_days', 'login_log_days'] as $key) {
            AppSetting::put($key, '0');
        }
        $email = $this->emailLog(3000);
        $notification = $this->notification(daysAgo: 3000, readDaysAgo: 2999);
        $loginEvent = $this->loginEvent(3000);

        $this->artisan('logs:prune')->assertSuccessful();

        $this->assertNotNull($email->refresh()->body_html);
        $this->assertDatabaseHas('notifications', ['id' => $notification]);
        $this->assertDatabaseHas('login_events', ['id' => $loginEvent->id]);
        // Nothing happened, so the sweep wrote no audit line about it either.
        $this->assertSame(0, AuditLog::where('action', 'Pruned logs')->count());
    }

    public function test_the_retention_windows_are_readable_and_savable_from_settings(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        // A fresh install answers with the shipped defaults, not with zeroes.
        $this->getJson('/api/settings/security')
            ->assertOk()
            ->assertJsonPath('data.email_log_body_days', 90)
            ->assertJsonPath('data.email_log_days', 730)
            ->assertJsonPath('data.audit_log_days', 0)
            ->assertJsonPath('data.notification_days', 90);

        $this->putJson('/api/settings/security', [
            'session_timeout_minutes' => 30,
            'password_expiry_days' => 90,
            'email_log_body_days' => 30,
            'email_log_days' => 365,
            'audit_log_days' => 1825,
            'notification_days' => 60,
        ])
            ->assertOk()
            ->assertJsonPath('data.email_log_body_days', 30)
            ->assertJsonPath('data.audit_log_days', 1825);

        $this->assertSame('365', AppSetting::get('email_log_days'));
        $this->assertSame('60', AppSetting::get('notification_days'));
    }

    public function test_saving_only_the_authentication_policy_leaves_the_windows_alone(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));
        AppSetting::put('email_log_days', '365');

        // The retention keys are `sometimes`, so an older client sending two fields still works.
        $this->putJson('/api/settings/security', [
            'session_timeout_minutes' => 15,
            'password_expiry_days' => 60,
        ])->assertOk();

        $this->assertSame('365', AppSetting::get('email_log_days'));
    }
}
