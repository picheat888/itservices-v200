<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Links each ownership move to the user who made it (performed_by stays as the name of the day).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('asset_transfers', function (Blueprint $table) {
            $table->foreignId('performed_by_user_id')->nullable()->after('performed_by')->constrained('users')->nullOnDelete();
        });

        // Backfill by name, only where exactly one user carries it
        $users = DB::table('users')->select('name', DB::raw('MIN(id) as id'))->groupBy('name')->havingRaw('COUNT(*) = 1')->pluck('id', 'name');
        foreach ($users as $name => $id) {
            DB::table('asset_transfers')->where('performed_by', $name)->whereNull('performed_by_user_id')->update(['performed_by_user_id' => $id]);
        }
    }

    public function down(): void
    {
        Schema::table('asset_transfers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('performed_by_user_id');
        });
    }
};
