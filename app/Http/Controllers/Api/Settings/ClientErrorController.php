<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\StoreClientErrorRequest;
use App\Services\Settings\ClientErrorLogService;
use Illuminate\Http\JsonResponse;

// Receives browser errors from the SPA (logs/frontend).
class ClientErrorController extends Controller
{
    public function store(StoreClientErrorRequest $request, ClientErrorLogService $service): JsonResponse
    {
        $service->record($request->validated(), $request->user('sanctum')?->id, $request->userAgent());

        return response()->json(['message' => 'success'], 202);
    }
}
