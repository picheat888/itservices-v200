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

        // The unique index keeps its original "departments_code_unique" name and,
        // on some drivers (notably sqlite), stays attached under that name after
        // the column rename. Rename it to track the new column so a later "code"
        // column can reclaim the original index name without colliding.
        Schema::table('departments', function (Blueprint $table) {
            $table->renameIndex('departments_code_unique', 'departments_tag_unique');
        });
    }

    public function down(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->renameIndex('departments_tag_unique', 'departments_code_unique');
        });
        Schema::table('departments', function (Blueprint $table) {
            $table->renameColumn('tag', 'code');
        });
    }
};
