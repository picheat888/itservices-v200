<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->timestamp('expired_at')->nullable()->after('cancelled_at');
            $table->dropColumn('auto_renew');
        });
    }

    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->boolean('auto_renew')->default(false)->after('billing_cycle');
            $table->dropColumn('expired_at');
        });
    }
};
