<?php

namespace Tests\Feature;

use App\Models\Notification\NotificationTemplate;
use App\Models\Permission\Role;
use App\Models\User;
use App\Services\Notification\NotificationTemplateService;
use App\Support\EmailTemplates;
use App\Support\NotificationCatalogue;
use Database\Seeders\NotificationTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Keeps the Notification screen's "no email covers this bell" warning true. */
class NotificationEmailPairingTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, string|null> module => email prefix */
    private function map(): array
    {
        $modules = collect(NotificationCatalogue::all())->pluck('module')->unique();

        return $modules->mapWithKeys(fn (string $module) => [
            $module => NotificationTemplateService::emailPrefixFor($module),
        ])->all();
    }

    /** @return list<string> the distinct prefixes of every standard email key */
    private function emailPrefixes(): array
    {
        return collect(EmailTemplates::all())
            ->map(fn (array $template) => explode('.', $template['key'])[0])
            ->unique()->sort()->values()->all();
    }

    /** Email families no module claims; report mails pair per bell through BELL_EMAILS. */
    private const STANDALONE_EMAIL_FAMILIES = ['report'];

    public function test_every_email_family_is_claimed_by_a_notification_module(): void
    {
        $claimed = array_values(array_filter($this->map()));

        foreach (array_diff($this->emailPrefixes(), self::STANDALONE_EMAIL_FAMILIES) as $prefix) {
            $this->assertContains(
                $prefix,
                $claimed,
                "Email templates exist under \"{$prefix}.\" but no notification module points at them, so every "
                ."bell in that module is still labelled as its event's only channel. Add it to emailPrefixFor()."
            );
        }
    }

    public function test_the_map_never_points_at_a_prefix_with_no_templates(): void
    {
        $prefixes = $this->emailPrefixes();

        foreach (array_filter($this->map()) as $module => $prefix) {
            $this->assertContains(
                $prefix,
                $prefixes,
                "Module \"{$module}\" claims mail under \"{$prefix}.\" but no such template exists, so its bells "
                .'are silently treated as covered when nothing covers them.'
            );
        }
    }

    public function test_the_leavers_access_bell_is_no_longer_its_events_only_channel(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->seed(NotificationTemplateSeeder::class); // the list shows the stored bells

        $rows = collect($this->getJson('/api/notification-templates')->assertOk()->json('data'));
        $bell = $rows->firstWhere('key', 'notif_access_offboarding');

        $this->assertNotNull($bell, 'the access offboarding bell is missing from the listing');
        $this->assertTrue($bell['has_email'], 'access.offboarding covers this event — the warning is stale');
    }

    public function test_only_the_report_ready_bell_of_the_system_module_has_a_mail(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->seed(NotificationTemplateSeeder::class);

        $rows = collect($this->getJson('/api/notification-templates')->assertOk()->json('data'))->keyBy('key');

        $this->assertTrue($rows['notif_report_export_ready']['has_email'], 'report.export_ready mails the same person');
        $this->assertFalse($rows['notif_report_export_failed']['has_email']);
        $this->assertFalse($rows['notif_report_schedule_failed']['has_email']);
        $this->assertFalse($rows['notif_password_expiring']['has_email']);
        $this->assertFalse($rows['notif_sla_holidays_missing']['has_email']);
    }

    public function test_every_bell_level_mail_names_a_real_template(): void
    {
        $keys = collect(EmailTemplates::all())->pluck('key')->all();
        $bells = collect(NotificationCatalogue::all())->pluck('key')->all();

        foreach (NotificationTemplateService::BELL_EMAILS as $bell => $email) {
            $this->assertContains($bell, $bells, "BELL_EMAILS names \"{$bell}\", which is not a bell");
            $this->assertContains($email, $keys, "BELL_EMAILS pairs \"{$bell}\" with \"{$email}\", which is not a template");
        }
    }

    /** The counts above the table. */
    public function test_the_counts_add_up_and_report_both_sides_of_the_switch(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->seed(NotificationTemplateSeeder::class);
        NotificationTemplate::where('key', 'notif_asset_assigned')->update(['enabled' => false]);
        NotificationCatalogue::forgetSwitches();

        $stats = $this->getJson('/api/notification-templates')->assertOk()->json('stats');

        $this->assertSame(count(NotificationCatalogue::all()), $stats['total']);
        $this->assertSame(1, $stats['disabled']);
        $this->assertSame($stats['total'], $stats['enabled'] + $stats['disabled'], 'every bell is either on or off');
        // No only-channel total on purpose
        $this->assertArrayNotHasKey('only_channel', $stats);
    }
}
