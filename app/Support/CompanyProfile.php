<?php

// The company facts every printed document carries (letterhead, footer, accent colour), read from Settings in one place.

namespace App\Support;

use App\Models\Settings\AppSetting;
use Illuminate\Support\Facades\Storage;

class CompanyProfile
{
    public const DEFAULT_ACCENT = '#2563eb';

    /**
     * What Settings saved, never a sample value: an empty field stays empty.
     *
     * @return array{name: string, legal_name: string, address: string, country: string, tax_id: string, currency: string, app_name: string, accent: string, logo: ?string}
     */
    public static function get(): array
    {
        $accent = (string) AppSetting::get('theme_accent', '');

        return [
            'name' => (string) AppSetting::get('company_name', ''),
            'legal_name' => (string) AppSetting::get('legal_name', ''),
            'address' => (string) AppSetting::get('address', ''),
            'country' => (string) AppSetting::get('country', ''),
            'tax_id' => (string) AppSetting::get('tax_id', ''),
            'currency' => (string) AppSetting::get('currency', 'THB'),
            'app_name' => AppSetting::get('brand_name') ?: (string) config('app.name', 'IT Service Desk'),
            'accent' => preg_match('/^#[0-9a-fA-F]{6}$/', $accent) ? $accent : self::DEFAULT_ACCENT,
            'logo' => self::logoDataUri(),
        ];
    }

    /** The name a document is issued under: the legal name, else the trading name, else the app name. */
    public static function issuer(array $profile): string
    {
        return $profile['legal_name'] ?: ($profile['name'] ?: $profile['app_name']);
    }

    /** The logo as a data URI, so dompdf needs no remote or chroot access. */
    private static function logoDataUri(): ?string
    {
        $path = AppSetting::get('logo_path');
        if (! $path || ! Storage::disk('public')->exists($path)) {
            return null;
        }

        return 'data:'.Storage::disk('public')->mimeType($path).';base64,'.base64_encode(Storage::disk('public')->get($path));
    }
}
