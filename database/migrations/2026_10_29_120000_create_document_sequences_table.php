<?php

// Per-year running numbers for document references (RQ- service requests), one locked row per name and year.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_sequences', function (Blueprint $table) {
            $table->id();
            $table->string('name', 20);
            $table->smallInteger('year');
            $table->unsignedInteger('last');
            $table->timestamps();
            $table->unique(['name', 'year']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_sequences');
    }
};
