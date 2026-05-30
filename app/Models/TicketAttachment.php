<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * A single image/PDF attached to a ticket. The binary lives on the public disk
 * at {path}; this record holds the display metadata.
 */
class TicketAttachment extends Model
{
    protected $fillable = ['ticket_id', 'original_name', 'path', 'size', 'mime'];

    protected function casts(): array
    {
        return [
            'size' => 'integer',
        ];
    }

    /** The ticket this file belongs to. */
    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    /** Public URL the browser can open/download the file from. */
    public function url(): string
    {
        return Storage::disk('public')->url($this->path);
    }
}
