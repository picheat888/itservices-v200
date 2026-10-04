<?php

use App\Models\Employee\Employee;
use App\Models\Stock\StockItem;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * created_by / updated_by (users FK, null if the account is deleted) on employees, stock items and the
 * master data: the Master Data tab (brands, asset models, categories, vendors, warehouses, locations,
 * units, warranty types) and the org structure (departments, positions, sections). Set by
 * App\Models\Concerns\RecordsActors, as on assets and contracts.
 *
 * Existing rows are filled from the audit log only where it names the record: an employee's code in
 * brackets ("Wichai Srisawat (EMP-1041)"), a stock item's SKU first ("SKU-0000025 ×2"). The latest such
 * entry by a person sets updated_by and the first create entry sets created_by; those entries also get
 * their subject_type / subject_id. Rows the log never mentions (seeded or imported ones) stay null.
 */
return new class extends Migration
{
    /** Tables that gain the two columns. */
    private const TABLES = [
        'employees', 'stock_items',
        'brands', 'asset_models', 'categories', 'vendors', 'warehouses', 'locations', 'units', 'warranty_types',
        'departments', 'positions', 'sections',
    ];

    /** Audit actions that change one employee row, its code in brackets at the end of the target. */
    private const EMPLOYEE_ACTIONS = ['Created employee', 'Updated employee', 'Recorded resignation', 'Changed username', 'Created user account'];

    /** Audit actions that change one stock item row, its SKU first in the target. */
    private const STOCK_ITEM_ACTIONS = ['Created stock item', 'Updated stock item', 'Stock receive', 'Stock return', 'Stock transfer'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->foreignId('created_by')->nullable()->after('updated_at')->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            });
        }

        $this->backfill();
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->dropConstrainedForeignId('created_by');
                $table->dropConstrainedForeignId('updated_by');
            });
        }
    }

    private function backfill(): void
    {
        $users = DB::table('users')->pluck('id')->flip();
        $employees = DB::table('employees')->pluck('id', 'code');
        $items = DB::table('stock_items')->pluck('id', 'sku');
        $logs = DB::table('audit_logs')
            ->whereIn('action', [...self::EMPLOYEE_ACTIONS, ...self::STOCK_ITEM_ACTIONS])
            ->orderBy('id')
            ->get(['id', 'user_id', 'action', 'target']);

        $stamps = ['employees' => [], 'stock_items' => []];
        $subjects = ['employees' => [], 'stock_items' => []];
        foreach ($logs as $log) {
            $target = (string) $log->target;
            if (in_array($log->action, self::EMPLOYEE_ACTIONS, true)) {
                $table = 'employees';
                $id = preg_match('/\(([^()]+)\)\s*$/', $target, $m) ? ($employees[$m[1]] ?? null) : null;
            } else {
                $table = 'stock_items';
                $id = $items[strtok($target, ' ') ?: ''] ?? null;
            }
            if ($id === null) {
                continue;
            }

            $subjects[$table][$id][] = $log->id;
            if ($log->user_id === null || ! $users->has($log->user_id)) {
                continue;
            }
            $row = &$stamps[$table][$id];
            if (str_starts_with($log->action, 'Created ')) {
                $row['created_by'] ??= $log->user_id;
            }
            $row['updated_by'] = $log->user_id;
            unset($row);
        }

        $types = ['employees' => Relation::getMorphAlias(Employee::class), 'stock_items' => Relation::getMorphAlias(StockItem::class)];
        foreach ($stamps as $table => $rows) {
            foreach ($rows as $id => $values) {
                DB::table($table)->where('id', $id)->update($values);
            }
        }
        foreach ($subjects as $table => $byRecord) {
            foreach ($byRecord as $id => $logIds) {
                DB::table('audit_logs')->whereIn('id', $logIds)->whereNull('subject_type')
                    ->update(['subject_type' => $types[$table], 'subject_id' => $id]);
            }
        }
    }
};
