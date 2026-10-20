<?php

// Hides the last 4 characters of names of 8 or more characters already saved for sign-ins that matched no account
// (a password typed into the username box would otherwise stay readable in the Login tab); new rows are masked as written.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const MASKED_TAIL = 4;

    private const MASK_FROM_LENGTH = 8;

    private const MASK = '••••';

    public function up(): void
    {
        DB::table('login_events')
            ->whereNull('user_id')
            ->whereNotNull('login_name')
            ->orderBy('id')
            ->chunkById(500, function ($rows) {
                foreach ($rows as $row) {
                    if (mb_strlen($row->login_name) < self::MASK_FROM_LENGTH || str_ends_with($row->login_name, self::MASK)) {
                        continue;
                    }
                    DB::table('login_events')->where('id', $row->id)->update(['login_name' => $this->masked($row->login_name)]);
                }
            });
    }

    public function down(): void
    {
        // The hidden characters are gone for good
    }

    private function masked(string $text): string
    {
        return mb_substr($text, 0, mb_strlen($text) - self::MASKED_TAIL).self::MASK;
    }
};
