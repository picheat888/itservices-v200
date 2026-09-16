<?php

namespace App\Models\Settings;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketSlaClock;
use App\Support\TicketSla;
use Illuminate\Database\Eloquent\Model;

/**
 * One resolution target an administrator has set, keyed on a priority or a request type.
 *
 * Lives in the Settings domain rather than Ticket because it is configuration edited on the
 * Settings screen — the same reason AppSetting and MailSetting sit here. How a target is CHOSEN
 * for a case is a ticket question, and that lives in App\Support\TicketSla.
 */
class SlaTarget extends Model
{
    protected $fillable = ['scope', 'match_value', 'resolve_hours', 'clock', 'enabled'];

    protected function casts(): array
    {
        return [
            'scope' => SlaScope::class,
            'resolve_hours' => 'integer',
            'clock' => TicketSlaClock::class,
            'enabled' => 'boolean',
        ];
    }

    /**
     * Any change to a target drops the per-request cache of the rules.
     *
     * TicketSla reads the whole table once per request because a ticket list resolves an SLA
     * per row. Left to the callers, "remember to flush" is a thing one of them eventually
     * forgets, and the symptom is a settings page that saves a number and then shows the old one.
     */
    protected static function booted(): void
    {
        $forget = fn () => TicketSla::flush();

        static::saved($forget);
        static::deleted($forget);
    }
}
