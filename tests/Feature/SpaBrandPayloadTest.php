<?php

namespace Tests\Feature;

use App\Models\Settings\AppSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The brand the SERVER hands to the page.
 *
 * The SPA used to start from VITE_APP_NAME — a value baked into the JS bundle at
 * build time — and correct itself once /api/settings answered. That is a build
 * artefact pretending to be a setting: changing the brand in Settings did nothing
 * to it until somebody ran a build, and every reload showed the stale one for the
 * length of a round-trip. The server knows the real brand; it says so in the HTML.
 */
class SpaBrandPayloadTest extends TestCase
{
    use RefreshDatabase;

    /** The JSON the page embeds for the store to start from. */
    private function payload(string $url = '/login'): array
    {
        $html = $this->get($url)->assertOk()->getContent();
        $this->assertMatchesRegularExpression('/<script id="brand"[^>]*>(.*?)<\/script>/s', $html);
        preg_match('/<script id="brand"[^>]*>(.*?)<\/script>/s', $html, $m);

        return json_decode(html_entity_decode($m[1]), true);
    }

    public function test_the_page_carries_the_brand_from_settings(): void
    {
        AppSetting::put('brand_name', 'Inaba Service Desk');
        AppSetting::put('brand_sub', 'IT Helpdesk');

        $this->assertSame([
            'name' => 'Inaba Service Desk',
            'sub' => 'IT Helpdesk',
            'logo_url' => null,
        ], $this->payload());
    }

    public function test_an_unset_brand_falls_back_the_way_the_api_does(): void
    {
        config(['app.name' => 'Fallback Name']);
        AppSetting::put('brand_name', '');

        $brand = $this->payload();
        $fromApi = $this->getJson('/api/settings')->assertOk()->json('data');

        $this->assertSame('Fallback Name', $brand['name']);
        $this->assertSame($fromApi['brand_name'], $brand['name'], 'the page and the API agree');
        $this->assertSame($fromApi['brand_sub'], $brand['sub']);
    }

    public function test_an_uploaded_logo_travels_with_the_page(): void
    {
        AppSetting::put('logo_path', 'branding/logo.png');

        $brand = $this->payload();

        $this->assertNotNull($brand['logo_url']);
        $this->assertStringContainsString('branding/logo.png', $brand['logo_url']);
        // …and the tab icon points at it, instead of the placeholder being swapped
        // out by JavaScript a moment later.
        $this->get('/login')->assertSee($brand['logo_url'], false);
    }

    public function test_without_a_logo_the_default_icon_is_served(): void
    {
        $this->assertNull($this->payload()['logo_url']);
        $this->get('/login')->assertSee('logo.svg', false);
    }

    /**
     * A brand name is typed by an administrator, so it is untrusted text sitting
     * inside a <script> block — the one place where the usual HTML escaping does
     * not save you.
     */
    public function test_a_brand_name_cannot_break_out_of_the_script_block(): void
    {
        AppSetting::put('brand_name', '</script><script>alert(1)</script>');

        $html = $this->get('/login')->assertOk()->getContent();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $html);
        $this->assertSame('</script><script>alert(1)</script>', $this->payload()['name']);
    }

    /** The shell has to render before the database can answer — see SpaTitleTest. */
    public function test_the_payload_still_renders_when_settings_cannot_be_read(): void
    {
        config(['app.name' => 'Fallback Name']);
        Schema::drop('app_settings');

        $this->assertSame([
            'name' => 'Fallback Name',
            'sub' => 'Service Desk',
            'logo_url' => null,
        ], $this->payload());
    }
}
