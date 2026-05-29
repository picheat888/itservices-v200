<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('employee_id')->nullable()->unique()->after('id')
                ->constrained()->nullOnDelete();
        });

        // Backfill: link each existing account to the employee it matches by
        // username (preferred) then email, skipping employees already linked
        // so the unique constraint is never violated.
        foreach (DB::table('users')->whereNull('employee_id')->get() as $user) {
            $employeeId = null;
            if (! empty($user->username)) {
                $employeeId = DB::table('employees')->where('username', $user->username)->value('id');
            }
            if (! $employeeId && ! empty($user->email)) {
                $employeeId = DB::table('employees')->where('email', $user->email)->value('id');
            }
            if ($employeeId && ! DB::table('users')->where('employee_id', $employeeId)->exists()) {
                DB::table('users')->where('id', $user->id)->update(['employee_id' => $employeeId]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('employee_id');
        });
    }
};
