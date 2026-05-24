<?php

namespace App\Services;

use App\Models\MailSetting;
use Illuminate\Support\Facades\Config;

/**
 * Applies the admin-managed SMTP credentials (mail_settings) onto the runtime
 * mail config before any send. Per CLAUDE.md, mail config lives in the database
 * and .env is only a fallback — so we override config('mail.*') at send time.
 */
class MailConfigService
{
    /** Overrides config('mail.*') from mail_settings when configured. */
    public function apply(): void
    {
        $settings = MailSetting::current();

        if (! $settings->isConfigured()) {
            return; // leave .env fallback in place
        }

        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp.host', $settings->host);
        Config::set('mail.mailers.smtp.port', $settings->port ?? 587);
        Config::set('mail.mailers.smtp.username', $settings->username ?: null);
        Config::set('mail.mailers.smtp.password', $settings->password ?: null);
        Config::set('mail.mailers.smtp.encryption', $settings->encryption ?: null);
        Config::set('mail.from.address', $settings->from_address);
        Config::set('mail.from.name', $settings->from_name ?: config('app.name'));
    }
}
