<?php

// Covers saving and removing one Web Push subscription per browser, and the VAPID key in settings.

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PushSubscriptionApiTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, mixed> */
    private function payload(string $endpoint = 'https://fcm.googleapis.com/fcm/send/abc'): array
    {
        return [
            'endpoint' => $endpoint,
            'keys' => ['p256dh' => 'BPublicKeyValue', 'auth' => 'authSecret'],
            'content_encoding' => 'aes128gcm',
        ];
    }

    public function test_a_signed_in_user_saves_this_browsers_subscription(): void
    {
        $user = User::factory()->create(['role' => 'user']);

        $this->actingAs($user)->postJson('/api/push-subscriptions', $this->payload())
            ->assertCreated()
            ->assertJsonPath('message', 'success');

        $this->assertDatabaseHas('push_subscriptions', [
            'endpoint' => 'https://fcm.googleapis.com/fcm/send/abc',
            'subscribable_id' => $user->id,
        ]);
    }

    public function test_saving_the_same_endpoint_again_keeps_one_row_and_moves_it_to_the_new_user(): void
    {
        $a = User::factory()->create(['role' => 'user']);
        $b = User::factory()->create(['role' => 'user']);

        $this->actingAs($a)->postJson('/api/push-subscriptions', $this->payload())->assertCreated();
        $this->actingAs($b)->postJson('/api/push-subscriptions', $this->payload())->assertCreated();

        $this->assertSame(1, DB::table('push_subscriptions')->count());
        $this->assertDatabaseHas('push_subscriptions', ['subscribable_id' => $b->id]);
    }

    public function test_endpoint_must_be_https(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->postJson('/api/push-subscriptions', $this->payload('http://evil.test/x'))
            ->assertStatus(422)
            ->assertJsonValidationErrors('endpoint');
    }

    /** @return array<string, array{string}> */
    public static function pushServiceEndpoints(): array
    {
        return [
            'chrome' => ['https://fcm.googleapis.com/fcm/send/abc'],
            'firefox' => ['https://updates.push.services.mozilla.com/wpush/v2/abc'],
            'safari' => ['https://web.push.apple.com/QGx-abc'],
            'edge' => ['https://wns2-par02p.notify.windows.com/w/?token=abc'],
        ];
    }

    #[DataProvider('pushServiceEndpoints')]
    public function test_endpoints_on_the_browser_push_services_are_accepted(string $endpoint): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->postJson('/api/push-subscriptions', $this->payload($endpoint))
            ->assertCreated();

        $this->assertDatabaseHas('push_subscriptions', ['endpoint' => $endpoint]);
    }

    /** @return array<string, array{string}> */
    public static function foreignEndpoints(): array
    {
        return [
            'intranet host' => ['https://intranet.local/x'],
            'push host as a prefix' => ['https://fcm.googleapis.com.evil.test/x'],
            'push host in the path' => ['https://evil.test/fcm.googleapis.com'],
            'push host as userinfo' => ['https://fcm.googleapis.com@evil.test/x'],
            'userinfo before a push host' => ['https://user:pass@fcm.googleapis.com/x'],
            'odd port' => ['https://fcm.googleapis.com:8443/x'],
            'bare suffix' => ['https://push.apple.com/x'],
            'suffix without a dot' => ['https://evilpush.apple.com/x'],
            'plain http' => ['http://fcm.googleapis.com/x'],
        ];
    }

    #[DataProvider('foreignEndpoints')]
    public function test_endpoints_off_the_push_services_are_refused(string $endpoint): void
    {
        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->postJson('/api/push-subscriptions', $this->payload($endpoint))
            ->assertStatus(422)
            ->assertJsonValidationErrors('endpoint');

        $this->assertSame(0, DB::table('push_subscriptions')->count());
    }

    public function test_delete_removes_only_the_callers_subscription(): void
    {
        $a = User::factory()->create(['role' => 'user']);
        $b = User::factory()->create(['role' => 'user']);
        $this->actingAs($a)->postJson('/api/push-subscriptions', $this->payload('https://fcm.googleapis.com/fcm/send/a'))->assertCreated();
        $this->actingAs($b)->postJson('/api/push-subscriptions', $this->payload('https://fcm.googleapis.com/fcm/send/b'))->assertCreated();

        $this->actingAs($b)->deleteJson('/api/push-subscriptions', ['endpoint' => 'https://fcm.googleapis.com/fcm/send/a'])->assertOk();
        $this->assertDatabaseHas('push_subscriptions', ['endpoint' => 'https://fcm.googleapis.com/fcm/send/a']);

        $this->actingAs($b)->deleteJson('/api/push-subscriptions', ['endpoint' => 'https://fcm.googleapis.com/fcm/send/b'])->assertOk();
        $this->assertDatabaseMissing('push_subscriptions', ['endpoint' => 'https://fcm.googleapis.com/fcm/send/b']);
    }

    public function test_guests_cannot_subscribe(): void
    {
        $this->postJson('/api/push-subscriptions', $this->payload())->assertUnauthorized();
    }

    public function test_settings_carry_the_vapid_public_key_for_signed_in_users_only(): void
    {
        config(['webpush.vapid.public_key' => 'test-public-key']);

        $this->getJson('/api/settings')->assertOk()->assertJsonMissingPath('data.vapid_public_key');

        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->getJson('/api/settings')
            ->assertOk()
            ->assertJsonPath('data.vapid_public_key', 'test-public-key');
    }
}
