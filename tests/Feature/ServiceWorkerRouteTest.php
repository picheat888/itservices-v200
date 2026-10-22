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
        $path = tempnam(sys_get_temp_dir(), 'sw');
        file_put_contents($path, '// test service worker');
        config(['webpush.service_worker_path' => $path]);

        try {
            $response = $this->get('/sw.js');

            $response->assertOk();
            $this->assertSame('// test service worker', $response->streamedContent());
            $response->assertHeader('Service-Worker-Allowed', '/');
            $this->assertStringContainsString('application/javascript', (string) $response->headers->get('Content-Type'));
            $this->assertStringContainsString('no-cache', (string) $response->headers->get('Cache-Control'));
        } finally {
            @unlink($path);
        }
    }

    public function test_service_worker_is_404_when_not_built(): void
    {
        config(['webpush.service_worker_path' => sys_get_temp_dir().'/itsd-missing-'.uniqid().'/sw.js']);

        $this->get('/sw.js')->assertNotFound();
    }

    public function test_service_worker_is_read_from_storage_by_default(): void
    {
        $this->assertSame(storage_path('app/sw/sw.js'), config('webpush.service_worker_path'));
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
