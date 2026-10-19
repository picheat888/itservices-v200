<?php

// Flags test sends logged before email_logs.is_test existed, by the marks their subjects carry.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('email_logs')
            ->where('is_test', false)
            ->where(fn ($q) => $q
                ->where('subject', 'like', '% (test __:__)')
                ->orWhere(fn ($smtp) => $smtp->whereNull('template_key')->where('subject', 'like', '%Test email')))
            ->update(['is_test' => true]);
    }

    public function down(): void
    {
        // The flag is not unset: the subjects still say these were tests
    }
};
