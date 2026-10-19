<?php

// What one Blade error page shows: code, tone, both languages' words, buttons, reference, brand and accent.
// Read by the errors.layout view composer; settings reads survive a database that cannot answer.

namespace App\Support;

use App\Models\Settings\AppSetting;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Context;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class ErrorPage
{
    /** Languages the page ships, the first one is the fallback. */
    private const LANGUAGES = ['th', 'en'];

    /** Codes that are not "info": red for a failure, amber for a wait. */
    private const TONES = [500 => 'danger', 419 => 'wait', 429 => 'wait'];

    /**
     * @return array{
     *     code: int,
     *     tone: 'danger'|'wait'|'info',
     *     lang: 'th'|'en',
     *     texts: array{th: array{title: string, body: string}, en: array{title: string, body: string}},
     *     actions: list<array{label: array{th: string, en: string}, href: string, primary: bool}>,
     *     reference: ?string,
     *     brand: array{name: string, logo_url: ?string},
     *     accent: string,
     *     accentForeground: string
     * }
     */
    public static function for(int $code, Request $request, ?Throwable $exception = null): array
    {
        $brand = AppSetting::brand();
        $accent = self::accent();

        return [
            'code' => $code,
            'tone' => self::TONES[$code] ?? 'info',
            'lang' => $request->getPreferredLanguage(self::LANGUAGES) === 'en' ? 'en' : 'th',
            'texts' => [
                'th' => self::texts($code, $exception, 'th'),
                'en' => self::texts($code, $exception, 'en'),
            ],
            'actions' => self::actions($code, $request),
            'reference' => $code === 500 ? self::reference() : null,
            'brand' => ['name' => $brand['name'], 'logo_url' => $brand['logo_url'] ?? '/logo.svg'],
            'accent' => $accent,
            'accentForeground' => self::accentForeground($accent),
        ];
    }

    /** Text colour on an accent-coloured surface: white or near-black, whichever reads better (as brandForeground). */
    public static function accentForeground(string $hex): string
    {
        $rgb = self::rgb($hex);
        if ($rgb === null) {
            return '#ffffff';
        }

        return self::contrast($rgb, [255, 255, 255]) >= self::contrast($rgb, [15, 23, 42]) ? '#ffffff' : '#0f172a';
    }

    /** @return array{title: string, body: string} */
    private static function texts(int $code, ?Throwable $exception, string $lang): array
    {
        $minutes = $code === 503 ? self::minutesToWait($exception) : null;

        $body = match (true) {
            $minutes !== null => trans_choice('errors.503.body', $minutes, ['minutes' => $minutes], $lang),
            $code === 503 => __('errors.503.body_later', [], $lang),
            default => __("errors.{$code}.body", [], $lang),
        };

        return ['title' => __("errors.{$code}.title", [], $lang), 'body' => $body];
    }

    /** @return list<array{label: array{th: string, en: string}, href: string, primary: bool}> */
    private static function actions(int $code, Request $request): array
    {
        // Leading slashes collapsed so the address can never turn into another host (//host/...)
        $here = '/'.ltrim($request->getRequestUri(), '/');

        $signIn = ['label' => self::label('sign_in'), 'href' => '/login?next='.rawurlencode($here), 'primary' => true];
        $reload = ['label' => self::label('reload'), 'href' => $here, 'primary' => true];
        $dashboard = ['label' => self::label('dashboard'), 'href' => '/', 'primary' => true];

        return match ($code) {
            401 => [$signIn],
            419, 429, 503 => [$reload],
            500 => [$reload, [...$dashboard, 'primary' => false]],
            default => [$dashboard],
        };
    }

    /** @return array{th: string, en: string} */
    private static function label(string $action): array
    {
        return [
            'th' => __("errors.actions.{$action}", [], 'th'),
            'en' => __("errors.actions.{$action}", [], 'en'),
        ];
    }

    /** Whole minutes from the Retry-After seconds, or null when there is none. */
    private static function minutesToWait(?Throwable $exception): ?int
    {
        if (! $exception instanceof HttpExceptionInterface) {
            return null;
        }

        $headers = array_change_key_case($exception->getHeaders(), CASE_LOWER);
        $seconds = $headers['retry-after'] ?? null;

        if (! is_numeric($seconds) || (int) $seconds <= 0) {
            return null;
        }

        return (int) ceil((int) $seconds / 60);
    }

    /** The failing request's id (AssignRequestId), the same one its log lines carry. */
    private static function reference(): ?string
    {
        $requestId = Context::get('request_id');

        return is_string($requestId) && $requestId !== '' ? $requestId : null;
    }

    private static function accent(): string
    {
        try {
            $accent = (string) AppSetting::get('theme_accent', '');
        } catch (QueryException) {
            return CompanyProfile::DEFAULT_ACCENT;
        }

        return preg_match('/^#[0-9a-f]{6}$/i', $accent) ? strtolower($accent) : CompanyProfile::DEFAULT_ACCENT;
    }

    /** @return array{int, int, int}|null */
    private static function rgb(string $hex): ?array
    {
        if (! preg_match('/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i', $hex, $parts)) {
            return null;
        }

        return [hexdec($parts[1]), hexdec($parts[2]), hexdec($parts[3])];
    }

    /**
     * WCAG contrast ratio between two opaque colours (1–21).
     *
     * @param  array{int, int, int}  $first
     * @param  array{int, int, int}  $second
     */
    private static function contrast(array $first, array $second): float
    {
        $lighter = max(self::luminance($first), self::luminance($second));
        $darker = min(self::luminance($first), self::luminance($second));

        return ($lighter + 0.05) / ($darker + 0.05);
    }

    /** @param  array{int, int, int}  $rgb */
    private static function luminance(array $rgb): float
    {
        [$red, $green, $blue] = array_map(function (int $channel): float {
            $value = $channel / 255;

            return $value <= 0.03928 ? $value / 12.92 : (($value + 0.055) / 1.055) ** 2.4;
        }, $rgb);

        return 0.2126 * $red + 0.7152 * $green + 0.0722 * $blue;
    }
}
