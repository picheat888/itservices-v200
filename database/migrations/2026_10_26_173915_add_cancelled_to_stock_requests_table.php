<?php

// Stock requests can be cancelled: a "cancelled" status plus who cancelled and when.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_requests', function (Blueprint $table) {
            $table->enum('status', ['pending', 'approved', 'fulfilled', 'rejected', 'cancelled'])->default('pending')->change();
            $table->string('cancelled_by', 160)->nullable()->after('rejected_at');
            $table->dateTime('cancelled_at')->nullable()->after('cancelled_by');
        });
    }

    public function down(): void
    {
        DB::table('stock_requests')->where('status', 'cancelled')->update(['status' => 'rejected']);

        Schema::table('stock_requests', function (Blueprint $table) {
            $table->dropColumn(['cancelled_by', 'cancelled_at']);
            $table->enum('status', ['pending', 'approved', 'fulfilled', 'rejected'])->default('pending')->change();
        });
    }
};
