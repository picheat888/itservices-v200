<?php

namespace App\Models\Request;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One file filed with a service request — the quote, the floor plan, the photo of
 * where the camera should point. The binary lives on the PRIVATE disk at {path};
 * this record holds the display metadata. It is only reachable through the
 * authenticated files.request-attachment route (never a public /storage URL).
 */
class RequestAttachment extends Model
{
    protected $fillable = ['service_request_id', 'original_name', 'path', 'size', 'mime'];

    protected function casts(): array
    {
        return [
            'size' => 'integer',
        ];
    }

    /** The request this file belongs to. */
    public function serviceRequest(): BelongsTo
    {
        return $this->belongsTo(ServiceRequest::class);
    }

    /** Authenticated URL the browser can open/download the file from. */
    public function url(): string
    {
        return route('files.request-attachment', $this);
    }
}
