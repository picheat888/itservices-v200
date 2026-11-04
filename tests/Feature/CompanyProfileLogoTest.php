<?php

// The logo on printed documents: the uploaded one, else the bundled public/logo.png (as emails and app icons use).

namespace Tests\Feature;

use App\Models\Settings\AppSetting;
use App\Support\CompanyProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CompanyProfileLogoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        AppSetting::flushCache();
    }

    private function bundledLogo(): string
    {
        return 'data:image/png;base64,'.base64_encode((string) file_get_contents(public_path('logo.png')));
    }

    public function test_no_uploaded_logo_uses_the_bundled_logo(): void
    {
        Storage::fake('public');

        $this->assertSame($this->bundledLogo(), CompanyProfile::get()['logo']);
    }

    public function test_an_uploaded_logo_is_used(): void
    {
        Storage::fake('public');
        $logo = imagecreatetruecolor(10, 10);
        ob_start();
        imagepng($logo);
        $bytes = (string) ob_get_clean();
        Storage::disk('public')->put('branding/logo.png', $bytes);
        AppSetting::put('logo_path', 'branding/logo.png');
        AppSetting::flushCache();

        $this->assertSame('data:image/png;base64,'.base64_encode($bytes), CompanyProfile::get()['logo']);
    }

    public function test_a_missing_uploaded_file_falls_back_to_the_bundled_logo(): void
    {
        Storage::fake('public');
        AppSetting::put('logo_path', 'branding/gone.png');
        AppSetting::flushCache();

        $this->assertSame($this->bundledLogo(), CompanyProfile::get()['logo']);
    }

    public function test_the_pdf_letterhead_shows_the_bundled_logo(): void
    {
        Storage::fake('public');

        $html = view('pdf.partials.letterhead', ['company' => CompanyProfile::get(), 'title' => 'Report', 'lines' => []])->render();

        $this->assertStringContainsString('<img src="'.$this->bundledLogo().'"', $html);
    }
}
