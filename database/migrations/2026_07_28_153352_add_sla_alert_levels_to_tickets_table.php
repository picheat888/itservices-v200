<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-clock record of the strongest SLA alert already sent ('at_risk' or
 * 'breached', null = none) so the sweep never re-fires the same warning.
 * Reset whenever the deadline itself moves (take/assign, SLA settings change).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->string('sla_response_alert_level', 10)->nullable()->after('sla_resolve_due_at');
            $table->string('sla_resolve_alert_level', 10)->nullable()->after('sla_response_alert_level');
        });
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropColumn(['sla_response_alert_level', 'sla_resolve_alert_level']);
        });
    }
};
