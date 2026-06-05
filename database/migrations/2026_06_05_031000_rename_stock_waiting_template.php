<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('email_templates')
            ->where('key', 'stock.request_approval_needed')
            ->update(['name' => 'Stock - waiting approve & fulfill', 'updated_at' => now()]);
    }

    public function down(): void
    {
        DB::table('email_templates')
            ->where('key', 'stock.request_approval_needed')
            ->update(['name' => 'Stock - waiting approval', 'updated_at' => now()]);
    }
};
