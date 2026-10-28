<?php

namespace Tests\Feature;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

// cache:prune-expired deletes the database cache rows and locks whose time has passed; live ones stay.
class CachePruneTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'database']);
    }

    private function row(string $table, string $key, int $expiresIn): void
    {
        $values = $table === 'cache'
            ? ['key' => $key, 'value' => 'x', 'expiration' => time() + $expiresIn]
            : ['key' => $key, 'owner' => 'o', 'expiration' => time() + $expiresIn];
        DB::table($table)->insert($values);
    }

    public function test_expired_cache_rows_and_locks_are_deleted_and_live_ones_kept(): void
    {
        $this->row('cache', 'old-1', -60);
        $this->row('cache', 'old-2', -86400);
        $this->row('cache', 'live', 600);
        $this->row('cache_locks', 'old-lock', -60);
        $this->row('cache_locks', 'live-lock', 600);

        $this->artisan('cache:prune-expired')->assertSuccessful();

        $this->assertSame(['live'], DB::table('cache')->pluck('key')->all());
        $this->assertSame(['live-lock'], DB::table('cache_locks')->pluck('key')->all());
    }

    public function test_another_cache_store_is_left_alone(): void
    {
        config(['cache.default' => 'array']);
        $this->row('cache', 'old', -60);

        $this->artisan('cache:prune-expired')->assertSuccessful();

        $this->assertSame(1, DB::table('cache')->count());
    }

    public function test_it_runs_every_night(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($event) => str_contains((string) $event->command, 'cache:prune-expired'));

        $this->assertCount(1, $events);
        $this->assertSame('30 2 * * *', $events->first()->expression);
    }
}
