<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Rename departments.code → departments.tag (the user-facing "Tag" badge),
     * so the column/variable name matches the UI label. Data + unique index
     * are preserved by the rename.
     */
    public function up(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->renameColumn('code', 'tag');
        });
    }

    public function down(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->renameColumn('tag', 'code');
        });
    }
};
