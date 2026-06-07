<?php

namespace Tests\Feature;

use App\Models\MailSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MailAndSlaValidationTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** @return array<string, mixed> A complete, valid SMTP payload. */
    private function validMail(): array
    {
        return [
            'host' => 'smtp.example.com',
            'port' => 587,
            'username' => 'mailer',
            'password' => 'secret-pass',
            'encryption' => 'tls',
            'from_address' => 'noreply@example.com',
            'from_name' => 'IT Service Desk',
        ];
    }

    public function test_valid_mail_payload_is_saved(): void
    {
        $this->actingAs($this->admin())
            ->putJson('/api/settings/mail', $this->validMail())
            ->assertOk();

        $this->assertSame('smtp.example.com', MailSetting::current()->host);
    }

    public function test_mail_required_fields_and_formats(): void
    {
        $this->actingAs($this->admin())
            ->putJson('/api/settings/mail', [
                'host' => '',
                'port' => 70000,            // out of range
                'username' => '',
                'password' => '',           // required on first setup (no existing password)
                'from_address' => 'not-an-email',
                'from_name' => '',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['host', 'port', 'username', 'password', 'from_address', 'from_name']);
    }

    public function test_mail_password_optional_once_one_is_stored(): void
    {
        // Seed an existing password.
        MailSetting::current()->update(['password' => 'existing-pass']);

        // Blank password is allowed now (keeps the stored one).
        $this->actingAs($this->admin())
            ->putJson('/api/settings/mail', array_merge($this->validMail(), ['password' => '']))
            ->assertOk();

        $this->assertSame('existing-pass', MailSetting::current()->password);
    }

    public function test_sla_resolution_must_be_at_least_first_response(): void
    {
        // response = 600 min (10h); resolve = 1 hour (60 min) < 600 → invalid.
        $payload = ['ticket_sla' => ['high' => ['response' => 600, 'resolve' => 1]]];

        $this->actingAs($this->admin())
            ->putJson('/api/settings/sla', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['ticket_sla.high.resolve']);
    }

    public function test_sla_valid_when_resolution_covers_first_response(): void
    {
        // response = 30 min; resolve = 4 hours (240 min) ≥ 30 → valid.
        $payload = ['ticket_sla' => [
            'critical' => ['response' => 15, 'resolve' => 4],
            'high' => ['response' => 30, 'resolve' => 8],
        ]];

        $this->actingAs($this->admin())
            ->putJson('/api/settings/sla', $payload)
            ->assertOk();
    }
}
