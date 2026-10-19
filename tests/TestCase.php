<?php

namespace Tests;

use App\Support\LogSource;
use App\Support\NotificationCatalogue;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\File;

abstract class TestCase extends BaseTestCase
{
    /** Throwaway folder the test's log files go to, never storage/logs. */
    protected string $logRoot = '';

    /** Clears per-process statics that would leak between tests, and points logs at a temp folder. */
    protected function setUp(): void
    {
        parent::setUp();

        NotificationCatalogue::forgetSwitches();
        $this->useTemporaryLogRoot();
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->logRoot);

        parent::tearDown();
    }

    /** Seed mt_rand for a fixed data set once earlier tests' Faker generators are gone (each reseeds mt_rand at random when destroyed). */
    protected function seedRandom(int $seed): void
    {
        gc_collect_cycles();
        mt_srand($seed);
    }

    private function useTemporaryLogRoot(): void
    {
        $this->logRoot = sys_get_temp_dir().DIRECTORY_SEPARATOR.'itsd-test-logs-'.bin2hex(random_bytes(4));

        config(['logging.root' => $this->logRoot]);
        foreach ([LogSource::BACKEND, LogSource::QUEUE, LogSource::SCHEDULE, LogSource::FRONTEND] as $folder) {
            config(["logging.channels.{$folder}.path" => "{$this->logRoot}/{$folder}/{$folder}.log"]);
        }
        config([
            'logging.channels.single.path' => "{$this->logRoot}/laravel.log",
            'logging.channels.emergency.path' => "{$this->logRoot}/backend/emergency.log",
        ]);
    }
}
