<?php

namespace Tests\Feature\Perf;

use App\Support\Perf\Targets;
use Tests\TestCase;

// Feature tests for the perf:generate command skeleton and its targets
class PerfGenerateCommandTest extends TestCase
{
    public function test_command_writes_a_file_and_reports_counts(): void
    {
        $out = sys_get_temp_dir().DIRECTORY_SEPARATOR.'perf_cmd_'.uniqid().'.sql';

        $this->artisan('perf:generate', ['--out' => $out, '--scale' => 0.01])->assertSuccessful();

        $this->assertFileExists($out);
        $this->assertSame('itservices_perf', config('database.connections.perf.database'));
    }

    public function test_default_scale_targets_match_spec(): void
    {
        $t = new Targets(1.0);
        $this->assertSame(60000, $t->of('tickets'));
        $this->assertSame(24000, $t->of('service_requests'));
        $this->assertSame(25000, $t->of('stock_movements'));
        $this->assertSame(300000, $t->of('audit_logs'));
        $this->assertSame(15, $t->fixed('departments'));
        $this->assertSame(1, (new Targets(0.01))->of('stock_counts'));
    }
}
