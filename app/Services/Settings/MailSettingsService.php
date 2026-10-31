<?php

// The SMTP settings as the Settings page reads them (password never sent) and their save.

namespace App\Services\Settings;

use App\Models\AuditLog;
use App\Models\Settings\MailSetting;

class MailSettingsService
{
    /** @return array{host: mixed, port: mixed, username: mixed, has_password: bool, encryption: mixed, from_address: mixed, from_name: mixed} */
    public function payload(): array
    {
        $s = MailSetting::current();

        return [
            'host' => $s->host,
            'port' => $s->port,
            'username' => $s->username,
            'has_password' => ! empty($s->password),
            'encryption' => $s->encryption,
            'from_address' => $s->from_address,
            'from_name' => $s->from_name,
        ];
    }

    /**
     * A blank username means a relay that takes mail without signing in (no password kept); a blank password keeps the stored one.
     *
     * @param  array<string, mixed>  $data  validated by UpdateMailSettingsRequest
     */
    public function update(array $data): void
    {
        if (blank($data['username'] ?? null)) {
            $data['username'] = null;
            $data['password'] = null;
        } elseif (($data['password'] ?? '') === '') {
            unset($data['password']);
        }

        MailSetting::current()->update($data);
        AuditLog::record('Updated mail settings', 'SMTP');
    }
}
