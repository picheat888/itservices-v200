<?php

namespace App\Models;

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
}
