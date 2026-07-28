<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One-time data fix for the switch from stored-UTC to local wall time
 * (APP_TIMEZONE=Asia/Bangkok): every datetime/timestamp value written before the
 * switch was a UTC instant, so shift it +7h to become the same instant expressed
 * in Bangkok time. Runs only on MariaDB/MySQL — the sqlite test database is
 * always freshly seeded under the new convention and has nothing to shift.
 *
 * DATE columns are left alone (they carry no time-of-day), as is the framework's
 * migrations bookkeeping table.
 */
return new class extends Migration
{
    /** Tables whose rows must not be touched (framework bookkeeping). */
    private const SKIP_TABLES = ['migrations'];

    public function up(): void
    {
        $this->shiftAll('+ INTERVAL 7 HOUR');
    }

    public function down(): void
    {
        $this->shiftAll('- INTERVAL 7 HOUR');
    }

    /** Applies the interval to every datetime/timestamp column of every app table. */
    private function shiftAll(string $interval): void
    {
        if (! in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        $columns = DB::select(
            "SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND DATA_TYPE IN ('datetime', 'timestamp')
             ORDER BY TABLE_NAME, ORDINAL_POSITION"
        );

        foreach ($columns as $col) {
            if (in_array($col->table_name, self::SKIP_TABLES, true)) {
                continue;
            }

            DB::statement(sprintf(
                'UPDATE `%s` SET `%s` = `%s` %s WHERE `%s` IS NOT NULL',
                $col->table_name,
                $col->column_name,
                $col->column_name,
                $interval,
                $col->column_name,
            ));
        }
    }
};
