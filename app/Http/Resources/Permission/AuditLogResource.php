<?php

// One Audit log entry as the Audit log tab shows it, its time on the wall clock.

namespace App\Http\Resources\Permission;

use App\Models\AuditLog;
use App\Support\SystemTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin AuditLog */
class AuditLogResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_name' => $this->user_name,
            'action' => $this->action,
            'target' => $this->target,
            'subject_type' => $this->subject_type,
            'details' => $this->details,
            'created_at' => SystemTime::dateTime($this->created_at),
        ];
    }
}
