<?php

namespace App\Models\Settings;

use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    protected $fillable = ['key', 'value'];

    public static function get(string $key, ?string $default = null): ?string
    {
        return static::query()->where('key', $key)->value('value') ?? $default;
    }

    public static function put(string $key, ?string $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value]);
    }

    /**
     * Display symbol for the configured currency (Settings -> Company).
     * Falls back to the raw code for any currency without a known symbol.
     */
    public static function currencySymbol(): string
    {
        $code = static::get('currency', 'THB');

        return ['THB' => '฿', 'USD' => '$'][$code] ?? (string) $code;
    }

    /**
     * The system display timezone (Settings -> Company). The DB stores UTC;
     * anything user-facing (resources, PDFs, emails) converts through this.
     * Guards against an invalid saved identifier so date formatting never throws.
     */
    public static function timezone(): string
    {
        $tz = static::get('timezone', 'Asia/Bangkok') ?: 'Asia/Bangkok';

        return in_array($tz, timezone_identifiers_list(), true) ? $tz : 'Asia/Bangkok';
    }
}
