<?php

namespace App\Models\Ticket;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single image/PDF attached to a ticket. The binary lives on the PRIVATE disk
 * at {path}; this record holds the display metadata. It is only reachable through
 * the authenticated files.ticket-attachment route (never a public /storage URL).
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

    /** Authenticated URL the browser can open/download the file from. */
    public function url(): string
    {
        return route('files.ticket-attachment', $this);
    }
}
