<?php

use App\Enums\Ticket\SlaScope;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Drop repair targets keyed on a bare work class.
 *
 * A repair target belongs to a pair — the kind of case and who does the work — because
 * replacing a mainboard at an external shop and rewiring a floor are not the same length of
 * job. Rows written before that are keyed "repair_vendor" rather than "network:repair_vendor",
 * and TicketSla::targetFor() now looks only for the pair, so they can never match a case again.
 *
 * They are deleted rather than converted because there is nothing to convert them to: a bare
 * key does not say which kind of case it was meant for, and picking one would be inventing
 * configuration nobody chose. An administrator re-enters the pairs they actually want, which
 * is a shorter job than auditing a guess.
 *
 * No down(): restoring a row that cannot match anything restores nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('sla_targets')
            ->where('scope', SlaScope::WorkClass->value)
            ->where('match_value', 'not like', '%:%')
            ->delete();
    }

    public function down(): void {}
};
