<?php

use App\Enums\Asset\AssetTransferKind;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Records WHAT each custody-trail row was — hand-over, return, or recall.
 *
 * The table only ever stored from/to owners, so the Assets dashboard could not count
 * hand-overs per month without reading the English `reason` text, which users write
 * themselves. `AssetService` now stamps the kind at every log site.
 *
 * Existing rows are backfilled with that same inference, once: the two reasons the service
 * wrote itself ('Returned to pool', 'Recalled - transfer cancelled') are reliable for rows
 * it created, and everything else was a hand-over.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('asset_transfers', function (Blueprint $table) {
            $table->string('kind', 12)->default(AssetTransferKind::Handover->value)->after('asset_model');
            $table->index(['kind', 'created_at']);
        });

        DB::table('asset_transfers')
            ->where('reason', 'Returned to pool')
            ->update(['kind' => AssetTransferKind::Return->value]);

        DB::table('asset_transfers')
            ->where('reason', 'like', 'Recalled%')
            ->update(['kind' => AssetTransferKind::Recall->value]);
    }

    public function down(): void
    {
        Schema::table('asset_transfers', function (Blueprint $table) {
            $table->dropIndex(['kind', 'created_at']);
            $table->dropColumn('kind');
        });
    }
};
