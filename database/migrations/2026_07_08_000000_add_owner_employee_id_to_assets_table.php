<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add a real FK to the employee who holds an asset so "held by an employee" is a
     * reliable fact, not a string guess. The existing `owner` string stays as a display
     * label. Backfill matches any `owner` value equal to an `employees.code` (shared
     * labels won't match and keep a null FK).
     */
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('owner_employee_id')->nullable()->after('owner')
                ->constrained('employees')->nullOnDelete();
        });

        // SQLite-safe correlated subquery (same idiom as the location→FK migration).
        DB::statement(
            'UPDATE assets SET owner_employee_id = (SELECT id FROM employees WHERE employees.code = assets.owner) '
            .'WHERE owner IS NOT NULL'
        );
    }

    /** Drop the FK column; the `owner` string already carries the display label. */
    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('owner_employee_id');
        });
    }
};
