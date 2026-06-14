<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Split a combined full name into [first, rest] on the first whitespace run. */
    private function split(?string $full): array
    {
        $full = trim((string) $full);
        if ($full === '') {
            return ['', ''];
        }
        $parts = preg_split('/\s+/', $full, 2);

        return [$parts[0] ?? '', $parts[1] ?? ''];
    }

    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('first_name')->nullable()->after('code');
            $table->string('last_name')->nullable()->after('first_name');
            $table->string('first_name_th')->nullable()->after('last_name');
            $table->string('last_name_th')->nullable()->after('first_name_th');
        });

        // Backfill from the existing combined name / name_th (split on first space).
        foreach (DB::table('employees')->select('id', 'name', 'name_th')->get() as $e) {
            [$fn, $ln] = $this->split($e->name);
            [$fnTh, $lnTh] = $this->split($e->name_th);
            DB::table('employees')->where('id', $e->id)->update([
                'first_name' => $fn,
                'last_name' => $ln,
                'first_name_th' => $fnTh !== '' ? $fnTh : null,
                'last_name_th' => $lnTh !== '' ? $lnTh : null,
            ]);
        }

        Schema::table('employees', function (Blueprint $table) {
            $table->dropIndex('emp_name_idx');           // index was on `name`
            $table->dropColumn(['name', 'name_th']);
            $table->index(['first_name', 'last_name'], 'emp_name_idx');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('name')->nullable()->after('code');
            $table->string('name_th')->nullable()->after('name');
        });

        // Recombine first/last back into the single name / name_th columns.
        foreach (DB::table('employees')->select('id', 'first_name', 'last_name', 'first_name_th', 'last_name_th')->get() as $e) {
            $name = trim(($e->first_name ?? '').' '.($e->last_name ?? ''));
            $nameTh = trim(($e->first_name_th ?? '').' '.($e->last_name_th ?? ''));
            DB::table('employees')->where('id', $e->id)->update([
                'name' => $name,
                'name_th' => $nameTh !== '' ? $nameTh : null,
            ]);
        }

        Schema::table('employees', function (Blueprint $table) {
            $table->dropIndex('emp_name_idx');           // index was on first/last
            $table->dropColumn(['first_name', 'last_name', 'first_name_th', 'last_name_th']);
            $table->index('name', 'emp_name_idx');
        });
    }
};
