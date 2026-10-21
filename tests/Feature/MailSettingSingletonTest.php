<?php

namespace Tests\Feature;

use App\Models\Settings\MailSetting;
use Database\Seeders\MailSettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The SMTP settings live in one row, id 1, even when the table's id counter has already moved
 * past 1 (a deleted row, or an insert rolled back on MariaDB).
 */
class MailSettingSingletonTest extends TestCase
{
    use RefreshDatabase;

    public function test_saved_settings_are_read_back_after_the_id_counter_moved_on(): void
    {
        MailSetting::current()->delete();

        MailSetting::current()->update(['host' => 'smtp.example.com']);

        $this->assertSame('smtp.example.com', MailSetting::current()->host);
        $this->assertSame([1], MailSetting::query()->pluck('id')->all());
    }

    public function test_the_seeder_creates_the_row_as_id_1(): void
    {
        MailSetting::current()->delete();

        $this->seed(MailSettingSeeder::class);

        $this->assertSame([1], MailSetting::query()->pluck('id')->all());
    }
}
