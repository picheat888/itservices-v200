<?php

use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Who did it, on two more groups (users FK, null if the account is deleted):
 * - notification_templates, email_templates: updated_by only — the rows come from the system's own
 *   catalogue, people only reword them (App\Models\Concerns\RecordsUpdater);
 * - the access catalogues email_groups, file_shares, social_platforms, softwares: created_by and
 *   updated_by (App\Models\Concerns\RecordsActors).
 *
 * The access catalogues are filled from the audit log, which names them by name: the first
 * "Created …" sets created_by, the latest create / edit / owner change by a person sets updated_by
 * (adding or removing a member leaves the row itself alone). Every matched entry about one of them,
 * members included, also gets its subject_type / subject_id. A name shared by two rows is skipped.
 * The templates have no such trail yet, so they start empty.
 */
return new class extends Migration
{
    /** Tables that gain updated_by only. */
    private const UPDATER_TABLES = ['notification_templates', 'email_templates'];

    /**
     * Access catalogue table => [model, the noun its audit actions use].
     *
     * @var array<string, array{class-string, string}>
     */
    private const ACCESS_TABLES = [
        'email_groups' => [EmailGroup::class, 'email group'],
        'file_shares' => [FileShare::class, 'file share'],
        'social_platforms' => [SocialPlatform::class, 'social platform'],
        'softwares' => [Software::class, 'software'],
    ];

    public function up(): void
    {
        foreach (self::UPDATER_TABLES as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->foreignId('updated_by')->nullable()->after('updated_at')->constrained('users')->nullOnDelete();
            });
        }

        foreach (array_keys(self::ACCESS_TABLES) as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->foreignId('created_by')->nullable()->after('updated_at')->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            });
        }

        $this->backfill();
    }

    public function down(): void
    {
        foreach (array_keys(self::ACCESS_TABLES) as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->dropConstrainedForeignId('created_by');
                $table->dropConstrainedForeignId('updated_by');
            });
        }

        foreach (self::UPDATER_TABLES as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->dropConstrainedForeignId('updated_by');
            });
        }
    }

    private function backfill(): void
    {
        $users = DB::table('users')->pluck('id')->flip();

        foreach (self::ACCESS_TABLES as $table => [$model, $noun]) {
            $ids = DB::table($table)->get(['id', 'name'])->groupBy('name')
                ->filter(fn ($rows) => $rows->count() === 1)
                ->map(fn ($rows) => $rows->first()->id);
            $rowActions = ["Created {$noun}", "Updated {$noun}", "Changed {$noun} owner"];
            $logs = DB::table('audit_logs')
                ->whereIn('action', [...$rowActions, "Added member to {$noun}", "Removed member from {$noun}"])
                ->orderBy('id')
                ->get(['id', 'user_id', 'action', 'target']);

            $stamps = [];
            $subjects = [];
            foreach ($logs as $log) {
                $id = $ids[(string) $log->target] ?? null;
                if ($id === null) {
                    continue;
                }
                $subjects[$id][] = $log->id;
                if (! in_array($log->action, $rowActions, true) || $log->user_id === null || ! $users->has($log->user_id)) {
                    continue;
                }
                if ($log->action === "Created {$noun}") {
                    $stamps[$id]['created_by'] ??= $log->user_id;
                }
                $stamps[$id]['updated_by'] = $log->user_id;
            }

            foreach ($stamps as $id => $values) {
                DB::table($table)->where('id', $id)->update($values);
            }
            $type = Relation::getMorphAlias($model);
            foreach ($subjects as $id => $logIds) {
                DB::table('audit_logs')->whereIn('id', $logIds)->whereNull('subject_type')
                    ->update(['subject_type' => $type, 'subject_id' => $id]);
            }
        }
    }
};
