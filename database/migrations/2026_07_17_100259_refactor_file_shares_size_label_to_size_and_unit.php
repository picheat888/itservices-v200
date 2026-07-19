<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Split the free-text `size_label` ("5000 GB" / "Unlimited") into a numeric
     * `size` (INT) + `size_unit` (VARCHAR) so the value can be used in reports.
     * Convention: size 0 = unlimited (unit null), size null = unspecified.
     *
     * Written idempotently: on a fresh DB it adds the columns, backfills from the
     * old label and drops it; on an environment where the split was already applied
     * by hand each guarded step is skipped, so `migrate` just records the file.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('file_shares', 'size')) {
            Schema::table('file_shares', function (Blueprint $table) {
                // int(11) signed — matches the column set up on the live DB.
                $table->integer('size')->nullable()->after('department_id');
            });
        }
        if (! Schema::hasColumn('file_shares', 'size_unit')) {
            Schema::table('file_shares', function (Blueprint $table) {
                $table->string('size_unit', 10)->nullable()->after('size');
            });
        }

        if (Schema::hasColumn('file_shares', 'size_label')) {
            foreach (DB::table('file_shares')->get(['id', 'size_label']) as $row) {
                [$size, $unit] = $this->parseLabel($row->size_label);
                DB::table('file_shares')->where('id', $row->id)->update(['size' => $size, 'size_unit' => $unit]);
            }
            Schema::table('file_shares', function (Blueprint $table) {
                $table->dropColumn('size_label');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('file_shares', 'size_label')) {
            Schema::table('file_shares', function (Blueprint $table) {
                $table->string('size_label')->nullable()->after('department_id');
            });
            foreach (DB::table('file_shares')->get(['id', 'size', 'size_unit']) as $row) {
                $label = $row->size === null ? null : ((int) $row->size === 0 ? 'Unlimited' : trim($row->size.' '.($row->size_unit ?? '')));
                DB::table('file_shares')->where('id', $row->id)->update(['size_label' => $label]);
            }
        }

        Schema::table('file_shares', function (Blueprint $table) {
            foreach (['size', 'size_unit'] as $col) {
                if (Schema::hasColumn('file_shares', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }

    /**
     * Turn a stored label into a [size, unit] pair.
     *
     * @return array{0: int|null, 1: string|null}
     */
    private function parseLabel(?string $label): array
    {
        $label = trim((string) $label);
        if ($label === '') {
            return [null, null];
        }
        if (strcasecmp($label, 'Unlimited') === 0) {
            return [0, null];
        }
        if (preg_match('/^(\d+)(?:\.\d+)?\s*([A-Za-z]+)?$/', $label, $m)) {
            return [(int) $m[1], $m[2] ?? null];
        }

        return [null, null];
    }
};
