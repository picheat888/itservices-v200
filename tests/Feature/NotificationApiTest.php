<?php

namespace Tests\Feature;

use App\Models\Contract\Contract;
use App\Models\User;
use App\Notifications\ContractExpiryNotification;
use App\Notifications\NotificationTestNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Covers the in-app notification bell (NotificationController): listing with the
 * unread count, marking read (single + all), dismissing, and the ownership guard
 * that isolates one user's notifications from another's.
 */
class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    /** A throwaway contract used as the subject of bell notifications. */
    private function makeContract(): Contract
    {
        return Contract::create([
            'vendor' => 'Acme',
            'name' => 'Support plan',
            'type' => 'service',
            'start_date' => now()->subYear(),
            'end_date' => now()->addDays(30),
            'value' => 10000,
            'billing_cycle' => 'yearly',
        ]);
    }

    /** Sends a database bell notification to the given user and returns its id. */
    private function notify(User $user, Contract $contract): string
    {
        $user->notify(new ContractExpiryNotification($contract, 30));

        return $user->fresh()->notifications()->latest()->first()->id;
    }

    public function test_guests_cannot_list_notifications(): void
    {
        $this->getJson('/api/notifications')->assertUnauthorized();
    }

    public function test_index_returns_only_own_notifications_with_unread_count(): void
    {
        $contract = $this->makeContract();
        $user = User::factory()->create();
        $other = User::factory()->create();

        // Two for the user (one later marked read), one for somebody else.
        $this->notify($user, $contract);
        $readId = $this->notify($user, $contract);
        $user->notifications()->where('id', $readId)->first()->markAsRead();
        $this->notify($other, $contract);

        $this->actingAs($user)
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonCount(2, 'data')   // never the other user's
            ->assertJsonPath('unread', 1)
            ->assertJsonPath('data.0.data.type', 'contract_expiring');
    }

    public function test_user_can_mark_a_single_notification_read(): void
    {
        $user = User::factory()->create();
        $id = $this->notify($user, $this->makeContract());

        $this->actingAs($user)
            ->putJson("/api/notifications/{$id}/read")
            ->assertOk()
            ->assertJsonPath('message', 'success');

        $this->assertSame(0, $user->fresh()->unreadNotifications()->count());
    }

    public function test_user_cannot_mark_another_users_notification(): void
    {
        $owner = User::factory()->create();
        $id = $this->notify($owner, $this->makeContract());

        $this->actingAs(User::factory()->create())
            ->putJson("/api/notifications/{$id}/read")
            ->assertNotFound();

        $this->assertSame(1, $owner->fresh()->unreadNotifications()->count());
    }

    public function test_mark_all_clears_the_unread_count(): void
    {
        $contract = $this->makeContract();
        $user = User::factory()->create();
        $this->notify($user, $contract);
        $this->notify($user, $contract);

        $this->actingAs($user)
            ->putJson('/api/notifications/read-all')
            ->assertOk()
            ->assertJsonPath('message', 'success');

        $this->assertSame(0, $user->fresh()->unreadNotifications()->count());
    }

    public function test_user_can_dismiss_their_own_notification(): void
    {
        $user = User::factory()->create();
        $id = $this->notify($user, $this->makeContract());

        $this->actingAs($user)
            ->deleteJson("/api/notifications/{$id}")
            ->assertOk();

        $this->assertSame(0, $user->fresh()->notifications()->count());
    }

    public function test_user_cannot_dismiss_another_users_notification(): void
    {
        $owner = User::factory()->create();
        $id = $this->notify($owner, $this->makeContract());

        $this->actingAs(User::factory()->create())
            ->deleteJson("/api/notifications/{$id}")
            ->assertNotFound();

        $this->assertSame(1, $owner->fresh()->notifications()->count());
    }

    /**
     * The list is capped, so rows slide into the window when one in front of them is deleted.
     * The SPA pops a toast for what ARRIVED while you were watching, and it cannot tell that
     * from "became visible" without a real timestamp: dismissing one alert used to pop four
     * toasts for a months-old backlog.
     */
    public function test_each_row_carries_a_machine_readable_timestamp(): void
    {
        $user = User::factory()->create(['role' => 'super']);
        $user->notify(new ContractExpiryNotification($this->makeContract(), 7));

        $row = $this->actingAs($user)->getJson('/api/notifications')->assertOk()->json('data.0');

        $this->assertArrayHasKey('created_at_iso', $row);
        // Parseable and the same instant as the human phrasing beside it.
        $this->assertSame(
            $user->notifications()->first()->created_at->toIso8601String(),
            $row['created_at_iso'],
        );
    }

    /**
     * The list is capped at 30, and the tray's filter chips are built from these figures.
     *
     * They used to be counted from the rows the tray had been handed, so "All 30" meant the
     * window was full rather than that there were 30 — and dismissing one left it saying 30
     * again, because an older row slid in behind. `total` and `counts` describe everything
     * held, not everything sent.
     */
    public function test_totals_describe_every_notification_not_just_the_page(): void
    {
        $contract = $this->makeContract();
        $user = User::factory()->create();
        foreach (range(1, 35) as $ignored) {
            $this->notify($user, $contract);
        }

        $body = $this->actingAs($user)->getJson('/api/notifications')->assertOk()->json();

        $this->assertCount(30, $body['data'], 'The window itself is still capped.');
        $this->assertSame(35, $body['total']);
        $this->assertSame(35, $body['unread']);
        $this->assertSame(
            [['type' => 'contract_expiring', 'module' => null, 'count' => 35]],
            $body['counts'],
        );
    }

    public function test_counts_are_grouped_per_type_so_the_front_end_can_map_them_to_modules(): void
    {
        $user = User::factory()->create();
        $this->notify($user, $this->makeContract());
        $user->notify(new NotificationTestNotification('notif_asset_assigned', 'assets'));

        $counts = collect($this->actingAs($user)->getJson('/api/notifications')->assertOk()->json('counts'))
            ->keyBy('type');

        $this->assertSame(1, $counts['contract_expiring']['count']);
        // A test sample carries the module it imitates, so the tray can tab it with its kin.
        $this->assertSame('assets', $counts['test']['module']);
    }
}
