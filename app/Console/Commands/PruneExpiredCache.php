<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** Nightly sweep of database cache rows and locks past their expiration (the database store only drops one when it is read again). */
class PruneExpiredCache extends Command
{
    protected $signature = 'cache:prune-expired';

    protected $description = 'Delete expired rows from the database cache and cache lock tables';

    // Rows per delete, so one sweep never holds a long lock on the table
    private const CHUNK = 1000;

    public function handle(): int
    {
        $store = config('cache.stores.'.config('cache.default'));
        if (($store['driver'] ?? null) !== 'database') {
            $this->info('The cache store is not the database; nothing to prune.');

            return self::SUCCESS;
        }

        $table = $store['table'] ?? 'cache';
        $cache = $this->prune($store['connection'] ?? null, $table);
        $locks = $this->prune($store['lock_connection'] ?? $store['connection'] ?? null, $store['lock_table'] ?? $table.'_locks');

        $this->info("Pruned expired cache rows: {$cache}, locks: {$locks}");

        return self::SUCCESS;
    }

    private function prune(?string $connection, string $table): int
    {
        $now = time();
        $deleted = 0;

        do {
            $keys = DB::connection($connection)->table($table)
                ->where('expiration', '<=', $now)
                ->limit(self::CHUNK)
                ->pluck('key');
            // Expiration checked again: a key renewed since the read stays
            $deleted += $keys->isEmpty() ? 0 : DB::connection($connection)->table($table)
                ->whereIn('key', $keys)
                ->where('expiration', '<=', $now)
                ->delete();
        } while ($keys->count() === self::CHUNK);

        return $deleted;
    }
}
