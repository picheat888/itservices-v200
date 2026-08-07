<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Gives the Computer request's device list rows of its own.
 *
 * The two choices were hard-coded slugs ('laptop' / 'desktop'), so an all-in-one
 * or a workstation could only be added by editing PHP. The field is `managed` now
 * — same as Hardware and Mobile — and Settings → Request data edits it. This puts
 * the two existing choices in the table so the list is not empty on an install
 * that has already run the seeder.
 *
 * Requests filed under the old field keep their `fields.device` slug and their
 * `_display` snapshot, which is what the detail view reads — they still show the
 * device they asked for. Nothing is rewritten.
 */
return new class extends Migration
{
    private const OPTIONS = [
        ['label_en' => 'Laptop', 'label_th' => 'โน้ตบุ๊ก', 'sort_order' => 10],
        ['label_en' => 'Desktop PC', 'label_th' => 'คอมพิวเตอร์ตั้งโต๊ะ', 'sort_order' => 20],
    ];

    public function up(): void
    {
        foreach (self::OPTIONS as $option) {
            $exists = DB::table('request_options')
                ->where('request_type', 'computer')
                ->where('field_key', 'device_id')
                ->where('label_en', $option['label_en'])
                ->exists();

            if ($exists) {
                continue;
            }

            DB::table('request_options')->insert($option + [
                'request_type' => 'computer',
                'field_key' => 'device_id',
                'active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // Only the two seeded rows go; anything IT added since is theirs to keep,
        // and a row a request already references cannot be deleted anyway.
        DB::table('request_options')
            ->where('request_type', 'computer')
            ->where('field_key', 'device_id')
            ->whereIn('label_en', array_column(self::OPTIONS, 'label_en'))
            ->delete();
    }
};
