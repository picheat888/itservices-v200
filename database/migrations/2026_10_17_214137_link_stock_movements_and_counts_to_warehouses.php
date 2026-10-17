<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Links movements and counts to their warehouse by id (labels stay as the names of the day) and indexes moved_at.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->foreignId('from_warehouse_id')->nullable()->after('to_label')->constrained('warehouses')->nullOnDelete();
            $table->foreignId('to_warehouse_id')->nullable()->after('from_warehouse_id')->constrained('warehouses')->nullOnDelete();
            $table->index('moved_at');
            $table->index(['stock_item_id', 'moved_at']);
        });

        Schema::table('stock_counts', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable()->after('warehouse')->constrained('warehouses')->nullOnDelete();
        });

        // Backfill from the stored names; a label is a warehouse only on the side its type keeps one.
        $warehouses = DB::table('warehouses')->pluck('id', 'name');
        foreach ($warehouses as $name => $id) {
            DB::table('stock_movements')->whereIn('type', ['issue', 'transfer', 'adjust_down'])->where('from_label', $name)->update(['from_warehouse_id' => $id]);
            DB::table('stock_movements')->whereIn('type', ['receive', 'return', 'transfer', 'adjust_up'])->where('to_label', $name)->update(['to_warehouse_id' => $id]);
            DB::table('stock_counts')->where('warehouse', $name)->update(['warehouse_id' => $id]);
        }
    }

    public function down(): void
    {
        Schema::table('stock_counts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('warehouse_id');
        });

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropIndex(['stock_item_id', 'moved_at']);
            $table->dropIndex(['moved_at']);
            $table->dropConstrainedForeignId('to_warehouse_id');
            $table->dropConstrainedForeignId('from_warehouse_id');
        });
    }
};
