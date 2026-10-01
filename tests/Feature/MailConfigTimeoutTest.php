<?php

namespace Tests\Feature;

use App\Models\Settings\MailSetting;
use App\Services\Settings\MailConfigService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Symfony\Component\Mailer\Transport\Smtp\Stream\SocketStream;
use Tests\TestCase;

/**
 * MailConfigService puts a timeout on SMTP sends, so a mail server that stops answering fails the
 * one send instead of freezing the queue worker (and every report export queued behind it).
 */
class MailConfigTimeoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_configured_smtp_gets_the_timeout(): void
    {
        MailSetting::current()->update([
            'host' => 'smtp.example.com',
            'port' => 587,
            'from_address' => 'it@example.com',
        ]);

        app(MailConfigService::class)->apply();

        $this->assertSame(MailConfigService::SMTP_TIMEOUT_SECONDS, config('mail.mailers.smtp.timeout'));
        $this->assertSame((float) MailConfigService::SMTP_TIMEOUT_SECONDS, $this->smtpStreamTimeout());
    }

    public function test_env_fallback_gets_the_timeout_too(): void
    {
        config(['mail.mailers.smtp.timeout' => null]);

        app(MailConfigService::class)->apply();

        $this->assertFalse(MailSetting::current()->isConfigured());
        $this->assertSame(MailConfigService::SMTP_TIMEOUT_SECONDS, config('mail.mailers.smtp.timeout'));
    }

    /** The timeout the SMTP mailer's socket is actually built with. */
    private function smtpStreamTimeout(): float
    {
        $transport = Mail::mailer('smtp')->getSymfonyTransport();
        $this->assertInstanceOf(EsmtpTransport::class, $transport);

        $stream = $transport->getStream();
        $this->assertInstanceOf(SocketStream::class, $stream);

        return $stream->getTimeout();
    }
}
