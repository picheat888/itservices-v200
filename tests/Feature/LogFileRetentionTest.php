<?php

namespace Tests\Feature;

use App\Support\LogSource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

// Log files are dated per day in their own folder; logs:prune deletes those past logging.retention_days.
class LogFileRetentionTest extends TestCase
{
    use RefreshDatabase;

    private function touchFile(string $folder, string $name): string
    {
        File::ensureDirectoryExists("{$this->logRoot}/{$folder}");
        $path = "{$this->logRoot}/{$folder}/{$name}";
        File::put($path, 'x');

        return $path;
    }

    public function test_files_past_ninety_days_are_deleted_and_the_rest_are_kept(): void
    {
        $date = fn (int $daysAgo) => now()->subDays($daysAgo)->toDateString();

        $expired = [
            $this->touchFile('backend', 'backend-'.$date(91).'.log'),
            $this->touchFile('frontend', 'frontend-'.$date(120).'.log'),
            $this->touchFile('digest', 'digest-'.$date(100).'.md'),
        ];
        $kept = [
            $this->touchFile('backend', 'backend-'.$date(90).'.log'),
            $this->touchFile('queue', 'queue-'.$date(1).'.log'),
            $this->touchFile('backend', 'emergency.log'),
        ];

        $this->artisan('logs:prune')->expectsOutputToContain('log files: 3')->assertSuccessful();

        foreach ($expired as $path) {
            $this->assertFileDoesNotExist($path);
        }
        foreach ($kept as $path) {
            $this->assertFileExists($path);
        }
    }

    public function test_zero_days_keeps_every_file(): void
    {
        config(['logging.retention_days' => 0]);
        $path = $this->touchFile('schedule', 'schedule-'.now()->subYears(2)->toDateString().'.log');

        $this->artisan('logs:prune')->assertSuccessful();

        $this->assertFileExists($path);
    }

    public function test_each_process_writes_to_its_own_folder(): void
    {
        $argv = $_SERVER['argv'];

        try {
            $_SERVER['argv'] = ['artisan', 'queue:work'];
            $this->assertSame(LogSource::QUEUE, LogSource::current());

            $_SERVER['argv'] = ['artisan', 'contracts:send-expiry-alerts'];
            $this->assertSame(LogSource::SCHEDULE, LogSource::current());
        } finally {
            $_SERVER['argv'] = $argv;
        }

        Log::channel('source')->warning('routed by source');

        $this->assertStringContainsString(
            'routed by source',
            (string) File::get("{$this->logRoot}/schedule/schedule-".now()->toDateString().'.log'),
        );
    }
}
