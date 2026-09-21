<?php

namespace Tests\Feature;

use App\Models\Settings\AppSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The tab title the SERVER puts in the HTML.
 *
 * React overwrites it a moment later from the same brand name, but that moment is a
 * network round-trip long — so the page was arriving with APP_NAME in the tab and
 * changing under the reader on every reload. The server knows the brand too; it
 * should say the same thing the SPA is about to.
 */
class SpaTitleTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_served_page_carries_the_brand_name_from_settings(): void
    {
        AppSetting::put('brand_name', 'Inaba Service Desk');

        $this->get('/login')
            ->assertOk()
            ->assertSee('<title>Inaba Service Desk</title>', false);
    }

    /** Branding is optional; an install that never filled it in keeps APP_NAME. */
    public function test_an_unset_brand_name_falls_back_to_the_app_name(): void
    {
        config(['app.name' => 'Fallback Name']);
        AppSetting::put('brand_name', '');

        $this->get('/login')
            ->assertOk()
            ->assertSee('<title>Fallback Name</title>', false);
    }

    /** The same fallback the settings API answers with — one rule, not two copies. */
    public function test_the_api_and_the_page_agree_on_the_brand(): void
    {
        AppSetting::put('brand_name', 'Inaba Service Desk');

        $fromApi = $this->getJson('/api/settings')->assertOk()->json('data.brand_name');

        $this->get('/login')->assertSee("<title>{$fromApi}</title>", false);
    }

    /**
     * The shell must render before the database can answer.
     *
     * A freshly deployed install serves pages before `migrate` has run, and the login
     * screen is the one page that has to come up so somebody can get in and fix it.
     * Reading the brand from the database turned that window into a 500 on every URL.
     */
    public function test_the_page_still_renders_when_settings_cannot_be_read(): void
    {
        config(['app.name' => 'Fallback Name']);
        Schema::drop('app_settings');

        $this->get('/login')
            ->assertOk()
            ->assertSee('<title>Fallback Name</title>', false);
    }

    /** A brand name with characters HTML cares about must not break the document. */
    public function test_the_brand_name_is_escaped(): void
    {
        AppSetting::put('brand_name', 'A & B <script>');

        $this->get('/login')
            ->assertOk()
            ->assertDontSee('<script>', false);
    }
}
