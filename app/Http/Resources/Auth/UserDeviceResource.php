<?php

// One signed-in device as the device-limit dialog and the profile list show it.

namespace App\Http\Resources\Auth;

use App\Models\Auth\UserDevice;
use App\Services\Auth\DeviceService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin UserDevice */
class UserDeviceResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'os' => $this->os,
            'browser' => $this->browser,
            'ip' => $this->ip,
            'location' => $this->location,
            'signed_in_at' => $this->signed_in_at?->toIso8601String(),
            'last_active_at' => $this->last_active_at?->toIso8601String(),
            'remembered' => $this->remember_expires_at !== null,
            'remember_expires_at' => $this->remember_expires_at?->toIso8601String(),
            'current' => $this->isCurrent($request),
        ];
    }

    private function isCurrent(Request $request): bool
    {
        $currentId = $request->hasSession() ? $request->session()->get(DeviceService::SESSION_KEY) : null;

        return $currentId !== null && (int) $currentId === $this->id;
    }
}
