<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Approval workflow definitions for the Request module. Exactly one workflow
 * per request type (computer, fileshare, …) — the unique request_type column
 * is the lookup key used at submit time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflows', function (Blueprint $table) {
            $table->id();
            $table->string('request_type', 30)->unique();
            $table->string('name', 120);
            $table->boolean('active')->default(true);
            $table->boolean('auto_ticket')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflows');
    }
};
