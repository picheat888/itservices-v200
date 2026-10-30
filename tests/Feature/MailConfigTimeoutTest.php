<?php

namespace Tests\Feature;

use App\Models\Settings\MailSetting;
use App\Services\Email\EmailNotificationService;
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

    public function test_changed_smtp_settings_reach_an_already_built_mailer(): void
    {
        MailSetting::current()->update(['host' => 'old.example.com', 'port' => 587, 'from_address' => 'it@example.com']);
        app(MailConfigService::class)->apply();
        $this->assertSame('old.example.com', $this->smtpStream()->getHost());

        MailSetting::current()->update(['host' => 'new.example.com']);
        app(MailConfigService::class)->apply();

        $this->assertSame('new.example.com', $this->smtpStream()->getHost());
    }

    public function test_an_unconfigured_apply_still_drops_the_built_mailer(): void
    {
        // The .env fallback is SMTP and its mailer was built before the timeout was set
        config(['mail.default' => 'smtp', 'mail.mailers.smtp.timeout' => null]);
        $this->assertNotSame((float) MailConfigService::SMTP_TIMEOUT_SECONDS, $this->smtpStreamTimeout());

        app(MailConfigService::class)->apply();

        $this->assertFalse(MailSetting::current()->isConfigured());
        $this->assertSame((float) MailConfigService::SMTP_TIMEOUT_SECONDS, $this->smtpStreamTimeout());
    }

    /** The Settings test button waits 10 seconds; queued mail keeps 30 (SET-14). */
    public function test_the_test_button_waits_less_than_queued_mail(): void
    {
        Mail::fake();
        MailSetting::current()->update(['host' => 'smtp.example.com', 'port' => 587, 'from_address' => 'it@example.com']);
        $mail = app(EmailNotificationService::class);

        $mail->sendTest('somchai@example.com');
        $this->assertSame(MailConfigService::TEST_TIMEOUT_SECONDS, config('mail.mailers.smtp.timeout'));
        $this->assertSame(10, MailConfigService::TEST_TIMEOUT_SECONDS);

        $mail->deliver('somchai@example.com', 'Ticket', '<p>Body</p>', null);
        $this->assertSame(MailConfigService::SMTP_TIMEOUT_SECONDS, config('mail.mailers.smtp.timeout'));
    }

    /** The timeout the SMTP mailer's socket is actually built with. */
    private function smtpStreamTimeout(): float
    {
        return $this->smtpStream()->getTimeout();
    }

    /** The socket of the SMTP mailer as it is built now. */
    private function smtpStream(): SocketStream
    {
        $transport = Mail::mailer('smtp')->getSymfonyTransport();
        $this->assertInstanceOf(EsmtpTransport::class, $transport);

        $stream = $transport->getStream();
        $this->assertInstanceOf(SocketStream::class, $stream);

        return $stream;
    }
}
