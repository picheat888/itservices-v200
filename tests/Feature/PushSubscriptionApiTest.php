<?php

// Covers saving and removing one Web Push subscription per browser, and the VAPID key in settings.

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PushSubscriptionApiTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, mixed> */
    private function payload(string $endpoint = 'https://push.example.test/send/abc'): array
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
            'endpoint' => 'https://push.example.test/send/abc',
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

    public function test_delete_removes_only_the_callers_subscription(): void
    {
        $a = User::factory()->create(['role' => 'user']);
        $b = User::factory()->create(['role' => 'user']);
        $this->actingAs($a)->postJson('/api/push-subscriptions', $this->payload('https://push.example.test/a'))->assertCreated();
        $this->actingAs($b)->postJson('/api/push-subscriptions', $this->payload('https://push.example.test/b'))->assertCreated();

        $this->actingAs($b)->deleteJson('/api/push-subscriptions', ['endpoint' => 'https://push.example.test/a'])->assertOk();
        $this->assertDatabaseHas('push_subscriptions', ['endpoint' => 'https://push.example.test/a']);

        $this->actingAs($b)->deleteJson('/api/push-subscriptions', ['endpoint' => 'https://push.example.test/b'])->assertOk();
        $this->assertDatabaseMissing('push_subscriptions', ['endpoint' => 'https://push.example.test/b']);
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
