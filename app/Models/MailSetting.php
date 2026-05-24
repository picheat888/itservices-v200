<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Singleton (id=1) holding the SMTP credentials the admin edits in
 * Settings → Email. Password is encrypted at rest.
 */
class MailSetting extends Model
{
    protected $fillable = [
        'host', 'port', 'username', 'password', 'encryption', 'from_address', 'from_name',
    ];

    protected function casts(): array
    {
        return [
            'port'     => 'integer',
            'password' => 'encrypted',
        ];
    }

    /** Returns the single settings row, creating it if missing. */
    public static function current(): self
    {
        return static::query()->firstOrCreate(['id' => 1]);
    }

    /** True when enough is configured to attempt an SMTP send. */
    public function isConfigured(): bool
    {
        return ! empty($this->host) && ! empty($this->from_address);
    }
}
