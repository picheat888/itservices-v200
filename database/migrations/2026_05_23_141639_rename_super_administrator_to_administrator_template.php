<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('roles')
            ->where('key', 'super')
            ->update(['name' => 'Administrator Template']);
    }

    public function down(): void
    {
        DB::table('roles')
            ->where('key', 'super')
            ->update(['name' => 'Super Administrator']);
    }
};
