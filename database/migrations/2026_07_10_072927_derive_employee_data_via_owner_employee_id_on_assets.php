<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Stop duplicating employee data on the asset. An employee-owned asset now keeps
     * only the owner_employee_id FK — its owner code, name, department and position are
     * read from the employee. The `owner` string is reserved for shared / common-use
     * labels (no employee). The redundant department / initial_owner columns are dropped.
     */
    public function up(): void
    {
        // Backfill the FK from any owner string that matches an employee code…
        DB::statement(
            'UPDATE assets SET owner_employee_id = (SELECT id FROM employees WHERE employees.code = assets.owner) '
            .'WHERE owner_employee_id IS NULL AND owner IS NOT NULL'
        );
        // …then clear that now-redundant code string (kept only for shared labels).
        DB::table('assets')->whereNotNull('owner_employee_id')->update(['owner' => null]);

        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn(['department', 'initial_owner']);
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->string('department')->nullable();
            $table->string('initial_owner')->nullable();
        });
        // Re-snapshot the owner code back onto the string from the linked employee.
        DB::statement(
            'UPDATE assets SET owner = (SELECT code FROM employees WHERE employees.id = assets.owner_employee_id) '
            .'WHERE owner_employee_id IS NOT NULL'
        );
    }
};
