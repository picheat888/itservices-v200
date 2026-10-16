<?php

namespace App\Console\Commands;

use App\Support\Perf\Access;
use App\Support\Perf\Assets;
use App\Support\Perf\Clock;
use App\Support\Perf\Copy;
use App\Support\Perf\Logs;
use App\Support\Perf\Org;
use App\Support\Perf\PerfContext;
use App\Support\Perf\PerfStep;
use App\Support\Perf\Registry;
use App\Support\Perf\Requests;
use App\Support\Perf\Rng;
use App\Support\Perf\SqlWriter;
use App\Support\Perf\Stock;
use App\Support\Perf\Targets;
use App\Support\Perf\Tickets;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

// Writes the three-year performance dataset as one .sql file for the itservices_perf database
class PerfGenerate extends Command
{
    protected $signature = 'perf:generate {--seed=20261016} {--out=} {--scale=1.0} {--end=2026-10-16 08:00} {--dialect=}';

    protected $description = 'Generate the 3-year performance dataset as a .sql file';

    /** @var list<class-string<PerfStep>> */
    public const STEPS = [Copy::class, Org::class, Assets::class, Stock::class, Access::class, Requests::class, Tickets::class, Logs::class];

    public function handle(): int
    {
        $started = microtime(true);
        $out = $this->option('out') ?: storage_path('perf/itservices_perf.sql');
        $dialect = $this->option('dialect') ?: (DB::connection()->getDriverName() === 'sqlite' ? 'sqlite' : 'mariadb');

        $sql = new SqlWriter($out, $dialect);
        $ctx = new PerfContext(
            $sql,
            new Rng((int) $this->option('seed')),
            new Clock(CarbonImmutable::parse($this->option('end'))),
            new Registry,
            new Targets((float) $this->option('scale')),
            DB::getDefaultConnection(),
        );

        foreach (self::STEPS as $step) {
            $this->components->task($step, fn () => (new $step)->run($ctx));
        }
        $sql->close();

        $this->table(['table', 'rows'], collect($sql->counts())->map(fn (int $n, string $t): array => [$t, number_format($n)])->values()->all());
        $this->info(sprintf('%s rows in %s (%.1fs)', number_format(array_sum($sql->counts())), $out, microtime(true) - $started));

        return self::SUCCESS;
    }
}
