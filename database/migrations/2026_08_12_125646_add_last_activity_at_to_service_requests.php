<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * When a request last MOVED — submitted, a rung signed, decided, delivered.
 *
 * The dashboard's activity feed needs to order by this, and nothing already stored says
 * it: `updated_at` bumps on any write at all (a display-snapshot refresh rewrites every
 * row's `fields` and would send the whole table to the top of the feed), and a rung signed
 * mid-chain writes to request_approvals without touching the request at all.
 *
 * Maintained by RequestService at each transition. Indexed because it is what the feed
 * sorts on.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->dateTime('last_activity_at')->nullable()->index()->after('cancelled_at');
        });

        // Backfill from what the existing rows already know: the latest of the request's own
        // decision stamps and the last rung anybody signed, falling back to when it was
        // filed. Done in PHP rather than one GREATEST(): every column here is nullable, and
        // GREATEST returns null the moment one of its arguments is.
        DB::table('service_requests')->orderBy('id')->chunkById(200, function ($requests) {
            foreach ($requests as $request) {
                $lastActed = DB::table('request_approvals')
                    ->where('service_request_id', $request->id)
                    ->max('acted_at');

                $stamps = array_filter([
                    $request->created_at,
                    $request->approved_at,
                    $request->rejected_at,
                    $request->fulfilled_at,
                    $request->cancelled_at,
                    $lastActed,
                ]);

                DB::table('service_requests')
                    ->where('id', $request->id)
                    ->update(['last_activity_at' => $stamps === [] ? null : max($stamps)]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            $table->dropIndex(['last_activity_at']);
            $table->dropColumn('last_activity_at');
        });
    }
};
