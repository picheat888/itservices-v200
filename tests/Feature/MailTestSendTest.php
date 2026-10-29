<?php

// The SMTP test button sends one message to the signed-in user once SMTP is configured (SET-18).

namespace Tests\Feature;

use App\Mail\TemplatedMail;
use App\Models\Settings\MailSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class MailTestSendTest extends TestCase
{
    use RefreshDatabase;

    public function test_configured_smtp_sends_to_the_current_user(): void
    {
        Mail::fake();
        MailSetting::current()->update(['host' => 'smtp.example.test', 'from_address' => 'it@example.test']);
        $user = User::factory()->create(['role' => 'super', 'email' => 'me@example.test']);

        $this->actingAs($user)
            ->postJson('/api/settings/mail/test')
            ->assertOk()
            ->assertJsonPath('sent', true)
            ->assertJsonPath('to', 'me@example.test');

        Mail::assertSent(TemplatedMail::class, 1);
        Mail::assertSent(TemplatedMail::class, fn (TemplatedMail $mail) => $mail->hasTo('me@example.test'));
    }
}
