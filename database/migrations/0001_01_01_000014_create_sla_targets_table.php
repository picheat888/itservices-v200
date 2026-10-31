<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 15/18 — SLA resolution targets as override rows (an empty table still resolves through
 * TicketSla::defaults()), and the company holidays the SLA clock skips.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sla_targets', function (Blueprint $table) {
            $table->id();
            // SlaScope and the value it matches (a priority or a request type), plain strings
            $table->string('scope', 20);
            $table->string('match_value', 40);
            $table->unsignedSmallInteger('resolve_hours');
            // business hours, or calendar time for a repair waiting at a vendor
            $table->string('clock', 16)->default('business');
            // Switched off rather than deleted, so the number comes back with it
            $table->boolean('enabled')->default(true);
            $table->timestamps();

            // One target per thing, so "which rule applied" has one answer
            $table->unique(['scope', 'match_value']);
        });

        // Company holidays the SLA clock skips (Settings -> Tickets & SLA)
        Schema::create('sla_holidays', function (Blueprint $table) {
            $table->id();
            $table->date('date')->unique();
            $table->string('name', 100);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sla_holidays');
        Schema::dropIfExists('sla_targets');
    }
};
