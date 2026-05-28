<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-day dedup ledger for the in-app contract expiry bell. One row per
     * (contract, calendar day) the bell fired, so a contract that stays
     * "expiring soon" or "expired" re-alerts at most once a day. Cleared for a
     * contract when it is renewed. Separate from contract_alert_logs, which
     * dedups the (less frequent) email channel per reminder threshold.
     */
    public function up(): void
    {
        Schema::create('contract_bell_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contract_id')->constrained()->cascadeOnDelete();
            $table->date('bell_date');
            $table->unique(['contract_id', 'bell_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('contract_bell_logs');
    }
};
