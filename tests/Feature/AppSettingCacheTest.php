<?php

namespace Tests\Feature;

use App\Models\Settings\AppSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * app_settings is read a key at a time by everything that renders a screen, and it
 * used to cost a SELECT per key — seventeen of them on /api/settings alone. The
 * table is a few dozen rows, so it is read once per request and answered from
 * memory after that.
 *
 * What the cache must never do is answer with a value that has been written over.
 */
class AppSettingCacheTest extends TestCase
{
    use RefreshDatabase;

    /** Counts the queries one closure runs. */
    private function queriesDuring(callable $work): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $work();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    public function test_reading_many_keys_costs_one_query(): void
    {
        AppSetting::put('company_name', 'ABCD Electric');
        AppSetting::put('currency', 'THB');
        AppSetting::put('brand_sub', 'Service Desk');
        AppSetting::flushCache();

        $queries = $this->queriesDuring(function () {
            AppSetting::get('company_name');
            AppSetting::get('currency');
            AppSetting::get('brand_sub');
            AppSetting::get('nothing_here', 'fallback');
        });

        $this->assertSame(1, $queries, 'the whole table is read once, not once per key');
    }

    public function test_a_written_value_is_read_back_not_the_cached_one(): void
    {
        AppSetting::put('company_name', 'Before');
        $this->assertSame('Before', AppSetting::get('company_name'));

        AppSetting::put('company_name', 'After');

        $this->assertSame('After', AppSetting::get('company_name'), 'a write invalidates what was cached');
    }

    public function test_a_key_that_does_not_exist_yet_is_found_once_it_is_written(): void
    {
        // The cache must not remember that a key was ABSENT — settings are created
        // on first save, so "not there" is a state that ends.
        $this->assertSame('fallback', AppSetting::get('late_key', 'fallback'));

        AppSetting::put('late_key', 'now here');

        $this->assertSame('now here', AppSetting::get('late_key', 'fallback'));
    }

    public function test_an_empty_stored_value_is_not_mistaken_for_a_missing_one(): void
    {
        // brand_name is stored as '' until somebody fills it in, and the caller is
        // the one that decides what an empty brand falls back to.
        AppSetting::put('brand_name', '');

        $this->assertSame('', AppSetting::get('brand_name', 'DEFAULT'));
    }
}
