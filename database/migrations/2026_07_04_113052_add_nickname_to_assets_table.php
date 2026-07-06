<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A free-text nickname ("Tag") a user can give an asset to recognise it easily,
     * separate from the auto-generated Asset ID (the `tag` column).
     */
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->string('nickname', 120)->nullable()->after('tag');
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn('nickname');
        });
    }
};
