<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Some purchased assets carry a lifetime warranty (no expiry date). This flag
     * distinguishes "covered forever" from "no warranty recorded" (warranty_end null).
     */
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->boolean('warranty_lifetime')->default(false)->after('warranty_end');
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn('warranty_lifetime');
        });
    }
};
