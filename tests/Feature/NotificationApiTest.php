<?php

namespace Tests\Feature;

use App\Models\Contract;
use App\Models\User;
use App\Notifications\ContractExpiryNotification;
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
}
