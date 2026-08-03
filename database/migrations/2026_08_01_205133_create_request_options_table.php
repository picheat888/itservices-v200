<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Editable choice lists behind the request form's select fields — the device
 * lists for Hardware and Mobile, the handset types for Telephone. Keyed by the
 * request type and the schema field they feed, so one table serves every list
 * without a migration per list.
 *
 * `value` is the code stored on a request and never changes once created; the
 * two labels are what people read and are freely editable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('request_options', function (Blueprint $table) {
            $table->id();
            $table->string('request_type', 30);
            $table->string('field_key', 40);
            $table->string('value', 60);
            $table->string('label_en', 120);
            $table->string('label_th', 120)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->unique(['request_type', 'field_key', 'value']);
            $table->index(['request_type', 'field_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('request_options');
    }
};
