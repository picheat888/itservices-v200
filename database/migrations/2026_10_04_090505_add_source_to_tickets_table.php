<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * tickets.source — where a ticket came from (App\Enums\Ticket\TicketSource): 'manual' (opened
 * by someone) or 'auto_request' (opened by an approved service request). Before this a ticket had
 * no field for it; the only trace was service_requests.ticket_id, which the auto-ticket step is
 * the one place to write. Existing tickets are filled from that link, so the column is right
 * from the first report.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->string('source', 20)->default('manual')->after('status')->index();
        });

        DB::table('tickets')
            ->whereIn('id', DB::table('service_requests')->whereNotNull('ticket_id')->select('ticket_id'))
            ->update(['source' => 'auto_request']);
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropIndex(['source']);
            $table->dropColumn('source');
        });
    }
};
