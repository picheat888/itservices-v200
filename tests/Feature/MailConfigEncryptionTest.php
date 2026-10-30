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
 * The Encryption choice on the email settings reaches the SMTP transport (SET-6):
 * SSL connects encrypted, TLS insists on STARTTLS, Auto goes by the port and upgrades when offered.
 */
class MailConfigEncryptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_ssl_connects_encrypted_from_the_start(): void
    {
        $transport = $this->transportFor('ssl', 587);

        $this->assertTrue($this->stream($transport)->isTLS());
        $this->assertFalse($transport->isTlsRequired());
    }

    public function test_tls_insists_on_starttls(): void
    {
        $transport = $this->transportFor('tls', 587);

        $this->assertFalse($this->stream($transport)->isTLS());
        $this->assertTrue($transport->isTlsRequired());
    }

    public function test_auto_goes_by_the_port_and_upgrades_when_offered(): void
    {
        $plain = $this->transportFor(null, 587);
        $this->assertFalse($this->stream($plain)->isTLS());
        $this->assertFalse($plain->isTlsRequired());
        $this->assertTrue($plain->isAutoTls());

        $this->assertTrue($this->stream($this->transportFor(null, 465))->isTLS());
    }

    private function transportFor(?string $encryption, int $port): EsmtpTransport
    {
        MailSetting::current()->update([
            'host' => 'smtp.example.com', 'port' => $port, 'encryption' => $encryption, 'from_address' => 'it@example.com',
        ]);
        app(MailConfigService::class)->apply();

        $transport = Mail::mailer('smtp')->getSymfonyTransport();
        $this->assertInstanceOf(EsmtpTransport::class, $transport);

        return $transport;
    }

    private function stream(EsmtpTransport $transport): SocketStream
    {
        $stream = $transport->getStream();
        $this->assertInstanceOf(SocketStream::class, $stream);

        return $stream;
    }
}
