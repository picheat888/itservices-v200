<?php

// Settings → จอ Monitor: the paired TV's status, pairing a TV by its code and unpairing it.

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\PairMonitorRequest;
use App\Services\Monitor\MonitorPairingService;
use Illuminate\Http\JsonResponse;

class MonitorDeviceController extends Controller
{
    public function __construct(private readonly MonitorPairingService $pairing) {}

    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->pairing->status(), 'message' => 'success']);
    }

    public function pair(PairMonitorRequest $request): JsonResponse
    {
        return response()->json(['data' => $this->pairing->pair($request->validated('code'), $request->user()), 'message' => 'success']);
    }

    public function destroy(): JsonResponse
    {
        $this->pairing->unpair();

        return response()->json(['data' => $this->pairing->status(), 'message' => 'success']);
    }
}
