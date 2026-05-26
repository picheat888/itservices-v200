<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Dedup ledger for contract expiry alerts: one row per (contract, reminder
     * threshold) that has already been alerted, so each threshold fires once
     * per contract cycle. Cleared for a contract when it is renewed.
     */
    public function up(): void
    {
        Schema::create('contract_alert_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contract_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('threshold'); // reminder day count, e.g. 30
            $table->timestamp('alerted_at');
            $table->unique(['contract_id', 'threshold']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contract_alert_logs');
    }
};
