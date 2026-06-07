<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class MailSettingSeeder extends Seeder
{
    /**
     * Ensure the single editable mail_settings row (id=1) exists so the
     * Settings → Email form always has a target. Empty values mean the app
     * falls back to the .env mail config until an admin fills it in.
     */
    public function run(): void
    {
        if (DB::table('mail_settings')->count() === 0) {
            DB::table('mail_settings')->insert([
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }
}
