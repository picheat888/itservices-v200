<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Renames contracts.title -> details. The column always held the contract's
     * long description ("รายละเอียด"); the name `title` was misleading. The short
     * contract name lives in `name`. renameColumn preserves data + definition.
     */
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->renameColumn('title', 'details');
        });
    }

    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->renameColumn('details', 'title');
        });
    }
};
