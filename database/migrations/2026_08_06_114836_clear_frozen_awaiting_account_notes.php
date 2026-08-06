<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Clears the "this approver has no login account yet" sentence out of
 * request_approvals.note.
 *
 * A previous revision wrote that onto the approval row at submit time. The row is
 * a snapshot; whether somebody has an account is not — once the account is
 * provisioned the frozen sentence keeps claiming otherwise, and being stored text
 * it also stays English however the reader has the UI set. It is reported live as
 * `awaiting_account` now, so the stored copies are stale by definition.
 *
 * Only that sentence is removed. Anything else on the row (a merged
 * "Also covers …" line, a decision remark) is left exactly as it was.
 */
return new class extends Migration
{
    /** Matched on the wording, not the punctuation — the original carried an en dash. */
    private const FRAGMENT = 'has no login account yet';

    public function up(): void
    {
        DB::table('request_approvals')
            ->whereNotNull('note')
            ->where('note', 'like', '%'.self::FRAGMENT.'%')
            ->select('id', 'note')
            ->orderBy('id')
            ->chunk(200, function ($rows) {
                foreach ($rows as $row) {
                    $cleaned = $this->withoutTheSentence((string) $row->note);
                    DB::table('request_approvals')->where('id', $row->id)->update(['note' => $cleaned]);
                }
            });
    }

    /**
     * Drops the sentence (and the separator that followed it, when the row was a
     * merge of several steps), returning null when nothing else remains.
     */
    private function withoutTheSentence(string $note): ?string
    {
        $cleaned = (string) preg_replace(
            '/Waiting\s*[—-]\s*this approver '.preg_quote(self::FRAGMENT, '/').'[^.]*\.\s*(·\s*)?/u',
            '',
            $note,
        );

        return trim($cleaned) !== '' ? trim($cleaned) : null;
    }

    public function down(): void
    {
        // Nothing to restore: the sentence was wrong the moment an account existed,
        // and the application no longer writes it.
    }
};
