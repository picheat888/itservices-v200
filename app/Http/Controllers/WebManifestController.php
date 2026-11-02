<?php

// The web app manifest (name and icon from Settings → Branding) that lets the app be added to a home screen.

namespace App\Http\Controllers;

use App\Models\Settings\AppSetting;
use App\Services\Settings\AppIconService;
use Illuminate\Http\JsonResponse;

class WebManifestController extends Controller
{
    public function __invoke(AppIconService $icons): JsonResponse
    {
        $brand = AppSetting::brand();

        return response()->json([
            'name' => $brand['name'],
            'short_name' => $brand['name'],
            'start_url' => '/',
            'display' => 'standalone',
            'background_color' => AppIconService::BACKGROUND,
            'icons' => $icons->manifestIcons(),
        ], 200, ['Content-Type' => 'application/manifest+json'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
