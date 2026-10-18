<?php

namespace App\Services\Settings;

use App\Support\LogSource;
use Illuminate\Support\Facades\File;

// Deletes dated log and digest files older than logging.retention_days (run by logs:prune).
class LogFileRetentionService
{
    /** Number of files deleted. */
    public function prune(): int
    {
        $days = (int) config('logging.retention_days');
        if ($days <= 0) {
            return 0;
        }

        $cutoff = now()->startOfDay()->subDays($days)->toDateString();
        $deleted = 0;

        foreach (LogSource::FOLDERS as $folder) {
            $dir = LogSource::folder($folder);
            if (! File::isDirectory($dir)) {
                continue;
            }

            foreach (File::files($dir) as $file) {
                $date = $this->dateOf($file->getFilename());
                if ($date !== null && $date < $cutoff && File::delete($file->getPathname())) {
                    $deleted++;
                }
            }
        }

        return $deleted;
    }

    /** The YYYY-MM-DD at the end of a file name, or null for files that carry no date. */
    private function dateOf(string $fileName): ?string
    {
        return preg_match('/-(\d{4}-\d{2}-\d{2})\.(log|md)$/', $fileName, $match) === 1 ? $match[1] : null;
    }
}
