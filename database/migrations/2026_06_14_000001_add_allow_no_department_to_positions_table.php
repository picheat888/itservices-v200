<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds a per-position flag: when true, employees holding this position may be
     * saved without a department (the department field stops being required).
     */
    public function up(): void
    {
        Schema::table('positions', function (Blueprint $table) {
            $table->boolean('allow_no_department')->default(false)->after('title');
        });
    }

    public function down(): void
    {
        Schema::table('positions', function (Blueprint $table) {
            $table->dropColumn('allow_no_department');
        });
    }
};
