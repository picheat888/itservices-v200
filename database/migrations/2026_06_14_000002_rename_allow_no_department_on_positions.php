<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Rename the per-position flag. It now gates more than the department: a
     * "special position" may be saved without a department AND without a report-to.
     */
    public function up(): void
    {
        Schema::table('positions', function (Blueprint $table) {
            $table->renameColumn('allow_no_department', 'allow_special_position');
        });
    }

    public function down(): void
    {
        Schema::table('positions', function (Blueprint $table) {
            $table->renameColumn('allow_special_position', 'allow_no_department');
        });
    }
};
