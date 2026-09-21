<?php

namespace App\Models\Settings;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Storage;

class AppSetting extends Model
{
    protected $fillable = ['key', 'value'];

    /**
     * The whole table, read once per request.
     *
     * Every screen reads settings a key at a time and each read used to be its own
     * SELECT — seventeen of them to build /api/settings alone. The table holds a few
     * dozen rows, so reading all of it once costs less than reading three of them
     * separately, and the difference lands on every request the app serves.
     *
     * Null means "not loaded yet", which is not the same as "loaded and empty".
     *
     * @var array<string, string|null>|null
     */
    private static ?array $cache = null;

    public static function get(string $key, ?string $default = null): ?string
    {
        self::$cache ??= static::query()->pluck('value', 'key')->all();

        // array_key_exists, not ??: a key stored as '' is a real answer — brand_name
        // sits empty until somebody fills it in, and it is the CALLER that decides
        // what an empty brand falls back to.
        return array_key_exists($key, self::$cache) ? self::$cache[$key] : $default;
    }

    public static function put(string $key, ?string $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value]);
        self::$cache = null;
    }

    /** Drops the cache — for tests, and for anything that writes the table directly. */
    public static function flushCache(): void
    {
        self::$cache = null;
    }

    /**
     * The name this installation goes by.
     *
     * Branding is optional, so an unfilled brand name falls back to APP_NAME. The
     * rule lives here because both the settings API and the server-rendered page
     * title answer with it, and two copies of a fallback drift.
     */
    public static function brandName(): string
    {
        return static::brand()['name'];
    }

    /**
     * Everything the page needs to put this installation's name and mark on screen.
     *
     * One method because all three answers are read in two places that must agree —
     * the settings API the SPA fetches, and the HTML the server renders before it.
     * The SPA used to start from VITE_APP_NAME instead, a value baked into the JS
     * bundle at build time, so changing the brand in Settings did nothing until
     * somebody ran a build and every reload showed the stale one for a moment.
     *
     * @return array{name: string, sub: string, logo_url: string|null}
     */
    public static function brand(): array
    {
        $fallbackName = (string) config('app.name', 'IT Services');

        try {
            $logoPath = static::get('logo_path');

            return [
                'name' => static::get('brand_name') ?: $fallbackName,
                'sub' => static::get('brand_sub', self::DEFAULT_BRAND_SUB) ?: self::DEFAULT_BRAND_SUB,
                'logo_url' => $logoPath ? Storage::disk('public')->url($logoPath) : null,
            ];
        } catch (QueryException) {
            // The page shell asks for this before anything else, including on an
            // install whose database is not migrated yet — and the login screen is
            // the one page that has to come up so somebody can get in and fix that.
            // Narrow on purpose: only the database being unable to answer is caught.
            return ['name' => $fallbackName, 'sub' => self::DEFAULT_BRAND_SUB, 'logo_url' => null];
        }
    }

    /** What sits under the brand name when nobody has written anything there. */
    public const DEFAULT_BRAND_SUB = 'Service Desk';

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
