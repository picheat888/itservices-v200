<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Notification\NotificationTemplate;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Notifications\AssetAssignedNotification;
use App\Support\NotificationCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Notifications were the one thing in the system nobody could configure: they fired whenever their
 * event happened, said whatever was compiled into the front-end bundle, and offered no way
 * to turn one off. This covers the switch and the wording.
 */
/** Everything the module can do — what the old single key used to imply. */
const NOTIFICATION_ADMIN = [
    'notifications.module',
    'notifications.email_edit', 'notifications.email_toggle', 'notifications.email_test',
    'notifications.inapp_edit', 'notifications.inapp_toggle', 'notifications.inapp_test',
    'notifications.logs',
];

class NotificationTemplateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        NotificationCatalogue::forgetSwitches();
    }

    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'bell_'.uniqid(), 'name' => 'Bell Test', 'is_system' => false]);
        foreach ($permissions as $p) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $p, 'allowed' => true]);
        }

        return User::factory()->create(['role_id' => $role->id]);
    }

    public function test_switching_a_bell_off_stops_it_being_sent(): void
    {
        Notification::fake();
        $recipient = $this->userWith(['assets.my']);
        $asset = Asset::factory()->create();

        NotificationTemplate::create([
            'key' => 'notif_asset_assigned', 'message_en' => 'x', 'message_th' => 'x', 'enabled' => false,
        ]);
        NotificationCatalogue::forgetSwitches();

        // via() returns no channels, so the framework drops it before it reaches the database.
        $recipient->notify(new AssetAssignedNotification($asset, 'IT Store'));

        Notification::assertNothingSent();
    }

    public function test_a_bell_left_on_still_rings(): void
    {
        Notification::fake();
        $recipient = $this->userWith(['assets.my']);
        $asset = Asset::factory()->create();

        NotificationTemplate::create([
            'key' => 'notif_asset_assigned', 'message_en' => 'x', 'message_th' => 'x', 'enabled' => true,
        ]);
        NotificationCatalogue::forgetSwitches();

        $recipient->notify(new AssetAssignedNotification($asset, 'IT Store'));

        Notification::assertSentTo($recipient, AssetAssignedNotification::class);
    }

    public function test_a_bell_with_no_row_yet_rings_rather_than_going_silent(): void
    {
        Notification::fake();
        $recipient = $this->userWith(['assets.my']);

        // Nothing seeded: a notification added in code but not yet in the table must not disappear.
        $recipient->notify(new AssetAssignedNotification(Asset::factory()->create(), 'IT Store'));

        Notification::assertSentTo($recipient, AssetAssignedNotification::class);
    }

    public function test_the_catalogue_and_the_front_end_message_keys_agree(): void
    {
        $source = file_get_contents(base_path('resources/js/lang/en/notification.ts'));
        preg_match_all("/^\s{4}(notif_[a-z0-9_]+):/m", $source, $matches);

        // The seven chrome strings (title, empty, …) are page furniture, not bells.
        // Page furniture, not notification messages: tray chrome, and the marker a test row wears.
        $chrome = ['notif_title', 'notif_all', 'notif_mark_all', 'notif_clear_all', 'notif_empty', 'notif_dismiss', 'notif_unread', 'notif_test_prefix', 'notif_showing'];
        $frontEnd = array_values(array_diff($matches[1], $chrome));
        $catalogue = array_column(NotificationCatalogue::all(), 'key');

        sort($frontEnd);
        sort($catalogue);
        $this->assertSame($frontEnd, $catalogue, 'NotificationCatalogue must list every notif_* message the SPA can render.');
    }

    public function test_the_catalogue_wording_matches_what_the_spa_ships(): void
    {
        $source = file_get_contents(base_path('resources/js/lang/en/notification.ts'));

        foreach (NotificationCatalogue::all() as $bell) {
            preg_match("/^\s{4}".preg_quote($bell['key'], '/').": '(.*)',\s*$/m", $source, $m);
            $this->assertNotEmpty($m, "{$bell['key']} is not in the English notification dictionary.");
            $this->assertSame(str_replace("\'", "'", $m[1]), $bell['message_en'], "{$bell['key']} standard wording has drifted from the SPA.");
        }
    }

    /**
     * The Thai half of the same contract, which nothing was holding.
     *
     * Only English was checked, so a reworded bell could be pulled into the catalogue with
     * its Thai left behind — and the tray falls back to the bundled dictionary whenever the
     * override has not loaded, which is exactly when the two disagreeing shows.
     */
    public function test_the_catalogue_thai_wording_matches_what_the_spa_ships(): void
    {
        $source = file_get_contents(base_path('resources/js/lang/th/notification.ts'));

        foreach (NotificationCatalogue::all() as $bell) {
            preg_match("/^\s{4}".preg_quote($bell['key'], '/').": '(.*)',\s*$/m", $source, $m);
            $this->assertNotEmpty($m, "{$bell['key']} is not in the Thai notification dictionary.");
            $this->assertSame(str_replace("\'", "'", $m[1]), $bell['message_th'], "{$bell['key']} Thai wording has drifted from the SPA.");
        }
    }

    public function test_only_a_notification_administrator_may_read_or_change_bells(): void
    {
        $this->actingAs($this->userWith(['employees.view']));
        $this->getJson('/api/notification-templates')->assertForbidden();
        $this->putJson('/api/notification-templates/notif_asset_assigned', [
            'message_en' => 'x', 'message_th' => 'x', 'enabled' => true,
        ])->assertForbidden();

        $this->actingAs($this->userWith(NOTIFICATION_ADMIN));
        $this->getJson('/api/notification-templates')->assertOk()->assertJsonPath('stats.total', count(NotificationCatalogue::all()));
    }

    public function test_every_signed_in_user_can_read_the_wording_for_their_own_tray(): void
    {
        NotificationTemplate::create([
            'key' => 'notif_asset_assigned', 'message_en' => 'Yours now', 'message_th' => 'ของคุณแล้ว', 'enabled' => true,
        ]);

        // No configure permission: rendering your own bells must not need admin rights.
        $this->actingAs($this->userWith(['assets.my']));
        $this->getJson('/api/notification-messages')
            ->assertOk()
            ->assertJsonPath('data.notif_asset_assigned.en', 'Yours now')
            ->assertJsonPath('data.notif_asset_assigned.th', 'ของคุณแล้ว');
    }

    public function test_reset_puts_the_standard_wording_back(): void
    {
        $standard = NotificationCatalogue::find('notif_asset_assigned');
        NotificationTemplate::create([
            'key' => 'notif_asset_assigned', 'message_en' => 'edited', 'message_th' => 'แก้แล้ว', 'enabled' => false,
        ]);

        $this->actingAs($this->userWith(NOTIFICATION_ADMIN));
        $this->postJson('/api/notification-templates/notif_asset_assigned/reset')->assertOk();

        $row = NotificationTemplate::where('key', 'notif_asset_assigned')->first();
        $this->assertSame($standard['message_en'], $row->message_en);
        $this->assertSame($standard['message_th'], $row->message_th);
        $this->assertTrue($row->enabled);
    }

    public function test_ringing_a_bell_stamps_when_it_last_rang(): void
    {
        $recipient = $this->userWith(['assets.my']);
        NotificationTemplate::create([
            'key' => 'notif_asset_assigned', 'message_en' => 'x', 'message_th' => 'x', 'enabled' => true,
        ]);
        NotificationCatalogue::forgetSwitches();

        $this->assertNull(NotificationTemplate::where('key', 'notif_asset_assigned')->first()->last_sent_at);

        $recipient->notify(new AssetAssignedNotification(Asset::factory()->create(), 'IT Store'));

        // Without this the settings table's "Last sent" column is decoration: it was read
        // from a column nothing ever wrote to.
        $this->assertNotNull(NotificationTemplate::where('key', 'notif_asset_assigned')->first()->last_sent_at);
    }

    public function test_a_bell_that_is_off_is_not_stamped_as_having_rung(): void
    {
        $recipient = $this->userWith(['assets.my']);
        NotificationTemplate::create([
            'key' => 'notif_asset_assigned', 'message_en' => 'x', 'message_th' => 'x', 'enabled' => false,
        ]);
        NotificationCatalogue::forgetSwitches();

        $recipient->notify(new AssetAssignedNotification(Asset::factory()->create(), 'IT Store'));

        $this->assertNull(NotificationTemplate::where('key', 'notif_asset_assigned')->first()->last_sent_at);
    }

    public function test_every_bell_reports_whether_mail_covers_its_event(): void
    {
        $this->actingAs($this->userWith(NOTIFICATION_ADMIN));
        $rows = collect($this->getJson('/api/notification-templates')->assertOk()->json('data'))->keyBy('key');

        // Assets, tickets, requests and the rest all send mail as well as ringing.
        $this->assertTrue($rows['notif_asset_assigned']['has_email']);
        $this->assertTrue($rows['notif_ticket_new']['has_email']);
        // Access used to be announced by the notification alone; access.offboarding covers it
        // now, which is what the flag has to notice. NotificationEmailPairingTest guards the
        // map that decides this, because it is maintained by hand and went stale once here.
        $this->assertTrue($rows['notif_access_offboarding']['has_email']);
    }

    /**
     * Every notification needs a name, a trigger and an audience in BOTH dictionaries.
     *
     * These are composed keys (notification_name_<key>), which `translate()` falls back on by printing
     * the key itself — so a notification added to the catalogue without its wording shows the reader a
     * literal `notification_name_asset_assigned` instead of a name, and nothing else complains.
     */
    public function test_every_bell_has_its_wording_in_both_dictionaries(): void
    {
        foreach (['en', 'th'] as $locale) {
            $source = file_get_contents(base_path("resources/js/lang/{$locale}/notification.ts"));

            foreach (NotificationCatalogue::all() as $bell) {
                $suffix = substr($bell['key'], strlen('notif_'));
                foreach (['notification_name_', 'notification_when_', 'notification_who_'] as $prefix) {
                    $this->assertMatchesRegularExpression(
                        "/^\s{4}".preg_quote($prefix.$suffix, '/').':/m',
                        $source,
                        "{$locale}/notification.ts is missing {$prefix}{$suffix}.",
                    );
                }
            }
        }
    }

    public function test_the_english_wording_matches_the_catalogue_the_audit_log_uses(): void
    {
        $source = file_get_contents(base_path('resources/js/lang/en/notification.ts'));

        foreach (NotificationCatalogue::all() as $bell) {
            $suffix = substr($bell['key'], strlen('notif_'));
            preg_match("/^\s{4}notification_name_".preg_quote($suffix, '/').": '(.*)',\s*$/m", $source, $m);
            // The catalogue keeps an English name for AuditLog, which is written server-side.
            // Two copies of one sentence drift unless something checks them.
            $this->assertSame(str_replace("\'", "'", $m[1]), $bell['name'], "notification_name_{$suffix} has drifted from the catalogue.");
        }
    }

    public function test_pressing_test_puts_a_sample_in_your_own_tray(): void
    {
        $admin = $this->userWith(NOTIFICATION_ADMIN);

        $this->actingAs($admin)->postJson('/api/notification-templates/notif_asset_assigned/test')->assertOk();

        $row = $admin->notifications()->first();
        $this->assertNotNull($row, 'The test never reached the tray.');
        $this->assertSame('test', $row->data['type']);
        // The key, not a rendered sentence: the tray words it in the reader's own language,
        // and freezing one language into the row would stop it tracking the text being tested.
        $this->assertSame('notif_asset_assigned', $row->data['source_key']);
        $this->assertSame('assets', $row->data['module']);
    }

    public function test_a_switched_off_notification_still_tests(): void
    {
        NotificationTemplate::create([
            'key' => 'notif_asset_assigned', 'message_en' => 'x', 'message_th' => 'x', 'enabled' => false,
        ]);
        NotificationCatalogue::forgetSwitches();
        $admin = $this->userWith(NOTIFICATION_ADMIN);

        // Switched off is exactly when you want to see what you are about to turn back on, so
        // the test notification is the one that ignores the switch.
        $this->actingAs($admin)->postJson('/api/notification-templates/notif_asset_assigned/test')->assertOk();

        $this->assertSame(1, $admin->notifications()->count());
    }

    public function test_testing_needs_the_notification_administrator_permission(): void
    {
        $this->actingAs($this->userWith(['assets.my']));
        $this->postJson('/api/notification-templates/notif_asset_assigned/test')->assertForbidden();
    }
}
