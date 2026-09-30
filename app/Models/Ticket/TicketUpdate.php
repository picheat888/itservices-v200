<?php

namespace App\Models\Ticket;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One progress note on a ticket — what happened between taking the case and closing it.
 *
 * The author's name is stored alongside the account that wrote it: a note has to stay readable
 * after that person leaves, the way approval rows already do.
 */
class TicketUpdate extends Model
{
    /** A progress note somebody typed. */
    public const KIND_NOTE = 'note';

    /** The case changed hands; `meta` = {from, to}. Written by TicketService::forward. */
    public const KIND_FORWARDED = 'forwarded';

    protected $fillable = ['ticket_id', 'user_id', 'author_name', 'kind', 'body', 'meta'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['meta' => 'array'];
    }

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
