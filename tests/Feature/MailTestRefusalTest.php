<?php

// The SMTP test button's refusals arrive as codes the Settings page words in the reader's language (SET-9).

namespace Tests\Feature;

use App\Models\Settings\MailSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MailTestRefusalTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_unconfigured_smtp_is_refused_with_a_code(): void
    {
        MailSetting::current()->update(['host' => null, 'from_address' => null]);

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson('/api/settings/mail/test')
            ->assertStatus(422)
            ->assertJsonPath('message', 'smtp_not_configured');
    }

    public function test_an_account_without_an_email_is_refused_with_a_code(): void
    {
        MailSetting::current()->update(['host' => 'smtp.example.test', 'from_address' => 'it@example.test']);

        $this->actingAs(User::factory()->create(['role' => 'super', 'email' => '']))
            ->postJson('/api/settings/mail/test')
            ->assertStatus(422)
            ->assertJsonPath('message', 'no_email');
    }
}
