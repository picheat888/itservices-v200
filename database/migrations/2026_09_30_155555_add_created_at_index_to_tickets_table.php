<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every ticket report narrows by when a case was opened (Ticket & SLA overview, tickets by
 * department, the hub's number strip) — an index on created_at keeps those range scans
 * from reading the whole table once the desk has a few years of cases.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->index('created_at', 'tickets_created_at_idx');
        });
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropIndex('tickets_created_at_idx');
        });
    }
};
