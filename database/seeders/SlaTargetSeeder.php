<?php

namespace Database\Seeders;

use App\Enums\Request\RequestType;
use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketSlaClock;
use App\Models\Settings\SlaTarget;
use App\Support\TicketSla;
use Illuminate\Database\Seeder;

/**
 * One resolution target per request type, so a case opened from an approved request always
 * has a rule to be judged against.
 *
 * These rows are not optional the way the repair-work ones are. A request-born ticket is
 * never given a priority — its length was settled by what was asked for — so if no rule
 * matches it, the target falls through to the built-in medium default with nothing on screen
 * saying so. Seeding every type means that silent path cannot be reached on a fresh install,
 * before anybody has opened Settings.
 *
 * Idempotent and non-destructive: a type that already has a row keeps whatever the
 * administrator set. This seeder only fills gaps.
 */
class SlaTargetSeeder extends Seeder
{
    public function run(): void
    {
        // The medium target is what a case with no priority would have been judged against
        // anyway, so seeding it changes which rule decides the deadline, not the deadline.
        $hours = TicketSla::resolveHours('medium');
        $created = 0;

        foreach (RequestType::cases() as $type) {
            $row = SlaTarget::firstOrCreate(
                ['scope' => SlaScope::RequestType->value, 'match_value' => $type->value],
                ['resolve_hours' => $hours, 'clock' => TicketSlaClock::Business->value, 'enabled' => true],
            );

            if ($row->wasRecentlyCreated) {
                $created++;
            }
        }

        $this->command?->info("SLA request-type targets: {$created} created, ".(count(RequestType::cases()) - $created).' already set.');
    }
}
