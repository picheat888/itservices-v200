<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Email\EmailLog;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The nightly retention sweep (`logs:prune`).
 *
 * Three tables record what the system did rather than what the business owns, and none of
 * them shrink on their own. What these tests pin down is not that rows disappear — that part
 * is easy — but the three judgements around it: an email log keeps its row after its body is
 * emptied (the Email Templates counters read that table), an unread bell is never deleted
 * however old it gets, and a window left at 0 means keep forever rather than delete now.
 */
class LogRetentionTest extends TestCase
{
    use RefreshDatabase;

    /**
     * EmailLog manages created_at itself and does not accept it as fillable, so the age is
     * forced on afterwards — the alternative, travelling time for every row, would make each
     * test read as a sequence of dates rather than as the ages that matter to it.
     */
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
        foreach (['email_log_body_days', 'email_log_days', 'audit_log_days', 'notification_days'] as $key) {
            AppSetting::put($key, '0');
        }
        $email = $this->emailLog(3000);
        $notification = $this->notification(daysAgo: 3000, readDaysAgo: 2999);

        $this->artisan('logs:prune')->assertSuccessful();

        $this->assertNotNull($email->refresh()->body_html);
        $this->assertDatabaseHas('notifications', ['id' => $notification]);
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
