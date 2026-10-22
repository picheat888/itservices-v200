<?php

// Covers the relay of every bell to Web Push: who gets a queued push, the payload shape, and the test button.

namespace Tests\Feature;

use App\Models\Contract\Contract;
use App\Models\Notification\NotificationTemplate;
use App\Models\User;
use App\Notifications\ContractExpiryNotification;
use App\Notifications\WebPushRelay;
use App\Support\NotificationCatalogue;
use App\Support\WebPushPayload;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Notifications\SendQueuedNotifications;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class WebPushRelayTest extends TestCase
{
    use RefreshDatabase;

    private function makeContract(string $name = 'Support plan'): Contract
    {
        return Contract::create([
            'vendor' => 'Acme',
            'name' => $name,
            'type' => 'service',
            'start_date' => now()->subYear(),
            'end_date' => now()->addDays(30),
            'value' => 10000,
            'billing_cycle' => 'yearly',
        ]);
    }

    private function subscribe(User $user, string $endpoint = 'https://push.example/one'): void
    {
        $user->updatePushSubscription($endpoint, 'pk', 'auth', 'aes128gcm');
    }

    private function relayPushed(): int
    {
        return Queue::pushed(SendQueuedNotifications::class, fn ($job) => $job->notification instanceof WebPushRelay)->count();
    }

    public function test_a_bell_for_a_user_with_push_queues_one_relay(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $this->subscribe($user);

        $user->notify(new ContractExpiryNotification($this->makeContract(), 30));

        Queue::assertPushed(SendQueuedNotifications::class, fn ($job) => $job->notification instanceof WebPushRelay);
        $this->assertSame(1, $this->relayPushed());
    }

    public function test_a_user_without_push_gets_no_relay(): void
    {
        Queue::fake();
        $user = User::factory()->create();

        $user->notify(new ContractExpiryNotification($this->makeContract(), 30));

        $this->assertSame(1, $user->notifications()->count());
        $this->assertSame(0, $this->relayPushed());
    }

    public function test_a_bell_switched_off_by_the_admin_sends_no_push(): void
    {
        Queue::fake();
        NotificationTemplate::create(['key' => 'notif_contract_expiring', 'message_en' => 'x', 'message_th' => 'x', 'enabled' => false]);
        NotificationCatalogue::forgetSwitches();
        $user = User::factory()->create();
        $this->subscribe($user);

        $user->notify(new ContractExpiryNotification($this->makeContract(), 30));

        $this->assertSame(0, $user->notifications()->count());
        $this->assertSame(0, $this->relayPushed());
    }

    public function test_payload_carries_the_users_language_and_the_bell_data(): void
    {
        Queue::fake();
        $user = User::factory()->create(['preferences' => ['lang' => 'th']]);
        $user->notify(new ContractExpiryNotification($this->makeContract(), 30));
        $bell = $user->notifications()->first();

        $payload = WebPushPayload::for($bell, $user);

        $this->assertSame(1, $payload['v']);
        $this->assertSame('th', $payload['lang']);
        $this->assertSame($bell->id, $payload['id']);
        $this->assertSame($bell->data, $payload['data']);
        $this->assertArrayNotHasKey('truncated', $payload);
    }

    public function test_an_oversized_bell_becomes_a_short_truncated_payload(): void
    {
        $user = User::factory()->create(['preferences' => ['lang' => 'th']]);
        $bell = new DatabaseNotification;
        $bell->id = 'big-1';
        $bell->created_at = now();
        $bell->data = ['type' => 'ticket_assigned', 'subject' => str_repeat('ก', 5000)];

        $payload = WebPushPayload::for($bell, $user);

        $this->assertLessThanOrEqual(WebPushPayload::MAX_BYTES, strlen(json_encode($payload)));
        $this->assertTrue($payload['truncated']);
        $this->assertSame(['type' => 'ticket_assigned'], $payload['data']);
        $this->assertSame('big-1', $payload['id']);
    }

    /** @param array<string, mixed> $payload */
    private function assertWireIsThePayload(array $payload, User $user): void
    {
        $message = (new WebPushRelay($payload))->toWebPush($user, new WebPushRelay($payload));

        $this->assertSame(json_encode($payload), json_encode($message->toArray()));
        $this->assertSame(['TTL' => WebPushRelay::TTL_SECONDS], $message->getOptions());
    }

    public function test_the_wire_json_is_the_payload_itself_for_a_bell_a_truncated_bell_and_the_test_push(): void
    {
        Queue::fake();
        $user = User::factory()->create(['preferences' => ['lang' => 'th']]);
        $user->notify(new ContractExpiryNotification($this->makeContract(), 30));

        $big = new DatabaseNotification;
        $big->id = 'big-1';
        $big->created_at = now();
        $big->data = ['type' => 'ticket_assigned', 'subject' => str_repeat('ก', 5000)];
        $truncated = WebPushPayload::for($big, $user);
        $this->assertTrue($truncated['truncated']);

        $this->assertWireIsThePayload(WebPushPayload::for($user->notifications()->first(), $user), $user);
        $this->assertWireIsThePayload($truncated, $user);
        $this->assertWireIsThePayload(WebPushPayload::test($user), $user);
    }

    public function test_the_test_button_pushes_only_to_the_callers_given_endpoint(): void
    {
        Queue::fake();
        $user = User::factory()->create(['preferences' => ['lang' => 'th']]);
        $other = User::factory()->create();
        $this->subscribe($user, 'https://push.example/mine');
        $this->subscribe($user, 'https://push.example/mine-too');
        $this->subscribe($other, 'https://push.example/theirs');

        $this->actingAs($user)
            ->postJson('/api/push-subscriptions/test', ['endpoint' => 'https://push.example/mine'])
            ->assertStatus(202);

        $this->assertSame(1, $this->relayPushed());
        Queue::assertPushed(SendQueuedNotifications::class, function ($job) {
            $routes = $job->notifiables->first()->routes['WebPush'];

            return $job->notification instanceof WebPushRelay
                && $routes->count() === 1
                && $routes->first()->endpoint === 'https://push.example/mine';
        });

        $this->actingAs($user)
            ->postJson('/api/push-subscriptions/test', ['endpoint' => 'https://push.example/theirs'])
            ->assertNotFound();
        $this->assertSame(1, $this->relayPushed());
    }
}
