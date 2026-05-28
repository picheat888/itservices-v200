<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('assets', function (Blueprint $table) {
            $table->id();
            $table->string('tag')->unique();                       // INB-LT-00231
            $table->string('type')->default('laptop');             // AssetType enum value
            $table->string('brand')->nullable();
            $table->string('model');
            $table->string('serial')->nullable();
            $table->string('source')->default('purchased');        // purchased | rented
            $table->string('status')->default('ready');            // AssetStatus enum value
            $table->string('owner')->nullable();                   // current holder (emp code/name or pool)
            $table->string('initial_owner')->nullable();
            $table->string('department')->nullable();
            $table->string('location')->nullable();
            $table->decimal('value', 15, 2)->default(0);           // purchase price, or monthly fee when rented
            $table->string('supplier')->nullable();
            $table->date('purchase_date')->nullable();
            $table->date('warranty_end')->nullable();
            // Rented assets can link to a vendor contract; null the link if the contract is removed.
            $table->foreignId('contract_id')->nullable()->constrained('contracts')->nullOnDelete();
            $table->date('lease_start')->nullable();
            $table->date('lease_end')->nullable();
            $table->date('registered_date')->nullable();
            $table->text('notes')->nullable();
            $table->string('last_reason')->nullable();             // reason for last maintenance/write-off/transfer
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('assets');
    }
};
