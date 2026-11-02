<?php

// Home-screen icons: the logo on an opaque white background (phones turn transparency black), linked from the page and manifest.

namespace Tests\Feature;

use App\Models\Settings\AppSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AppIconTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string, int}> */
    public static function icons(): array
    {
        return [
            'apple touch' => ['apple-touch', 180],
            'android 192' => ['any-192', 192],
            'android 512' => ['any-512', 512],
            'android maskable' => ['maskable-512', 512],
        ];
    }

    #[DataProvider('icons')]
    public function test_each_icon_is_a_square_png_with_an_opaque_white_background(string $name, int $size): void
    {
        $response = $this->get("/app-icons/{$name}.png");

        $response->assertOk();
        $response->assertHeader('Content-Type', 'image/png');
        $image = imagecreatefromstring($response->getContent());
        $this->assertSame([$size, $size], [imagesx($image), imagesy($image)]);
        $this->assertSame(['red' => 255, 'green' => 255, 'blue' => 255, 'alpha' => 0], imagecolorsforindex($image, imagecolorat($image, 0, 0)));
    }

    public function test_the_uploaded_logo_is_drawn_in_the_middle(): void
    {
        Storage::fake('public');
        $logo = imagecreatetruecolor(100, 100);
        imagefill($logo, 0, 0, imagecolorallocate($logo, 200, 0, 0));
        ob_start();
        imagepng($logo);
        Storage::disk('public')->put('branding/logo.png', (string) ob_get_clean());
        AppSetting::put('logo_path', 'branding/logo.png');
        AppSetting::flushCache();

        $image = imagecreatefromstring($this->get('/app-icons/apple-touch.png')->getContent());

        $this->assertSame(['red' => 200, 'green' => 0, 'blue' => 0, 'alpha' => 0], imagecolorsforindex($image, imagecolorat($image, 90, 90)));
        $this->assertSame(255, imagecolorsforindex($image, imagecolorat($image, 5, 5))['red']);
    }

    public function test_a_missing_logo_file_falls_back_to_the_bundled_logo(): void
    {
        Storage::fake('public');
        AppSetting::put('logo_path', 'branding/gone.png');
        AppSetting::flushCache();

        $this->get('/app-icons/apple-touch.png')->assertOk()->assertHeader('Content-Type', 'image/png');
    }

    public function test_an_unknown_icon_name_is_not_found(): void
    {
        $this->get('/app-icons/huge.png')->assertNotFound();
    }

    public function test_the_page_and_manifest_link_the_icons_and_the_link_changes_with_the_logo(): void
    {
        $page = $this->get('/login')->assertOk()->getContent();
        $this->assertMatchesRegularExpression('#<link rel="apple-touch-icon" href="/app-icons/apple-touch\.png\?v=([0-9a-f]{8})">#', $page);
        preg_match('#apple-touch\.png\?v=([0-9a-f]{8})#', $page, $before);

        $manifest = $this->get('/manifest.webmanifest')->assertOk();
        $manifest->assertJsonPath('background_color', '#ffffff');
        $manifest->assertJsonPath('icons.0.sizes', '192x192');
        $manifest->assertJsonPath('icons.0.purpose', 'any');
        $manifest->assertJsonPath('icons.2.purpose', 'maskable');
        $this->assertStringStartsWith('/app-icons/maskable-512.png?v='.$before[1], $manifest->json('icons.2.src'));

        AppSetting::put('logo_path', 'branding/new.png');
        AppSetting::flushCache();

        $this->assertStringNotContainsString('v='.$before[1], $this->get('/login')->getContent());
    }
}
