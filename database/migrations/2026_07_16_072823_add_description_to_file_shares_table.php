<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Free-text description for a file share, mirroring email groups. */
    public function up(): void
    {
        Schema::table('file_shares', function (Blueprint $table) {
            $table->string('description')->nullable()->after('size_label');
        });
    }

    public function down(): void
    {
        Schema::table('file_shares', function (Blueprint $table) {
            $table->dropColumn('description');
        });
    }
};
