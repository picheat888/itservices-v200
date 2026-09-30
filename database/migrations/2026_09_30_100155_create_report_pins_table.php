<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reports a user pinned on the Report Center (/reports), so the pins follow the account to
 * any browser. `report_key` is a ReportCatalogue key (e.g. `stock.below_min`), not a foreign
 * key: reports are declared in code. A pin goes with its user.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_pins', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('report_key', 64);
            $table->timestamps();
            $table->unique(['user_id', 'report_key']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_pins');
    }
};
