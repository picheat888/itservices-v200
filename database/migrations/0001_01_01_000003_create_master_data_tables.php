<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 4/17 — the shared lookup lists the Asset, Stock, Contract and Request
 * forms all pick from, edited in Settings → Master data. Every one of these is
 * referenced by id (never by its name string), which is why deleting a row that
 * is in use is refused rather than cascaded.
 *
 * asset_models comes after brands because a model belongs to one; social
 * platforms live here too, being another list the Request form draws from.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('brands', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120)->unique();
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120)->unique();
            $table->string('name_th', 120)->nullable();
            $table->string('icon', 60)->nullable();
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->timestamps();
        });

        Schema::create('units', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120)->unique();
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('vendors', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120)->unique();
            $table->string('name_th', 120)->nullable();
            $table->string('contact', 120)->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('email', 120)->nullable();
            $table->string('address')->nullable();
            $table->timestamps();
        });

        Schema::create('warehouses', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120)->unique();
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('warranty_types', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120)->unique();
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('asset_models', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->unsignedBigInteger('brand_id')->nullable();
            $table->string('description')->nullable();
            $table->timestamps();
            // The same model name may exist under two brands, so uniqueness is the pair.
            $table->unique(['name', 'brand_id']);
            $table->foreign('brand_id')->references('id')->on('brands')->nullOnDelete();
        });

        Schema::create('social_platforms', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('url')->nullable();
            $table->string('color')->nullable();
            $table->string('logo_path')->nullable();
            $table->text('policy')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('social_platforms');
        Schema::dropIfExists('asset_models');
        Schema::dropIfExists('warranty_types');
        Schema::dropIfExists('warehouses');
        Schema::dropIfExists('vendors');
        Schema::dropIfExists('units');
        Schema::dropIfExists('locations');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('brands');
    }
};
