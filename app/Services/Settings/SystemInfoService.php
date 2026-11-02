<?php

// Settings → System "About this system": release, build time and the PHP, Laravel and database versions in use.

namespace App\Services\Settings;

use App\Support\AppVersion;
use Illuminate\Support\Facades\DB;

class SystemInfoService
{
    /** @return array{version: string, built_at: ?string, php: string, laravel: string, database: string} */
    public function payload(): array
    {
        $connection = DB::connection();

        return [
            'version' => AppVersion::number(),
            'built_at' => AppVersion::builtAt(),
            'php' => PHP_VERSION,
            'laravel' => app()->version(),
            'database' => trim($connection->getDriverTitle().' '.$connection->getServerVersion()),
        ];
    }
}
