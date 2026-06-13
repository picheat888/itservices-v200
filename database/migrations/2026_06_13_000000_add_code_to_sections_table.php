<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sections', function (Blueprint $table) {
            $table->string('code')->nullable()->unique()->after('id');
        });

        // Backfill existing sections with sequential SEC-#### codes (by id).
        $n = 0;
        foreach (DB::table('sections')->orderBy('id')->pluck('id') as $id) {
            $n++;
            DB::table('sections')->where('id', $id)->update([
                'code' => 'SEC-'.str_pad((string) $n, 4, '0', STR_PAD_LEFT),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('sections', function (Blueprint $table) {
            $table->dropColumn('code');
        });
    }
};
