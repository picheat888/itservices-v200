<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Make the asset columns match their real meaning:
     * - `tag` actually held the Asset ID (INK-IT-…) → rename to `asset_id`.
     * - `nickname` was the user-given "Tag" name → rename to `tag`.
     * Renames are done in two steps so `tag` is freed before it's reused.
     */
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->renameColumn('tag', 'asset_id');
        });
        Schema::table('assets', function (Blueprint $table) {
            $table->renameColumn('nickname', 'tag');
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->renameColumn('tag', 'nickname');
        });
        Schema::table('assets', function (Blueprint $table) {
            $table->renameColumn('asset_id', 'tag');
        });
    }
};
