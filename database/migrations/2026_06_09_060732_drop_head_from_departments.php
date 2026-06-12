<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Drops the free-text department head/supervisor label. The reporting
     * structure is now driven solely by employees.manager_id (the approval
     * chain), so this display-only column is redundant.
     */
    public function up(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->dropColumn('head');
        });
    }

    /**
     * Reverse the migration (re-adds the nullable column; stored values are not restored).
     */
    public function down(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->string('head')->nullable();
        });
    }
};
