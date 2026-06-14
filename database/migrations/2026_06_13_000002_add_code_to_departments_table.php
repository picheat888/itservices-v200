<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add the column first (no inline ->unique(): chaining it onto an
        // add-column on MariaDB can attach the index to the wrong column).
        Schema::table('departments', function (Blueprint $table) {
            $table->string('code')->nullable()->after('id');
        });

        // Backfill existing departments with sequential DEP-#### codes (by id).
        $n = 0;
        foreach (DB::table('departments')->orderBy('id')->pluck('id') as $id) {
            $n++;
            DB::table('departments')->where('id', $id)->update([
                'code' => 'DEP-'.str_pad((string) $n, 4, '0', STR_PAD_LEFT),
            ]);
        }

        // Now add the unique index on the populated, distinct values. The default
        // "departments_code_unique" name is free again because the rename
        // migration moved the old index to "departments_tag_unique".
        Schema::table('departments', function (Blueprint $table) {
            $table->unique('code');
        });
    }

    public function down(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->dropUnique(['code']);
            $table->dropColumn('code');
        });
    }
};
