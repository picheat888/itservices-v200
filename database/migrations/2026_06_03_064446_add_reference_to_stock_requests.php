<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_requests', function (Blueprint $table) {
            $table->string('reference', 30)->nullable()->unique()->after('id');
        });

        // Backfill existing rows with REQ-<year>-<NNNN>, counted per year, ordered by id.
        $counters = [];
        foreach (DB::table('stock_requests')->orderBy('id')->get(['id', 'created_at']) as $row) {
            $year = $row->created_at ? (int) date('Y', strtotime($row->created_at)) : (int) date('Y');
            $counters[$year] = ($counters[$year] ?? 0) + 1;
            DB::table('stock_requests')->where('id', $row->id)->update([
                'reference' => sprintf('REQ-%d-%04d', $year, $counters[$year]),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('stock_requests', function (Blueprint $table) {
            $table->dropColumn('reference');
        });
    }
};
