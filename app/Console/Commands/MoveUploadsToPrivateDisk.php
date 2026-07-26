<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * One-time migration: relocate sensitive uploads off the world-readable public
 * disk onto the private 'local' disk. Paths stored in the DB are unchanged (same
 * relative path, different disk) so no data migration is needed alongside this.
 *
 * Copies first, verifies, then removes the public copy — safe to re-run (already
 * migrated files are skipped). The 'branding' folder is intentionally left on the
 * public disk (login page + emails need it without authentication).
 */
class MoveUploadsToPrivateDisk extends Command
{
    protected $signature = 'files:privatize {--dry-run : List what would move without touching files}';

    protected $description = 'Move sensitive uploads (tickets, contracts, employees, logos) from the public disk to the private disk';

    /** Folders to relocate. branding/ stays public on purpose. */
    private const DIRS = ['tickets', 'contracts', 'employees', 'software-logos', 'social-logos'];

    public function handle(): int
    {
        $public = Storage::disk('public');
        $private = Storage::disk('local');
        $dry = (bool) $this->option('dry-run');
        $moved = 0;
        $skipped = 0;

        foreach (self::DIRS as $dir) {
            foreach ($public->allFiles($dir) as $path) {
                if ($private->exists($path)) {
                    $this->line("skip (already private): {$path}");
                    $skipped++;

                    continue;
                }
                if ($dry) {
                    $this->line("would move: {$path}");
                    $moved++;

                    continue;
                }

                $private->put($path, $public->get($path));
                // Only drop the public copy once the private copy is confirmed in place.
                if ($private->exists($path)) {
                    $public->delete($path);
                    $this->info("moved: {$path}");
                    $moved++;
                } else {
                    $this->error("FAILED to copy: {$path}");

                    return self::FAILURE;
                }
            }
        }

        $this->newLine();
        $this->info(($dry ? '[dry-run] ' : '')."done — {$moved} file(s) ".($dry ? 'to move' : 'moved').", {$skipped} skipped.");

        return self::SUCCESS;
    }
}
