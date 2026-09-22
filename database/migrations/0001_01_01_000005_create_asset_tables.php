<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Baseline 6/17 — IT assets and the hand-over trail behind them.
 *
 * An asset holds both `owner` (the label shown, which may name a shared use
 * rather than a person) and `owner_employee_id` (the FK, set only when a person
 * actually holds it) — the pair is what lets "Common / shared" deployments exist
 * alongside personal ones.
 *
 * asset_transfers keeps the tag and model as text on purpose: the row has to stay
 * readable as history even after the asset itself is renamed or re-modelled. Its
 * asset_id is restrictOnDelete for the same reason: an asset handed out even once can
 * no longer be deleted, so the custody trail can never vanish under it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assets', function (Blueprint $table) {
            $table->id();
            $table->string('asset_code');
            $table->string('tag', 120)->nullable();
            $table->unsignedBigInteger('category_id')->nullable();
            $table->unsignedBigInteger('brand_id')->nullable();
            $table->unsignedBigInteger('model_id')->nullable();
            $table->string('serial')->nullable();
            $table->string('source')->default('purchased');
            $table->string('status')->default('ready');
            $table->string('owner')->nullable();
            $table->unsignedBigInteger('owner_employee_id')->nullable();
            $table->unsignedBigInteger('location_id')->nullable();
            $table->unsignedBigInteger('warehouse_id')->nullable();
            $table->decimal('value', 15, 2)->default(0.00);
            $table->unsignedBigInteger('vendor_id')->nullable();
            $table->date('purchase_date')->nullable();
            $table->date('warranty_end')->nullable();
            $table->boolean('warranty_lifetime')->default(false);
            $table->unsignedBigInteger('contract_id')->nullable();
            $table->date('owned_since')->nullable();
            $table->text('notes')->nullable();
            $table->string('last_reason')->nullable();
            $table->timestamps();
            // Keeps the index name the column used to carry, from when the code
            // lived in `tag` — renaming it would be churn for no gain.
            $table->unique(['asset_code'], 'assets_tag_unique');
            $table->foreign('category_id')->references('id')->on('categories')->restrictOnDelete();
            $table->foreign('brand_id')->references('id')->on('brands')->restrictOnDelete();
            $table->foreign('model_id')->references('id')->on('asset_models')->restrictOnDelete();
            $table->foreign('owner_employee_id')->references('id')->on('employees')->nullOnDelete();
            $table->foreign('location_id')->references('id')->on('locations')->restrictOnDelete();
            $table->foreign('warehouse_id')->references('id')->on('warehouses')->restrictOnDelete();
            $table->foreign('vendor_id')->references('id')->on('vendors')->restrictOnDelete();
            $table->foreign('contract_id')->references('id')->on('contracts')->nullOnDelete();
        });

        Schema::create('asset_transfers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('asset_id');
            $table->string('asset_tag');
            $table->string('asset_model');
            // handover / return / recall — read off its own column instead of being
            // parsed back out of the free-text reason. Indexed with the timestamp
            // because every question asked of this table is "the recent X events".
            $table->string('kind', 12)->default('handover');
            $table->index(['kind', 'created_at']);
            $table->string('from_owner')->nullable();
            $table->string('to_owner');
            $table->string('reason')->nullable();
            $table->string('performed_by')->nullable();
            $table->timestamps();
            $table->foreign('asset_id')->references('id')->on('assets')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('asset_transfers');
        Schema::dropIfExists('assets');
    }
};
