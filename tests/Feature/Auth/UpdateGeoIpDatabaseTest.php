<?php

// geoip:update installs the monthly DB-IP Lite file, keeps the old file on any failure, and is scheduled monthly.

namespace Tests\Feature\Auth;

use App\Console\Commands\UpdateGeoIpDatabase;
use App\Services\Auth\DbIpLookup;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class UpdateGeoIpDatabaseTest extends TestCase
{
    private string $storage;

    private string $folder;

    protected function setUp(): void
    {
        parent::setUp();

        $this->storage = sys_get_temp_dir().DIRECTORY_SEPARATOR.'itsd-geoip-'.bin2hex(random_bytes(4));
        $this->folder = $this->storage.DIRECTORY_SEPARATOR.'app'.DIRECTORY_SEPARATOR.'geoip';
        File::ensureDirectoryExists($this->storage);
        $this->app->useStoragePath($this->storage);

        $this->travelTo('2026-10-19 09:00:00');
        Log::spy();
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->storage);

        parent::tearDown();
    }

    public function test_it_installs_this_months_file(): void
    {
        Http::fake([$this->url('2026-10') => Http::response(gzencode('new database bytes'))]);

        $this->artisan('geoip:update')->assertExitCode(0);

        $this->assertSame('new database bytes', File::get(DbIpLookup::databasePath()));
        $this->assertSame([basename(DbIpLookup::databasePath())], $this->folderContents());
        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request->url() === $this->url('2026-10'));
    }

    public function test_it_replaces_an_existing_file(): void
    {
        $this->putOldFile();
        Http::fake([$this->url('2026-10') => Http::response(gzencode('new database bytes'))]);

        $this->artisan('geoip:update')->assertExitCode(0);

        $this->assertSame('new database bytes', File::get(DbIpLookup::databasePath()));
    }

    public function test_it_falls_back_to_last_month_on_404(): void
    {
        Http::fake([
            $this->url('2026-10') => Http::response('', 404),
            $this->url('2026-09') => Http::response(gzencode('last months bytes')),
        ]);

        $this->artisan('geoip:update')->assertExitCode(0);

        $this->assertSame('last months bytes', File::get(DbIpLookup::databasePath()));
        Http::assertSentCount(2);
    }

    public function test_the_fallback_crosses_the_year_boundary(): void
    {
        $this->travelTo('2027-01-02 09:00:00');
        Http::fake([
            $this->url('2027-01') => Http::response('', 404),
            $this->url('2026-12') => Http::response(gzencode('december bytes')),
        ]);

        $this->artisan('geoip:update')->assertExitCode(0);

        $this->assertSame('december bytes', File::get(DbIpLookup::databasePath()));
    }

    public function test_both_months_missing_keeps_the_old_file(): void
    {
        $this->putOldFile();
        Http::fake(['*' => Http::response('', 404)]);

        $this->artisan('geoip:update')->assertExitCode(1);

        $this->assertOldFileKept();
    }

    public function test_a_failed_download_keeps_the_old_file(): void
    {
        $this->putOldFile();
        Http::fake(['*' => Http::response('server error', 500)]);

        $this->artisan('geoip:update')->assertExitCode(1);

        $this->assertOldFileKept();
        Http::assertSentCount(1);
        Log::shouldHaveReceived('error')->once();
    }

    public function test_a_connection_error_keeps_the_old_file(): void
    {
        $this->putOldFile();
        Http::fake(['*' => Http::failedConnection()]);

        $this->artisan('geoip:update')->assertExitCode(1);

        $this->assertOldFileKept();
    }

    public function test_a_corrupt_archive_keeps_the_old_file(): void
    {
        $this->putOldFile();
        Http::fake(['*' => Http::response('this is not gzip data')]);

        $this->artisan('geoip:update')->assertExitCode(1);

        $this->assertOldFileKept();
    }

    public function test_a_truncated_archive_keeps_the_old_file(): void
    {
        $this->putOldFile();
        $archive = gzencode(str_repeat('database bytes ', 5000));
        Http::fake(['*' => Http::response(substr($archive, 0, (int) (strlen($archive) / 2)))]);

        $this->artisan('geoip:update')->assertExitCode(1);

        $this->assertOldFileKept();
    }

    public function test_an_empty_archive_keeps_the_old_file(): void
    {
        $this->putOldFile();
        Http::fake(['*' => Http::response(gzencode(''))]);

        $this->artisan('geoip:update')->assertExitCode(1);

        $this->assertOldFileKept();
    }

    public function test_a_rename_that_keeps_failing_leaves_no_temp_file(): void
    {
        File::ensureDirectoryExists(DbIpLookup::databasePath());
        File::put(DbIpLookup::databasePath().DIRECTORY_SEPARATOR.'blocker', 'x');
        Http::fake(['*' => Http::response(gzencode('new database bytes'))]);

        $this->artisan('geoip:update')->assertExitCode(1);

        $this->assertDirectoryExists(DbIpLookup::databasePath());
        $this->assertSame([basename(DbIpLookup::databasePath())], $this->folderContents());
    }

    public function test_last_updated_is_null_without_a_file_and_the_file_time_with_one(): void
    {
        $this->assertNull(UpdateGeoIpDatabase::lastUpdated());

        $this->putOldFile();
        touch(DbIpLookup::databasePath(), strtotime('2026-10-03 03:30:00 UTC'));
        clearstatcache();

        $updated = UpdateGeoIpDatabase::lastUpdated();

        $this->assertNotNull($updated);
        $this->assertSame(strtotime('2026-10-03 03:30:00 UTC'), $updated->getTimestamp());
    }

    public function test_it_is_scheduled_monthly(): void
    {
        Artisan::call('list');

        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($event) => str_contains($event->command ?? '', 'geoip:update'));

        $this->assertCount(1, $events);
        $this->assertSame('30 3 3 * *', $events->first()->expression);
        $this->assertTrue($events->first()->withoutOverlapping);
    }

    private function url(string $month): string
    {
        return "https://download.db-ip.com/free/dbip-city-lite-{$month}.mmdb.gz";
    }

    private function putOldFile(): void
    {
        File::ensureDirectoryExists($this->folder);
        File::put(DbIpLookup::databasePath(), 'old database bytes');
    }

    private function assertOldFileKept(): void
    {
        $this->assertSame('old database bytes', File::get(DbIpLookup::databasePath()));
        $this->assertSame([basename(DbIpLookup::databasePath())], $this->folderContents());
    }

    /** @return list<string> */
    private function folderContents(): array
    {
        return array_values(array_map(fn ($path) => basename($path), File::glob($this->folder.DIRECTORY_SEPARATOR.'*')));
    }
}
