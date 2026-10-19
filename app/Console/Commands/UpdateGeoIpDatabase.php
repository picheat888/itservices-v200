<?php

// Monthly download of the DB-IP City Lite database for DbIpLookup; on any failure the current file stays in place.

namespace App\Console\Commands;

use App\Services\Auth\DbIpLookup;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class UpdateGeoIpDatabase extends Command
{
    private const URL = 'https://download.db-ip.com/free/dbip-city-lite-%s.mmdb.gz';

    private const CONNECT_TIMEOUT_SECONDS = 30;

    private const DOWNLOAD_TIMEOUT_SECONDS = 600;

    private const CHUNK_BYTES = 1048576;

    private const RENAME_ATTEMPTS = 5;

    private const RENAME_WAIT_MICROSECONDS = 200000;

    protected $signature = 'geoip:update';

    protected $description = 'Download the monthly DB-IP City Lite database used to name where a sign-in came from';

    /** When the installed database file was last replaced; null when there is none. */
    public static function lastUpdated(): ?CarbonImmutable
    {
        $path = DbIpLookup::databasePath();
        clearstatcache(true, $path);
        $modified = is_file($path) ? filemtime($path) : false;

        return $modified === false ? null : CarbonImmutable::createFromTimestamp($modified, config('app.timezone'));
    }

    public function handle(): int
    {
        $target = DbIpLookup::databasePath();
        $suffix = bin2hex(random_bytes(4));
        $archive = "{$target}.{$suffix}.gz.tmp";
        $database = "{$target}.{$suffix}.tmp";

        try {
            File::ensureDirectoryExists(dirname($target));
            $month = $this->download($archive);
            $this->decompress($archive, $database);
            $this->install($database, $target);
        } catch (Throwable $error) {
            Log::error('geoip:update failed, the current database file was kept', ['reason' => $error->getMessage()]);
            $this->error('GeoIP update failed: '.$error->getMessage());

            return self::FAILURE;
        } finally {
            File::delete([$archive, $database]);
        }

        $this->info("GeoIP database updated to {$month}.");

        return self::SUCCESS;
    }

    // Saves this month's archive, or last month's when DB-IP has not published yet; returns the month used
    private function download(string $archive): string
    {
        $months = [now()->format('Y-m'), now()->subMonthNoOverflow()->format('Y-m')];

        foreach ($months as $month) {
            $url = sprintf(self::URL, $month);
            $response = Http::connectTimeout(self::CONNECT_TIMEOUT_SECONDS)
                ->timeout(self::DOWNLOAD_TIMEOUT_SECONDS)
                ->sink($archive)
                ->get($url);

            if ($response->status() === 404) {
                continue;
            }
            if (! $response->successful()) {
                throw new RuntimeException("DB-IP answered {$response->status()} for {$url}");
            }

            return $month;
        }

        throw new RuntimeException('DB-IP has no database for this month or last month');
    }

    // Streams the gzip archive into a temp database file; a partial or corrupt archive is an error
    private function decompress(string $archive, string $database): void
    {
        $input = fopen($archive, 'rb');
        $output = fopen($database, 'wb');
        if ($input === false || $output === false) {
            throw new RuntimeException('Could not open the temporary files');
        }

        try {
            $inflate = inflate_init(ZLIB_ENCODING_GZIP);
            $total = 0;

            while (! feof($input)) {
                $chunk = fread($input, self::CHUNK_BYTES);
                if ($chunk === false) {
                    throw new RuntimeException('Could not read the downloaded archive');
                }
                if ($chunk === '') {
                    break;
                }

                $data = inflate_add($inflate, $chunk, ZLIB_SYNC_FLUSH);
                if ($data === false) {
                    throw new RuntimeException('The downloaded archive is corrupt');
                }
                if (fwrite($output, $data) !== strlen($data)) {
                    throw new RuntimeException('Could not write the database file');
                }
                $total += strlen($data);
            }

            if (inflate_get_status($inflate) !== ZLIB_STREAM_END) {
                throw new RuntimeException('The downloaded archive is incomplete');
            }
            if ($total === 0) {
                throw new RuntimeException('The downloaded archive is empty');
            }
        } finally {
            fclose($input);
            fclose($output);
        }
    }

    // A request may hold the current file open, so a failed rename is retried briefly
    private function install(string $database, string $target): void
    {
        for ($attempt = 1; $attempt <= self::RENAME_ATTEMPTS; $attempt++) {
            if (@rename($database, $target)) {
                return;
            }
            if ($attempt < self::RENAME_ATTEMPTS) {
                usleep(self::RENAME_WAIT_MICROSECONDS);
            }
        }

        throw new RuntimeException("Could not replace {$target}");
    }
}
