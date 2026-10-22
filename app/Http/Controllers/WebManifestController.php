<?php

// The web app manifest (name and icon from Settings → Branding) that lets the app be added to a home screen.

namespace App\Http\Controllers;

use App\Models\Settings\AppSetting;
use Illuminate\Http\JsonResponse;

class WebManifestController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $brand = AppSetting::brand();
        $icon = $brand['logo_url']
            ? ['src' => $brand['logo_url'], 'sizes' => 'any']
            : ['src' => '/logo.png', 'sizes' => '512x512', 'type' => 'image/png'];

        return response()->json([
            'name' => $brand['name'],
            'short_name' => $brand['name'],
            'start_url' => '/',
            'display' => 'standalone',
            'icons' => [$icon],
        ], 200, ['Content-Type' => 'application/manifest+json'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
