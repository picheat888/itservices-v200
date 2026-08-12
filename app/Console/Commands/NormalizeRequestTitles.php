<?php

namespace App\Console\Commands;

use App\Models\Request\ServiceRequest;
use App\Services\Request\RequestService;
use Illuminate\Console\Command;

/**
 * Rewrites `service_requests.title` on existing rows through the one rule that now owns it
 * (RequestService::canonicalTitle).
 *
 * The wizard used to compose the title in the requester's own UI language and post it, so
 * the same service is stored as "Request: Mail group" on one row and "คำขอ: กลุ่มเมล" on the
 * next. That column is read by the auto-ticket subject, the approval emails and the search
 * box, so until the old rows are normalized those three keep speaking whichever language
 * the filer happened to be using.
 *
 * Safe to re-run: the title is derived from the type and the origin, never from what was
 * stored, so a second pass changes nothing.
 */
class NormalizeRequestTitles extends Command
{
    protected $signature = 'requests:normalize-titles {--dry-run : Report what would change without writing}';

    protected $description = 'Rewrite request titles to the canonical server-composed form';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $changed = 0;
        $already = 0;

        foreach (ServiceRequest::orderBy('id')->cursor() as $request) {
            if ($request->type === null || $request->origin === null) {
                continue;
            }

            $title = RequestService::canonicalTitle($request->type, $request->origin, $request->requester_name);
            if ($title === $request->title) {
                $already++;

                continue;
            }

            $this->line("  {$request->reference}  {$request->title}  →  {$title}");
            $changed++;
            if (! $dry) {
                // Only this column: `updated_at` is left alone so a bulk rewrite does not read
                // as activity, the same reason last_activity_at exists.
                ServiceRequest::withoutTimestamps(fn () => $request->update(['title' => $title]));
            }
        }

        $this->components->twoColumnDetail('Titles rewritten', (string) $changed);
        $this->components->twoColumnDetail('Already canonical', (string) $already);
        if ($dry) {
            $this->components->info('Dry run - nothing was written.');
        }

        return self::SUCCESS;
    }
}
