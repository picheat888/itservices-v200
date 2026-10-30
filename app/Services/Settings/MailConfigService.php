<?php

namespace App\Services\Settings;

use App\Models\Settings\MailSetting;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;

/** Puts the SMTP settings from mail_settings onto config('mail.*') before each send; .env is the fallback. */
class MailConfigService
{
    /** Seconds an SMTP connection may sit silent before the send fails, so the worker never hangs. */
    public const SMTP_TIMEOUT_SECONDS = 30;

    /** Overrides config('mail.*') from mail_settings when configured. */
    public function apply(): void
    {
        // Applies to the .env fallback as well, so no send can hang the worker.
        Config::set('mail.mailers.smtp.timeout', self::SMTP_TIMEOUT_SECONDS);

        $settings = MailSetting::current();

        if (! $settings->isConfigured()) {
            Mail::purge(config('mail.default'));

            return; // leave .env fallback in place
        }

        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp.host', $settings->host);
        Config::set('mail.mailers.smtp.port', $settings->port ?? 587);
        Config::set('mail.mailers.smtp.username', $settings->username ?: null);
        Config::set('mail.mailers.smtp.password', $settings->password ?: null);
        Config::set('mail.mailers.smtp.encryption', $settings->encryption ?: null);
        // Laravel reads the scheme and STARTTLS options, not "encryption": SSL connects encrypted, TLS insists on STARTTLS
        Config::set('mail.mailers.smtp.scheme', match ($settings->encryption) {
            'ssl' => 'smtps',
            'tls' => 'smtp',
            default => null,
        });
        Config::set('mail.mailers.smtp.require_tls', $settings->encryption === 'tls');
        Config::set('mail.from.address', $settings->from_address);
        Config::set('mail.from.name', $settings->from_name ?: config('app.name'));
        // A worker keeps built mailers; rebuild from the config just set
        Mail::purge(config('mail.default'));
    }
}
