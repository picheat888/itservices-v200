<?php

// Serves the built service worker (config webpush.service_worker_path) from the site root so it may control every page.

namespace App\Http\Controllers;

use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ServiceWorkerController extends Controller
{
    public function __invoke(): BinaryFileResponse
    {
        $path = (string) config('webpush.service_worker_path');

        abort_unless(is_file($path), 404);

        return response()->file($path, [
            'Content-Type' => 'application/javascript; charset=utf-8',
            'Service-Worker-Allowed' => '/',
            'Cache-Control' => 'no-cache, must-revalidate',
        ]);
    }
}
