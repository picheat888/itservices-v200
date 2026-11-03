<?php

// The monitor TV's own endpoints: ask for a pairing code, wait for it to be paired, read the board.

namespace App\Http\Controllers\Api\Monitor;

use App\Http\Controllers\Controller;
use App\Services\Monitor\MonitorBoardService;
use App\Services\Monitor\MonitorPairingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MonitorController extends Controller
{
    public function __construct(private readonly MonitorPairingService $pairing) {}

    public function requestCode(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->pairing->issueCode((string) $request->userAgent()), 'message' => 'success']);
    }

    public function pollPairing(string $pairingId): JsonResponse
    {
        return response()->json(['data' => $this->pairing->pollPairing($pairingId), 'message' => 'success']);
    }

    public function board(MonitorBoardService $board): JsonResponse
    {
        return response()->json(['data' => $board->board(), 'message' => 'success']);
    }
}
