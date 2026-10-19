<?php

// Settings → Security network names: the IP ranges an admin has named, used as the sign-in location.

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\NetworkNameRequest;
use App\Http\Resources\Auth\NetworkNameResource;
use App\Models\AuditLog;
use App\Models\Auth\NetworkName;
use App\Services\Auth\LocationResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

class NetworkNameController extends Controller
{
    public function index(): JsonResponse
    {
        $networks = NetworkName::query()->orderBy('name')->orderBy('id')->get();

        return response()->json([
            'data' => NetworkNameResource::collection($networks),
            'meta' => ['total' => $networks->count()],
        ]);
    }

    public function store(NetworkNameRequest $request): JsonResponse
    {
        $network = NetworkName::create($request->validated());
        $this->forgetResolverCache();
        AuditLog::record('Created network name', $network->name, ['cidr' => $network->cidr], $network);

        return (new NetworkNameResource($network))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function update(NetworkNameRequest $request, NetworkName $networkName): JsonResponse
    {
        $before = $networkName->getOriginal();
        $networkName->update($request->validated());
        $this->forgetResolverCache();
        AuditLog::record('Updated network name', $networkName->name, AuditLog::changes($before, $networkName), $networkName);

        return (new NetworkNameResource($networkName))->additional(['message' => 'success'])->response();
    }

    public function destroy(NetworkName $networkName): JsonResponse
    {
        AuditLog::recordDeleted('Deleted network name', $networkName->name, $networkName);
        $networkName->delete();
        $this->forgetResolverCache();

        return response()->json(['message' => 'success']);
    }

    /** The location resolver keeps the list for a minute; a write must show at once. */
    private function forgetResolverCache(): void
    {
        Cache::forget(LocationResolver::CACHE_KEY);
    }
}
