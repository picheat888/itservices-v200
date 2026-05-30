<?php

namespace App\Models;

use App\Enums\TicketCategory;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use Database\Factories\TicketFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Ticket extends Model
{
    /** @use HasFactory<TicketFactory> */
    use HasFactory;

    protected $fillable = [
        'ticket_no', 'subject', 'subject_th', 'description',
        'category', 'priority', 'status',
        'requester_id', 'assignee_id', 'callback_phone', 'related_asset_id',
        'take_note', 'resolution', 'resolved_at',
    ];

    protected function casts(): array
    {
        return [
            'category' => TicketCategory::class,
            'priority' => TicketPriority::class,
            'status' => TicketStatus::class,
            'resolved_at' => 'datetime',
        ];
    }

    /**
     * Auto-assign a sequential ticket number (TKT-####) on create when one
     * wasn't supplied, mirroring the Employee code generator.
     */
    protected static function booted(): void
    {
        static::creating(function (Ticket $ticket) {
            if (blank($ticket->ticket_no)) {
                $next = (static::max('id') ?? 2860) + 1;
                $ticket->ticket_no = 'TKT-'.$next;
            }
        });
    }

    /** The employee who reported the issue. */
    public function requester(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'requester_id');
    }

    /** The IT staff login account handling the ticket (null while unassigned). */
    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    /** Optional asset the ticket relates to (typically hardware issues). */
    public function relatedAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'related_asset_id');
    }

    /** Images/PDFs uploaded against this ticket.
     *
     * @return HasMany<TicketAttachment, $this>
     */
    public function attachments(): HasMany
    {
        return $this->hasMany(TicketAttachment::class);
    }

    /** True when the ticket is still waiting for an IT staff to pick it up. */
    public function isUnassigned(): bool
    {
        return $this->assignee_id === null;
    }
}
