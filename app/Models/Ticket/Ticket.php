<?php

namespace App\Models\Ticket;

use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketStatus;
use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\User;
use Database\Factories\TicketFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Ticket extends Model
{
    /** @use HasFactory<TicketFactory> */
    use HasFactory;

    /**
     * Bind to the flat TicketFactory explicitly — factory auto-discovery would look for
     * Database\Factories\Ticket\TicketFactory under this domain sub-namespace and miss it.
     */
    protected static function newFactory(): TicketFactory
    {
        return TicketFactory::new();
    }

    protected $fillable = [
        'ticket_no', 'subject', 'description',
        'category', 'priority', 'status',
        'requester_id', 'assignee_id', 'callback_phone', 'related_asset_id',
        'take_note', 'resolution', 'resolved_at', 'responded_at',
        'sla_response_due_at', 'sla_resolve_due_at',
        'sla_response_alert_level', 'sla_resolve_alert_level',
    ];

    protected function casts(): array
    {
        return [
            'category' => TicketCategory::class,
            'priority' => TicketPriority::class,
            'status' => TicketStatus::class,
            'resolved_at' => 'datetime',
            'responded_at' => 'datetime',
            'sla_response_due_at' => 'datetime',
            'sla_resolve_due_at' => 'datetime',
        ];
    }

    /**
     * Auto-assign the ticket number (TKT-<CAT>-YYMMDD-NNN) on create when one wasn't supplied.
     */
    protected static function booted(): void
    {
        static::creating(function (Ticket $ticket) {
            if (blank($ticket->ticket_no)) {
                $ticket->ticket_no = static::generateTicketNo($ticket->category);
            }
        });
    }

    /**
     * Build the ticket number as TKT-<CAT>-YYMMDD-NNN: the TKT prefix, the category
     * short code (SW / HW / NW / OTH), today's date (YYMMDD), and a 3-digit running
     * number that restarts for each category+day. Only numbers already matching that
     * exact prefix feed the sequence, so other formats never collide. Computed in PHP
     * (not SQL) to stay portable across MySQL and SQLite.
     */
    public static function generateTicketNo(?TicketCategory $category = null): string
    {
        $cat = ($category ?? TicketCategory::Other)->shortCode();
        $prefix = sprintf('TKT-%s-%s-', $cat, now()->format('ymd'));

        $last = static::where('ticket_no', 'like', $prefix.'%')
            ->pluck('ticket_no')
            ->map(fn (string $no): int => (int) substr($no, strlen($prefix)))
            ->max() ?? 0;

        return sprintf('%s%03d', $prefix, $last + 1);
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
