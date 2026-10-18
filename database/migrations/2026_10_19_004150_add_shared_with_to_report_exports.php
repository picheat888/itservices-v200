<?php

// A scheduled run's file is kept as an export of its owner; shared_with lists the recipients
// (account emails) who may also open it from the emailed download link.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('report_exports', function (Blueprint $table) {
            $table->json('shared_with')->nullable()->after('columns');
        });
    }

    public function down(): void
    {
        Schema::table('report_exports', function (Blueprint $table) {
            $table->dropColumn('shared_with');
        });
    }
};
