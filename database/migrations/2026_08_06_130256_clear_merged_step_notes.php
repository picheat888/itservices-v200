<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Clears the 'Also covers "…" — the same person resolved for both steps.' sentences
 * out of request_approvals.note.
 *
 * When consecutive workflow steps resolve to the same manager they merge into one
 * row, and the merged row's label already lists every step it covers
 * ("Supervisor / Head · Manager / Asst. Manager · Vice President"). The sentence
 * restated that in English prose next to the label that had just said it, so the
 * resolver stopped writing it; these are the copies already on disk.
 *
 * Only those sentences go. A decision remark or a skip reason on the same row is
 * left exactly as it was.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('request_approvals')
            ->whereNotNull('note')
            ->where('note', 'like', '%Also covers%')
            ->select('id', 'note')
            ->orderBy('id')
            ->chunk(200, function ($rows) {
                foreach ($rows as $row) {
                    DB::table('request_approvals')
                        ->where('id', $row->id)
                        ->update(['note' => $this->withoutMergeSentences((string) $row->note)]);
                }
            });
    }

    /**
     * Drops every "Also covers …" sentence plus the ' · ' that joined them,
     * returning null when the row has nothing else left to say.
     */
    private function withoutMergeSentences(string $note): ?string
    {
        $cleaned = (string) preg_replace(
            '/Also covers "[^"]*"\s*[—-]\s*the same person resolved for both steps\.\s*(·\s*)?/u',
            '',
            $note,
        );

        // A note that was only merge sentences can be left with a dangling separator.
        $cleaned = trim(trim($cleaned), '·');

        return trim($cleaned) !== '' ? trim($cleaned) : null;
    }

    public function down(): void
    {
        // Nothing to restore: the label carries the same information, and the
        // application no longer writes these sentences.
    }
};
