<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_item_serial_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_item_serial_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stock_item_id')->constrained()->cascadeOnDelete();
            $table->string('event', 20); // received|issued|adjusted|transferred|returned
            $table->foreignId('stock_movement_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reference', 60)->nullable();
            $table->string('warehouse', 120)->nullable();
            $table->string('from_label', 120)->nullable();
            $table->string('to_label', 120)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('recorded_by', 120)->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();
            $table->index(['stock_item_id', 'occurred_at']);
        });

        // Backfill: every existing serial gets a 'received' event; non-in_stock serials
        // additionally get a best-effort exit event (movement link unknown for legacy rows).
        foreach (DB::table('stock_item_serials')->orderBy('id')->get() as $s) {
            DB::table('stock_item_serial_events')->insert([
                'stock_item_serial_id' => $s->id,
                'stock_item_id' => $s->stock_item_id,
                'event' => 'received',
                'stock_movement_id' => $s->stock_movement_id,
                'reference' => $s->reference,
                'warehouse' => $s->warehouse,
                'occurred_at' => $s->received_at ?? $s->created_at ?? now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if ($s->status !== 'in_stock') {
                DB::table('stock_item_serial_events')->insert([
                    'stock_item_serial_id' => $s->id,
                    'stock_item_id' => $s->stock_item_id,
                    'event' => $s->status, // 'issued' or 'adjusted'
                    'reference' => $s->reference,
                    'warehouse' => $s->warehouse,
                    'occurred_at' => $s->updated_at ?? now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_item_serial_events');
    }
};
