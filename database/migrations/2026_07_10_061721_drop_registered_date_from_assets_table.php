<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "Registered" means when the asset was created in this system, which is exactly
     * what created_at records — so registered_date was redundant (and was being
     * backdated to the purchase date, duplicating purchase_date). Drop it; the API's
     * registered_date field now derives from created_at.
     */
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn('registered_date');
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->date('registered_date')->nullable();
        });
    }
};
