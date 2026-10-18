<?php

namespace App\Support;

use Illuminate\Support\Facades\Log;
use Monolog\Logger;

// The `source` log channel: web requests write to logs/backend, queue workers to logs/queue,
// scheduled and other artisan commands to logs/schedule. Browser errors go to logs/frontend.
class LogSource
{
    public const BACKEND = 'backend';

    public const QUEUE = 'queue';

    public const SCHEDULE = 'schedule';

    public const FRONTEND = 'frontend';

    public const DIGEST = 'digest';

    /** Every folder under logging.root that holds dated files. */
    public const FOLDERS = [self::BACKEND, self::QUEUE, self::SCHEDULE, self::FRONTEND, self::DIGEST];

    /** @param  array<string, mixed>  $config */
    public function __invoke(array $config): Logger
    {
        /** @var \Illuminate\Log\Logger $channel */
        $channel = Log::channel(self::current());

        return $channel->getLogger();
    }

    /** The folder for the running process. */
    public static function current(): string
    {
        if (! app()->runningInConsole()) {
            return self::BACKEND;
        }

        $command = (string) ($_SERVER['argv'][1] ?? '');

        return str_starts_with($command, 'queue:') ? self::QUEUE : self::SCHEDULE;
    }

    /** Absolute path of a folder under logging.root. */
    public static function folder(string $name): string
    {
        return rtrim((string) config('logging.root'), '/\\').DIRECTORY_SEPARATOR.$name;
    }
}
