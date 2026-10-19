<?php

// Admin-named CIDR ranges (office, VPN...) shown as the location of a sign-in instead of a geo lookup.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('network_names', function (Blueprint $table) {
            $table->id();
            $table->string('cidr', 64)->unique();
            $table->string('name', 100);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('network_names');
    }
};
