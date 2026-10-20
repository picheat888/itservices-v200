<?php

namespace Tests\Feature\Auth;

use App\Enums\Auth\LoginEventType;
use App\Models\Auth\LoginEvent;
use App\Models\User;
use App\Services\Auth\LoginEventRecorder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// A name typed at sign-in that matches no account is kept with its last 4 characters hidden, new rows and old alike.
class TypedNameMaskTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_last_four_characters_are_hidden(): void
    {
        $this->assertSame('Inaba@2••••', LoginEventRecorder::maskTail('Inaba@2026!'));
        $this->assertSame('a••••', LoginEventRecorder::maskTail('admin'));
        $this->assertSame('••••', LoginEventRecorder::maskTail('abcd'));
        $this->assertSame('•••', LoginEventRecorder::maskTail('abc'));
        $this->assertSame('สมชาย••••', LoginEventRecorder::maskTail('สมชายใจดี'));
        $this->assertSame('', LoginEventRecorder::maskTail(''));
    }

    public function test_the_migration_hides_names_already_saved_for_unknown_accounts_only(): void
    {
        $user = User::factory()->create();
        $unknown = $this->event(['event' => LoginEventType::Failed, 'login_name' => 'Inaba@2026!']);
        $short = $this->event(['event' => LoginEventType::Locked, 'login_name' => 'abc']);
        $known = $this->event(['event' => LoginEventType::Failed, 'login_name' => $user->email, 'user_id' => $user->id]);
        $signedIn = $this->event(['event' => LoginEventType::SignedIn, 'login_name' => null, 'user_id' => $user->id]);

        $migration = require database_path('migrations/2026_10_20_000005_mask_typed_names_of_unknown_accounts.php');
        $migration->up();
        $migration->up();

        $this->assertSame('Inaba@2••••', $unknown->refresh()->login_name);
        $this->assertSame('•••', $short->refresh()->login_name);
        $this->assertSame($user->email, $known->refresh()->login_name);
        $this->assertNull($signedIn->refresh()->login_name);
    }

    /** @param  array<string, mixed>  $attributes */
    private function event(array $attributes): LoginEvent
    {
        return LoginEvent::query()->create([
            'user_id' => null,
            'event' => LoginEventType::Failed,
            'ip' => '203.0.113.10',
            'os' => 'Windows',
            'browser' => 'Chrome',
            ...$attributes,
        ]);
    }
}
