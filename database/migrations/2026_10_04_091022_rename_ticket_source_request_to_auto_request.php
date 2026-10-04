<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * tickets.source: the value for a ticket an approved service request opened is 'auto_request'
 * (App\Enums\Ticket\TicketSource::AutoRequest), not 'request' — it names that the system opened
 * it, not a person. Renames the rows the add_source migration already filled on databases where
 * it ran with the old value; a fresh database gets 'auto_request' from that migration directly.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('tickets')->where('source', 'request')->update(['source' => 'auto_request']);
    }

    public function down(): void
    {
        DB::table('tickets')->where('source', 'auto_request')->update(['source' => 'request']);
    }
};
