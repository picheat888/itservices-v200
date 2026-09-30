<?php

namespace App\Services\Report\Ticket;

use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Report\TicketLabels;
use App\Support\Permissions;
use Illuminate\Database\Eloquent\Builder;

/**
 * What the ticket tabular reports share with the Ticket & SLA overview:
 *
 * - scoping: a reader only ever counts tickets in the categories their `tickets.level_*`
 *   permissions open (Permissions::ticketLevelsFor), exactly like TicketOverviewReportService;
 * - wording: the Ticket module's own i18n keys on the page, TicketLabels' Thai in the file;
 * - the SLA verdict as SQL, mirroring TicketMetrics::slaState / activeDue.
 */
trait TicketReportScope
{
    /** Tickets the viewer may count, optionally narrowed to one category they can see. */
    private function scopedTickets(User $viewer, ?string $category = null): Builder
    {
        $levels = $this->levels($viewer);
        $categories = $category === null ? $levels : array_values(array_intersect([$category], $levels));

        return Ticket::query()->whereIn('tickets.category', $categories);
    }

    /** @return list<string> */
    private function levels(User $viewer): array
    {
        return Permissions::ticketLevelsFor($viewer);
    }

    /** @return array<string, string> */
    private static function categoryKeys(): array
    {
        return self::keyed(TicketCategory::cases(), 'ticket_cat_');
    }

    /** @return array<string, string> */
    private static function categoryTh(): array
    {
        return self::thai(TicketCategory::cases(), fn (string $v) => TicketLabels::category($v));
    }

    /** @return array<string, string> */
    private static function priorityKeys(): array
    {
        return self::keyed(TicketPriority::cases(), 'ticket_prio_');
    }

    /** @return array<string, string> */
    private static function priorityTh(): array
    {
        return self::thai(TicketPriority::cases(), fn (string $v) => TicketLabels::priority($v));
    }

    /** @return array<string, string> */
    private static function statusKeys(): array
    {
        return self::keyed(TicketStatus::cases(), 'ticket_');
    }

    /** @return array<string, string> */
    private static function statusTh(): array
    {
        return self::thai(TicketStatus::cases(), fn (string $v) => TicketLabels::status($v));
    }

    /**
     * SQL: a completed ticket resolved by its deadline (only tickets that had one count).
     * Same rule as TicketMetrics::slaState for completed tickets.
     */
    private static function metSql(): string
    {
        return "(tickets.status = 'completed' AND tickets.resolved_at IS NOT NULL AND tickets.sla_resolve_due_at IS NOT NULL AND tickets.resolved_at <= tickets.sla_resolve_due_at)";
    }

    /** SQL: a completed ticket that had a deadline to measure against. */
    private static function measuredSql(): string
    {
        return "(tickets.status = 'completed' AND tickets.resolved_at IS NOT NULL AND tickets.sla_resolve_due_at IS NOT NULL)";
    }

    /**
     * SQL: a live ticket already past the deadline it is running against now — first response
     * while it waits to be taken, resolution afterwards (TicketMetrics::activeDue). "Now" is
     * the app clock, inlined: generated here, never reader input.
     */
    private static function breachedSql(): string
    {
        $now = "'".now()->toDateTimeString()."'";

        return "((tickets.status = 'open' AND tickets.responded_at IS NULL AND tickets.sla_response_due_at IS NOT NULL AND tickets.sla_response_due_at < {$now})"
            ." OR (tickets.status IN ('open', 'in_progress') AND NOT (tickets.status = 'open' AND tickets.responded_at IS NULL)"
            ." AND tickets.sla_resolve_due_at IS NOT NULL AND tickets.sla_resolve_due_at < {$now}))";
    }

    /** Percent, whole number; null when there is nothing to measure. */
    private static function percent(int|float $part, int|float $whole): ?int
    {
        return $whole > 0 ? (int) round($part / $whole * 100) : null;
    }

    /**
     * @param  list<\BackedEnum>  $cases
     * @return array<string, string>
     */
    private static function keyed(array $cases, string $prefix): array
    {
        $keys = [];
        foreach ($cases as $case) {
            $keys[$case->value] = $prefix.$case->value;
        }

        return $keys;
    }

    /**
     * @param  list<\BackedEnum>  $cases
     * @param  \Closure(string): ?string  $label
     * @return array<string, string>
     */
    private static function thai(array $cases, \Closure $label): array
    {
        $labels = [];
        foreach ($cases as $case) {
            $labels[$case->value] = (string) $label($case->value);
        }

        return $labels;
    }
}
