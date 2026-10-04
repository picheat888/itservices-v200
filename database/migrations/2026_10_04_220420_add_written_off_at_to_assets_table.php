<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * assets.written_off_at — when an asset was written off, so a report can list write-offs by date.
 * Set when the status becomes writeoff (App\Models\Asset\Asset::booted, AssetService::bulkSetStatus)
 * and cleared when a write-off is cancelled.
 *
 * Assets already written off take their updated_at: a written-off asset cannot be edited, so its
 * last change is the write-off itself.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->timestamp('written_off_at')->nullable()->after('last_reason');
            $table->index('written_off_at');
        });

        DB::table('assets')
            ->where('status', 'writeoff')
            ->whereNull('written_off_at')
            ->update(['written_off_at' => DB::raw('updated_at')]);
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropIndex(['written_off_at']);
            $table->dropColumn('written_off_at');
        });
    }
};
