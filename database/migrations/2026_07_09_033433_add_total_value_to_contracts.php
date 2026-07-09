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
        Schema::table('contracts', function (Blueprint $table) {
            // Manually-entered whole-contract total (vendors quote totals that
            // aren't always value x cycles), nullable — optional per contract.
            $table->decimal('total_value', 15, 2)->nullable()->after('value');
        });
    }

    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropColumn('total_value');
        });
    }
};
