<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Ticket subjects are single-language now. Fold any Thai copy back into `subject`
     * so no wording is lost, then drop the redundant `subject_th` column.
     */
    public function up(): void
    {
        DB::table('tickets')
            ->whereNotNull('subject_th')
            ->where('subject_th', '<>', '')
            ->update(['subject' => DB::raw('subject_th')]);

        Schema::table('tickets', function (Blueprint $table) {
            $table->dropColumn('subject_th');
        });
    }

    /**
     * Re-add the column (nullable). Original per-row Thai values cannot be restored.
     */
    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->string('subject_th')->nullable()->after('subject');
        });
    }
};
