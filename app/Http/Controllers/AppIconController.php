<?php

// Home-screen icons for phones and tablets (the logo on a white background), linked from the page and the manifest.

namespace App\Http\Controllers;

use App\Services\Settings\AppIconService;
use Illuminate\Http\Response;

class AppIconController extends Controller
{
    public function __invoke(string $name, AppIconService $icons): Response
    {
        return response($icons->render($name), 200, [
            'Content-Type' => 'image/png',
            'Cache-Control' => 'public, max-age=604800',
        ]);
    }
}
