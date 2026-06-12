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
        Schema::table('departments', function (Blueprint $table) {
            $table->dropColumn('location');
        });
    }

    /**
     * Reverse the migrations (re-adds the nullable column; stored values are not restored).
     */
    public function down(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->string('location')->nullable();
        });
    }
};
