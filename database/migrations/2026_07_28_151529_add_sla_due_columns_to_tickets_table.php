<?php

use App\Models\Ticket\Ticket;
use App\Support\TicketSla;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Persisted SLA deadlines so the list can sort/filter by urgency in SQL (the
 * business-hours math lives in PHP and can't run inside ORDER BY). Written on
 * create/take/assign and recomputed when the SLA settings change; existing rows
 * are backfilled here with the current settings.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dateTime('sla_response_due_at')->nullable()->after('responded_at');
            $table->dateTime('sla_resolve_due_at')->nullable()->after('sla_response_due_at');
        });

        // Backfill every existing ticket (canceled ones carry no SLA).
        Ticket::query()->whereNotIn('status', ['canceled'])->chunkById(200, function ($tickets) {
            foreach ($tickets as $ticket) {
                // Compute BEFORE disabling timestamps — usesTimestamps()=false also
                // drops the created_at Carbon cast the business-time math needs.
                $dues = [
                    'sla_response_due_at' => TicketSla::responseDueAt($ticket),
                    'sla_resolve_due_at' => TicketSla::resolveDueAt($ticket),
                ];
                $ticket->timestamps = false; // a backfill is not an edit — keep updated_at
                $ticket->forceFill($dues)->saveQuietly();
            }
        });
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropColumn(['sla_response_due_at', 'sla_resolve_due_at']);
        });
    }
};
