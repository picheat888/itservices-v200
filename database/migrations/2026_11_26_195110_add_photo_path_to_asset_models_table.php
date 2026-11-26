<?php

// One photo per asset model, stored on the private disk and shown wherever that model appears.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('asset_models', function (Blueprint $table) {
            $table->string('photo_path')->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('asset_models', function (Blueprint $table) {
            $table->dropColumn('photo_path');
        });
    }
};
