<?php

// Test factory for UserDevice: a plain, just-used browser sign-in with no remember cookie.

namespace Database\Factories;

use App\Enums\Auth\DeviceEndReason;
use App\Models\Auth\UserDevice;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<UserDevice>
 */
class UserDeviceFactory extends Factory
{
    /** @var class-string<UserDevice> */
    protected $model = UserDevice::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'session_id' => Str::random(40),
            'remember_token_hash' => null,
            'remember_expires_at' => null,
            'ip' => fake()->ipv4(),
            'location' => 'Bangkok, Thailand',
            'os' => 'Windows',
            'browser' => 'Chrome',
            'user_agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36',
            'signed_in_at' => now()->subMinutes(10),
            'last_active_at' => now(),
            'ended_at' => null,
            'end_reason' => null,
            'ended_by' => null,
        ];
    }

    /** Signed in with remember-me: has a cookie hash and a remember expiry. */
    public function remembered(): static
    {
        return $this->state(fn () => [
            'remember_token_hash' => hash('sha256', Str::random(60)),
            'remember_expires_at' => now()->addMinutes((int) config('auth.guards.web.remember')),
        ]);
    }

    /** Signed out, for the given reason. */
    public function ended(DeviceEndReason $reason = DeviceEndReason::SignedOut): static
    {
        return $this->state(fn () => [
            'session_id' => null,
            'ended_at' => now(),
            'end_reason' => $reason,
        ]);
    }
}
