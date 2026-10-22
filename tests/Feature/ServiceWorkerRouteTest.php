<?php

// The service worker script and the web app manifest are served from the site root.

namespace Tests\Feature;

use App\Models\Settings\AppSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ServiceWorkerRouteTest extends TestCase
{
    use RefreshDatabase;

    public function test_service_worker_is_served_from_the_root_with_no_cache(): void
    {
        $path = public_path('build/sw.js');
        $created = ! file_exists($path);
        if ($created) {
            @mkdir(dirname($path), 0755, true);
            file_put_contents($path, '// test service worker');
        }

        try {
            $response = $this->get('/sw.js');

            $response->assertOk();
            $response->assertHeader('Service-Worker-Allowed', '/');
            $this->assertStringContainsString('application/javascript', (string) $response->headers->get('Content-Type'));
            $this->assertStringContainsString('no-cache', (string) $response->headers->get('Cache-Control'));
        } finally {
            if ($created) {
                @unlink($path);
            }
        }
    }

    public function test_manifest_names_the_brand(): void
    {
        AppSetting::put('brand_name', 'INA Tech');
        AppSetting::flushCache();

        $response = $this->get('/manifest.webmanifest');

        $response->assertOk();
        $response->assertJsonPath('name', 'INA Tech');
        $response->assertJsonPath('short_name', 'INA Tech');
        $response->assertJsonPath('display', 'standalone');
        $response->assertJsonPath('start_url', '/');
        $response->assertJsonPath('icons.0.src', '/logo.png');
    }
}
