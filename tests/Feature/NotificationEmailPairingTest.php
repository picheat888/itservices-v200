<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\Notification\NotificationTemplateController;
use App\Models\Notification\NotificationTemplate;
use App\Models\Permission\Role;
use App\Models\User;
use App\Support\EmailTemplates;
use App\Support\NotificationCatalogue;
use Database\Seeders\NotificationTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionMethod;
use Tests\TestCase;

/**
 * The Notification screen warns that a bell is the ONLY announcement its event has — switch
 * it off and nobody is told the thing happened. That warning is worth having only while it
 * is true, and it is decided by a hand-written module → email-prefix map.
 *
 * The map went stale exactly once already: `access` stayed null after access.offboarding
 * shipped, so the one bell that had just stopped being its event's only channel was the only
 * one still flagged as it. A map maintained by hand cannot notice that on its own.
 */
class NotificationEmailPairingTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, string|null> module => email prefix */
    private function map(): array
    {
        $method = new ReflectionMethod(NotificationTemplateController::class, 'emailPrefixFor');
        $method->setAccessible(true);
        $controller = app(NotificationTemplateController::class);

        $modules = collect(NotificationCatalogue::all())->pluck('module')->unique();

        return $modules->mapWithKeys(fn (string $module) => [
            $module => $method->invoke($controller, $module),
        ])->all();
    }

    /** @return list<string> the distinct prefixes of every standard email key */
    private function emailPrefixes(): array
    {
        return collect(EmailTemplates::all())
            ->map(fn (array $template) => explode('.', $template['key'])[0])
            ->unique()->sort()->values()->all();
    }

    public function test_every_email_family_is_claimed_by_a_notification_module(): void
    {
        $claimed = array_values(array_filter($this->map()));

        foreach ($this->emailPrefixes() as $prefix) {
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

        $rows = collect($this->getJson('/api/notification-templates')->assertOk()->json('data'));
        $bell = $rows->firstWhere('key', 'notif_access_offboarding');

        $this->assertNotNull($bell, 'the access offboarding bell is missing from the listing');
        $this->assertTrue($bell['has_email'], 'access.offboarding covers this event — the warning is stale');
    }

    /**
     * The counts above the table, including the two that answer opposite halves of the same
     * question: how many bells are on, and how many are off.
     *
     * "Switched off" is the first thing to check when somebody reports an alert that never
     * arrived — before this it could only be found by reading down the whole table.
     */
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
        // Deliberately no total for the bells no mail covers: it only ever read 0 once every
        // module had mail of its own, and the useful form of it is the warning on the row.
        $this->assertArrayNotHasKey('only_channel', $stats);
    }
}
