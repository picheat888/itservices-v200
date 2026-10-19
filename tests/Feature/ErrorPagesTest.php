<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

// Blade error pages: one language (the reader's), the code kept, buttons that fit the code.
class ErrorPagesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.debug' => false]);

        // Under /files so the SPA catch-all leaves it alone; ?retry_after= becomes the Retry-After header
        Route::get('/files/__test-error/{code}', function (Request $request, int $code) {
            $headers = $request->has('retry_after') ? ['Retry-After' => $request->query('retry_after')] : [];

            abort($code, '', $headers);
        });
    }

    /** @return array<string, array{int, string}> */
    public static function codes(): array
    {
        return [
            'unauthorized' => [401, 'กรุณาเข้าสู่ระบบ'],
            'forbidden' => [403, 'ไม่มีสิทธิ์เข้าถึง'],
            'not found' => [404, 'ไม่พบหน้านี้'],
            'page expired' => [419, 'หน้านี้หมดอายุ'],
            'too many requests' => [429, 'ใช้งานถี่เกินไป'],
            'server error' => [500, 'เซิร์ฟเวอร์ขัดข้อง'],
            'maintenance' => [503, 'ปิดปรับปรุงชั่วคราว'],
        ];
    }

    #[DataProvider('codes')]
    public function test_each_code_shows_its_thai_title_and_code_by_default(int $code, string $thaiTitle): void
    {
        // Neither Thai nor English asked for (the test client sends en-us unless told otherwise)
        $response = $this->withHeaders(['Accept-Language' => 'ja-JP,ja;q=0.9'])->get("/files/__test-error/{$code}");

        $response->assertStatus($code);
        $response->assertSee('<html lang="th"', false);
        $response->assertSee((string) $code);
        $response->assertSee($thaiTitle);
        $response->assertSee('data-lang="en" lang="en" hidden', false);
    }

    public function test_an_english_reader_gets_english_words(): void
    {
        $response = $this->withHeaders(['Accept-Language' => 'en-US,en;q=0.9'])->get('/files/__test-error/404');

        $response->assertStatus(404);
        $response->assertSee('<html lang="en"', false);
        $response->assertSee('Not Found');
        $response->assertSee("The page you are looking for doesn't exist or has been moved.");
        $response->assertSee('data-lang="th" lang="th" hidden', false);
    }

    public function test_500_shows_the_request_reference(): void
    {
        $response = $this->get('/files/__test-error/500');

        $reference = (string) $response->headers->get('X-Request-Id');

        $response->assertStatus(500);
        $this->assertNotSame('', $reference);
        $response->assertSee($reference);
        $response->assertSee('รหัสอ้างอิง');
    }

    public function test_401_sign_in_returns_to_this_address(): void
    {
        $response = $this->get('/files/__test-error/401');

        $response->assertStatus(401);
        $response->assertSee('href="/login?next=%2Ffiles%2F__test-error%2F401"', false);
    }

    /** @return array<string, array{int, list<array{string, string, string, string}>}> */
    public static function buttons(): array
    {
        $dashboard = fn (string $style = 'primary'): array => ['/', 'กลับหน้า Dashboard', 'Back to Dashboard', $style];
        $reload = fn (int $code): array => ["/files/__test-error/{$code}", 'โหลดหน้าใหม่', 'Reload', 'primary'];

        return [
            'unauthorized' => [401, [['/login?next=%2Ffiles%2F__test-error%2F401', 'เข้าสู่ระบบ', 'Sign in', 'primary']]],
            'forbidden' => [403, [$dashboard()]],
            'not found' => [404, [$dashboard()]],
            'page expired' => [419, [$reload(419)]],
            'too many requests' => [429, [$reload(429)]],
            'server error' => [500, [$reload(500), $dashboard('ghost')]],
            'maintenance' => [503, [$reload(503)]],
        ];
    }

    /** @param  list<array{string, string, string, string}>  $buttons  href, Thai label, English label, style */
    #[DataProvider('buttons')]
    public function test_each_code_offers_the_buttons_that_fit_it(int $code, array $buttons): void
    {
        $response = $this->get("/files/__test-error/{$code}");

        $response->assertStatus($code);
        // The same buttons once per language block, nothing else
        $this->assertSame(count($buttons) * 2, substr_count((string) $response->getContent(), 'class="button '));
        foreach ($buttons as [$href, $thai, $english, $style]) {
            $response->assertSee("<a href=\"{$href}\" class=\"button {$style}\">{$thai}</a>", false);
            $response->assertSee("<a href=\"{$href}\" class=\"button {$style}\">{$english}</a>", false);
        }
    }

    public function test_503_says_minutes_from_retry_after(): void
    {
        $response = $this->get('/files/__test-error/503?retry_after=120');

        $response->assertStatus(503);
        $response->assertSee('ประมาณ 2 นาที');
        $response->assertSee('about 2 minutes');
    }

    public function test_503_without_retry_after_says_later(): void
    {
        $response = $this->get('/files/__test-error/503');

        $response->assertStatus(503);
        $response->assertSee('กรุณากลับมาใหม่อีกครั้งภายหลัง');
        $response->assertDontSee('ประมาณ');
    }

    public function test_the_page_renders_when_settings_cannot_be_read(): void
    {
        config(['app.name' => 'Fallback Desk']);
        Schema::drop('app_settings');

        $response = $this->get('/files/__test-error/404');

        $response->assertStatus(404);
        $response->assertSee('Fallback Desk');
        $response->assertSee('ไม่พบหน้านี้');
    }

    // An unknown path outside the excluded prefixes goes to the SPA (React shows its own 404)
    public function test_unknown_spa_path_falls_through_to_react(): void
    {
        $response = $this->get('/some-frontend-page-'.uniqid());

        $response->assertStatus(200);
    }

    // A path under an excluded prefix with no route gets the Blade 404
    public function test_custom_404_page_is_rendered(): void
    {
        $response = $this->get('/build/missing-asset-'.uniqid());

        $response->assertStatus(404);
        $response->assertSee('404', false);
        $response->assertSee('ไม่พบหน้านี้', false);
    }

    // A thrown exception with debug off gets the Blade 500
    public function test_custom_500_page_is_rendered_when_debug_disabled(): void
    {
        Route::get('/build/__boom', function () {
            throw new \RuntimeException('boom');
        });

        $response = $this->get('/build/__boom');

        $response->assertStatus(500);
        $response->assertSee('500', false);
        $response->assertSee('เซิร์ฟเวอร์ขัดข้อง', false);
    }

    // Every view renders as a full page with no exception passed in
    public function test_all_custom_error_views_render(): void
    {
        foreach (['401', '403', '404', '419', '429', '500', '503'] as $code) {
            $html = view("errors.{$code}")->render();

            $this->assertStringContainsString('<!DOCTYPE html>', $html);
            $this->assertStringContainsString($code, $html);
        }
    }
}
