<?php

// MailConfigService::apply() copies the stored SMTP settings onto config('mail.*') (SET-18).

namespace Tests\Feature;

use App\Models\Settings\MailSetting;
use App\Services\Settings\MailConfigService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MailConfigApplyTest extends TestCase
{
    use RefreshDatabase;

    public function test_apply_copies_db_settings_into_mail_config(): void
    {
        MailSetting::current()->update([
            'host' => 'smtp.example.test', 'port' => 2525, 'username' => 'mailer', 'password' => 'p4ss',
            'encryption' => 'tls', 'from_address' => 'it@example.test', 'from_name' => 'IT Desk',
        ]);

        app(MailConfigService::class)->apply();

        $this->assertSame('smtp', config('mail.default'));
        $this->assertSame('smtp.example.test', config('mail.mailers.smtp.host'));
        $this->assertSame(2525, config('mail.mailers.smtp.port'));
        $this->assertSame('mailer', config('mail.mailers.smtp.username'));
        $this->assertSame('p4ss', config('mail.mailers.smtp.password'));
        $this->assertSame('tls', config('mail.mailers.smtp.encryption'));
        $this->assertSame('it@example.test', config('mail.from.address'));
        $this->assertSame('IT Desk', config('mail.from.name'));
    }
}
