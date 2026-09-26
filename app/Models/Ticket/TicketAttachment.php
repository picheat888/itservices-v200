<?php

namespace App\Models\Ticket;

use App\Models\Request\RequestAttachment;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single image/PDF attached to a ticket. The binary lives on the PRIVATE disk
 * at {path}; this record holds the display metadata. It is only reachable through
 * the authenticated files.ticket-attachment route (never a public /storage URL).
 *
 * A row with `request_attachment_id` set owns none of that: it mirrors a file the
 * service request was filed with, so the case can show the evidence it was opened
 * on without a second copy of the bytes. The two rows share one `path`, and the
 * request's is the original — which is why the mirror may never be deleted here.
 */
class TicketAttachment extends Model
{
    protected $fillable = ['ticket_id', 'request_attachment_id', 'original_name', 'path', 'size', 'mime'];

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

    /** The request file this row mirrors, or null when the file was uploaded here. */
    public function requestAttachment(): BelongsTo
    {
        return $this->belongsTo(RequestAttachment::class);
    }

    /** Whether this row mirrors a request's file rather than owning one of its own. */
    public function isMirrored(): bool
    {
        return $this->request_attachment_id !== null;
    }

    /** Authenticated URL the browser can open/download the file from. */
    public function url(): string
    {
        return route('files.ticket-attachment', $this);
    }
}
