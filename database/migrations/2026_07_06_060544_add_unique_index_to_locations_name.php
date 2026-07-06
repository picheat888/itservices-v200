<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Enforce unique location names at the source so the FK-conversion migration's
     * correlated subquery (which assumes at most one match per name) always holds,
     * and so duplicate master-data locations can't be created going forward.
     */
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->unique('name');
        });
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropUnique(['name']);
        });
    }
};
