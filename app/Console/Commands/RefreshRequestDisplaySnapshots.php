<?php

namespace App\Console\Commands;

use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Support\RequestSchemas;
use Illuminate\Console\Command;

/**
 * Brings the `_display` snapshots on existing requests back in step with the schema —
 * the field LABELS and the Thai twin of a chosen value. Never the value itself.
 *
 * `_display` is written at submit time so a decided request always shows the words it was
 * decided on. That is right for the value (what the requester chose) and wrong for the
 * label and the language pair: those are our own copy. Shortening "Requested address" to
 * "Address", or adding value_th, otherwise leaves every earlier request quoting wording
 * the app no longer uses — two vocabularies on one screen.
 *
 * Re-runnable, and safe to run after any wording change in RequestSchemas.
 */
class RefreshRequestDisplaySnapshots extends Command
{
    protected $signature = 'requests:refresh-display {--dry-run : Report what would change without writing}';

    protected $description = 'Refresh field labels and Thai values in request display snapshots from the current schema';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $touched = 0;
        $labels = 0;
        $values = 0;
        $unresolved = [];

        foreach (ServiceRequest::all() as $request) {
            $fields = collect(RequestSchemas::for($request->type))->keyBy('key');
            $stored = $request->fields ?? [];
            $rows = $stored['_display'] ?? [];
            if ($rows === []) {
                continue;
            }

            $changed = false;
            foreach ($rows as $i => $row) {
                $field = $fields->get($row['key']);
                // A field the schema no longer has: its snapshot is the only record of what
                // was asked, so it is left exactly as it is.
                if ($field === null) {
                    $unresolved[] = "{$request->reference}: {$row['key']} (not in the schema any more)";

                    continue;
                }

                foreach (['label_en', 'label_th'] as $key) {
                    if (($row[$key] ?? null) !== $field[$key]) {
                        $rows[$i][$key] = $field[$key];
                        $changed = true;
                        $labels++;
                    }
                }

                if (($row['value_th'] ?? null) === null) {
                    $thai = $this->thaiValue($request, $field, (string) $row['value']);
                    // Written even when null, so a row that simply has no Thai form stops
                    // being re-examined on every future run.
                    $rows[$i]['value_th'] = $thai;
                    $changed = true;
                    if ($thai !== null) {
                        $values++;
                    }
                }
            }

            if (! $changed) {
                continue;
            }

            $touched++;
            if (! $dry) {
                $stored['_display'] = $rows;
                $request->update(['fields' => $stored]);
            }
        }

        $this->components->twoColumnDetail('Requests touched', (string) $touched);
        $this->components->twoColumnDetail('Labels refreshed', (string) $labels);
        $this->components->twoColumnDetail('Thai values filled', (string) $values);
        foreach (array_unique($unresolved) as $note) {
            $this->components->warn($note);
        }
        if ($dry) {
            $this->components->info('Dry run — nothing was written.');
        }

        return self::SUCCESS;
    }

    /**
     * The Thai form of a stored value, or null when there is none to find.
     *
     * Matched on the stored English value rather than re-resolved from an id: the point is
     * to add the twin of the words already in the snapshot, not to re-decide what the
     * requester chose. A renamed option therefore matches nothing and is left alone.
     *
     * @param  array<string, mixed>  $field
     */
    private function thaiValue(ServiceRequest $request, array $field, string $value): ?string
    {
        if ($field['managed'] ?? false) {
            return RequestOption::where('request_type', $request->type->value)
                ->where('field_key', $field['key'])
                ->where('label_en', $value)
                ->value('label_th') ?: null;
        }

        if (($field['input'] ?? null) === 'select') {
            $option = collect($field['options'] ?? [])->firstWhere('label_en', $value);

            return ($option['label_th'] ?? null) ?: null;
        }

        return null;
    }
}
