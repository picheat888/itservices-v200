<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Records WHY a step was skipped as a code instead of an English sentence.
 *
 * The reason is a snapshot fact — it stays true however the org chart changes
 * afterwards — but its wording is presentation, and a sentence stored in the
 * database is stuck in one language. `skip_reason` carries the fact
 * (App\Enums\Request\ApprovalSkipReason) and the SPA writes it out through
 * `req_skip_*`, which leaves `note` meaning only what a person typed.
 *
 * Existing rows are backfilled from the sentences the resolver used to write, then
 * those sentences are removed. Anything else on the note is left alone.
 */
return new class extends Migration
{
    /** Sentence fragment => the code that now carries the same fact. */
    private const BACKFILL = [
        'has no manager configured' => 'no_manager',
        'no eligible owner' => 'no_resource_owner',
        'requester is the resource owner' => 'requester_is_owner',
    ];

    public function up(): void
    {
        Schema::table('request_approvals', function (Blueprint $table) {
            $table->string('skip_reason', 30)->nullable()->after('note');
        });

        foreach (self::BACKFILL as $fragment => $code) {
            DB::table('request_approvals')
                ->whereNotNull('note')
                ->where('note', 'like', '%'.$fragment.'%')
                ->select('id', 'note')
                ->orderBy('id')
                ->chunk(200, function ($rows) use ($code) {
                    foreach ($rows as $row) {
                        DB::table('request_approvals')->where('id', $row->id)->update([
                            'skip_reason' => $code,
                            'note' => $this->withoutSkipSentence((string) $row->note),
                        ]);
                    }
                });
        }
    }

    /**
     * Drops the "Skipped — …" sentence, keeping anything a person added after it.
     */
    private function withoutSkipSentence(string $note): ?string
    {
        $cleaned = (string) preg_replace('/Skipped\s*[—-]\s*[^.]*\.\s*(·\s*)?/u', '', $note);
        $cleaned = trim(trim($cleaned), '·');

        return trim($cleaned) !== '' ? trim($cleaned) : null;
    }

    public function down(): void
    {
        Schema::table('request_approvals', function (Blueprint $table) {
            $table->dropColumn('skip_reason');
        });
    }
};
