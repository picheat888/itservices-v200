<?php

namespace Tests\Feature\Perf;

use App\Console\Commands\PerfGenerate;
use App\Support\Perf\Clock;
use App\Support\Perf\PerfContext;
use App\Support\Perf\PerfStep;
use App\Support\Perf\Registry;
use App\Support\Perf\Rng;
use App\Support\Perf\SqlWriter;
use App\Support\Perf\Targets;
use Carbon\CarbonImmutable;
use Illuminate\Database\Connection;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use RuntimeException;

// Test helper: runs perf steps into a temp file and imports it into a second in-memory sqlite database
class PerfImport
{
    public static function context(string $file, float $scale = 0.1, int $seed = 1): PerfContext
    {
        return new PerfContext(
            new SqlWriter($file, 'sqlite'),
            new Rng($seed),
            new Clock(CarbonImmutable::parse('2026-10-16 08:00:00')),
            new Registry,
            new Targets($scale),
            DB::getDefaultConnection(),
        );
    }

    /** @param list<class-string<PerfStep>> $steps */
    public static function run(array $steps, float $scale = 0.1, int $seed = 1): array
    {
        $file = sys_get_temp_dir().DIRECTORY_SEPARATOR.'perf_'.uniqid().'.sql';
        $ctx = self::context($file, $scale, $seed);
        foreach ($steps as $step) {
            (new $step)->run($ctx);
        }
        $ctx->sql->close();

        return [$ctx, self::into($file)];
    }

    // Every step the command knows, in order, up to and including $last
    /** @return list<class-string<PerfStep>> */
    public static function stepsUpTo(string $last): array
    {
        $steps = [];
        foreach (PerfGenerate::STEPS as $step) {
            $steps[] = $step;
            if ($step === $last) {
                break;
            }
        }

        return $steps;
    }

    public static function into(string $file): Connection
    {
        config(['database.connections.perf_sqlite' => [
            'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => false,
        ]]);
        DB::purge('perf_sqlite');
        Artisan::call('migrate', ['--database' => 'perf_sqlite', '--force' => true]);
        $db = DB::connection('perf_sqlite');
        try {
            $db->unprepared(file_get_contents($file));
        } catch (QueryException $e) {
            // The exception message embeds the whole file; keep only the driver's own words
            throw new RuntimeException('Import failed: '.substr($e->getPrevious()?->getMessage() ?? $e->getMessage(), 0, 400));
        }

        return $db;
    }
}
