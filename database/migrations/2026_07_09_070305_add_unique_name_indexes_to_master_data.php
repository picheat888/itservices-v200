<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Enforce unique master-data names at the DB level, matching brands/units/etc.
     * Category and Vendor are unique globally; AssetModel is unique per brand
     * (a model name can repeat under a different brand). Existing data has no
     * duplicates (checked before adding these indexes).
     */
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->unique('name');
        });
        Schema::table('vendors', function (Blueprint $table) {
            $table->unique('name');
        });
        Schema::table('asset_models', function (Blueprint $table) {
            $table->unique(['name', 'brand_id']);
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropUnique(['name']);
        });
        Schema::table('vendors', function (Blueprint $table) {
            $table->dropUnique(['name']);
        });
        Schema::table('asset_models', function (Blueprint $table) {
            $table->dropUnique(['name', 'brand_id']);
        });
    }
};
