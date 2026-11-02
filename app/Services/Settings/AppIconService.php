<?php

// Home-screen icons (iOS apple-touch-icon, Android manifest): the brand logo on the app's white background,
// because phones fill a transparent icon with black.

namespace App\Services\Settings;

use App\Models\Settings\AppSetting;
use Illuminate\Support\Facades\Storage;

class AppIconService
{
    /** The app's light background (--background in app.css). */
    public const BACKGROUND = '#ffffff';

    /** @var array<string, array{size: int, logo: float}> each icon's pixel size and the share of it the logo may fill */
    public const ICONS = [
        'apple-touch' => ['size' => 180, 'logo' => 0.72],
        'any-192' => ['size' => 192, 'logo' => 0.72],
        'any-512' => ['size' => 512, 'logo' => 0.72],
        // Android crops maskable icons to a circle 80% wide; a square logo fits inside it at 56%
        'maskable-512' => ['size' => 512, 'logo' => 0.56],
    ];

    /** Bump to make phones fetch icons again after the drawing changes. */
    private const REVISION = 1;

    public function url(string $name): string
    {
        return "/app-icons/{$name}.png?v=".$this->version();
    }

    /** @return list<array{src: string, sizes: string, type: string, purpose: string}> */
    public function manifestIcons(): array
    {
        return array_map(fn (string $name) => [
            'src' => $this->url($name),
            'sizes' => self::ICONS[$name]['size'].'x'.self::ICONS[$name]['size'],
            'type' => 'image/png',
            'purpose' => str_starts_with($name, 'maskable') ? 'maskable' : 'any',
        ], ['any-192', 'any-512', 'maskable-512']);
    }

    /** PNG bytes of one icon. */
    public function render(string $name): string
    {
        ['size' => $size, 'logo' => $share] = self::ICONS[$name];

        $canvas = imagecreatetruecolor($size, $size);
        [$red, $green, $blue] = sscanf(self::BACKGROUND, '#%02x%02x%02x');
        imagefill($canvas, 0, 0, imagecolorallocate($canvas, $red, $green, $blue));
        imagealphablending($canvas, true);

        $logo = imagecreatefrompng($this->logoPath());
        $logoWidth = imagesx($logo);
        $logoHeight = imagesy($logo);
        $scale = ($size * $share) / max($logoWidth, $logoHeight);
        $width = (int) round($logoWidth * $scale);
        $height = (int) round($logoHeight * $scale);

        imagecopyresampled($canvas, $logo, intdiv($size - $width, 2), intdiv($size - $height, 2), 0, 0, $width, $height, $logoWidth, $logoHeight);

        ob_start();
        imagepng($canvas);

        return (string) ob_get_clean();
    }

    /** Changes whenever the logo does, so the icon links change with it. */
    private function version(): string
    {
        return substr(md5((AppSetting::brand()['logo_url'] ?? 'default').'|'.self::REVISION), 0, 8);
    }

    /** The uploaded logo, or the bundled one when none is uploaded or its file is gone. */
    private function logoPath(): string
    {
        $uploaded = AppSetting::get('logo_path');
        if ($uploaded && Storage::disk('public')->exists($uploaded)) {
            return Storage::disk('public')->path($uploaded);
        }

        return public_path('logo.png');
    }
}
