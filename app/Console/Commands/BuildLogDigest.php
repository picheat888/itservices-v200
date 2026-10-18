<?php

namespace App\Console\Commands;

use App\Services\Settings\LogDigestService;
use Illuminate\Console\Command;

/** Writes the weekly log digest (logs/digest) to hand to Claude for analysis. */
class BuildLogDigest extends Command
{
    protected $signature = 'logs:digest {--days=7 : How many days back, today included}';

    protected $description = 'Summarise errors, system health and usage into one masked Markdown file';

    public function handle(LogDigestService $service): int
    {
        $path = $service->write((int) $this->option('days'));
        $this->info("Digest written: {$path}");

        return self::SUCCESS;
    }
}
