<?php

// One row of the login log as the Login tab and the profile list show it; load user.employee with it.

namespace App\Http\Resources\Auth;

use App\Models\Auth\LoginEvent;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin LoginEvent */
class LoginEventResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'created_at' => $this->created_at?->toIso8601String(),
            'event' => $this->event->value,
            'reason' => $this->reason?->value,
            'remembered' => $this->remembered,
            'login_name' => $this->login_name,
            'user' => $this->user === null ? null : [
                'id' => $this->user->id,
                'name' => $this->user->name,
                'name_th' => $this->user->name_th,
                'username' => $this->user->username,
            ],
            'ip' => $this->ip,
            'location' => $this->location,
            'os' => $this->os,
            'browser' => $this->browser,
        ];
    }
}
