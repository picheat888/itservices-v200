<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Record why a contract was cancelled (captured + required at cancel time). */
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->text('cancel_reason')->nullable()->after('expired_at');
        });
    }

    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropColumn('cancel_reason');
        });
    }
};
