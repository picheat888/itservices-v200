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
        Schema::table('employees', function (Blueprint $table) {
            // Column may already exist if the sections table was created in the same batch;
            // add it only when absent so the migration is idempotent.
            if (! Schema::hasColumn('employees', 'section_id')) {
                $table->foreignId('section_id')->nullable()->after('department_id')
                    ->constrained('sections')->nullOnDelete();
            } else {
                // Column exists but FK was not yet added — add the constraint only.
                $table->foreign('section_id')->references('id')->on('sections')->nullOnDelete();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropConstrainedForeignId('section_id');
        });
    }
};
