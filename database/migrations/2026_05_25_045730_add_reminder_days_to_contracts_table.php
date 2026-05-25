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
            $table->boolean('notify_150')->default(false)->after('auto_renew');
            $table->boolean('notify_120')->default(false)->after('notify_150');
            $table->boolean('notify_45')->default(false)->after('notify_60');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropColumn(['notify_150', 'notify_120', 'notify_45']);
        });
    }
};
