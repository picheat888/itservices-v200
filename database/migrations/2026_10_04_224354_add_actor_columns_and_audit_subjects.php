<?php

use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Who did it, on the records people ask that about:
 * - assets: created_by, updated_by (last edit), written_off_by;
 * - contracts: created_by, updated_by (last edit), cancelled_by.
 * Each is a users FK that goes null if the account is deleted. Set by App\Models\Concerns\RecordsActors
 * and, where a write skips the model, by the code doing it (AssetService::bulkSetStatus,
 * ContractService's asset linking, the write-off / cancel flows).
 *
 * audit_logs gains subject_type / subject_id — the record an entry is about — so one record's
 * whole history can be read back without matching on the free-text target.
 *
 * Existing rows are filled from the audit log where it named the record (asset code first in the
 * target, contract code in brackets): created_by from the first create entry, updated_by from the
 * latest entry by a person, cancelled_by from the latest cancel. Write-offs were logged only as a
 * count, so no existing write-off gets a written_off_by. Those matched entries also get their
 * subject_type / subject_id; entries about anything else stay without one.
 */
return new class extends Migration
{
    /** Audit actions about one asset, its code first in the target ("INK-IT-22-0001 - …", "… → EMP-58"). */
    private const ASSET_ACTIONS = [
        'Registered asset', 'Updated asset', 'Transferred asset', 'Accepted asset', 'Requested asset return',
        'Received asset', 'Recalled asset', 'Force-recalled asset', 'Updated asset location', 'Cancelled asset write-off',
    ];

    /** Audit actions about one contract, its code in brackets ("Backup internet (CT-2025-031)"). */
    private const CONTRACT_ACTIONS = ['Created contract', 'Updated contract', 'Cancelled contract', 'Reactivated contract', 'Expired contract'];

    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('written_off_by')->nullable()->after('written_off_at')->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->after('updated_at')->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
        });

        Schema::table('contracts', function (Blueprint $table) {
            $table->foreignId('cancelled_by')->nullable()->after('cancelled_at')->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->after('updated_at')->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->string('subject_type', 120)->nullable()->after('target');
            $table->unsignedBigInteger('subject_id')->nullable()->after('subject_type');
            $table->index(['subject_type', 'subject_id']);
        });

        $this->backfill();
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropIndex(['subject_type', 'subject_id']);
            $table->dropColumn(['subject_type', 'subject_id']);
        });

        Schema::table('contracts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cancelled_by');
            $table->dropConstrainedForeignId('created_by');
            $table->dropConstrainedForeignId('updated_by');
        });

        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('written_off_by');
            $table->dropConstrainedForeignId('created_by');
            $table->dropConstrainedForeignId('updated_by');
        });
    }

    private function backfill(): void
    {
        $users = DB::table('users')->pluck('id')->flip();
        $logs = DB::table('audit_logs')->orderBy('id')->get(['id', 'user_id', 'action', 'target']);
        $assets = DB::table('assets')->pluck('id', 'asset_code');
        $contracts = DB::table('contracts')->get(['id', 'code', 'cancelled_at'])->keyBy('code');

        $asset = [];
        $contract = [];
        $subjects = ['asset' => [], 'contract' => []];
        foreach ($logs as $log) {
            $target = (string) $log->target;
            $byPerson = $log->user_id !== null && $users->has($log->user_id);

            if (in_array($log->action, self::ASSET_ACTIONS, true)) {
                $code = strtok($target, ' ') ?: '';
                if (isset($assets[$code])) {
                    $subjects['asset'][$assets[$code]][] = $log->id;
                }
                if ($byPerson && isset($assets[$code])) {
                    $row = &$asset[$assets[$code]];
                    if ($log->action === 'Registered asset') {
                        $row['created_by'] ??= $log->user_id;
                    }
                    $row['updated_by'] = $log->user_id;
                    unset($row);
                }
            }

            if (in_array($log->action, self::CONTRACT_ACTIONS, true) && preg_match('/\((CT-[^)]+)\)/', $target, $m) && isset($contracts[$m[1]])) {
                $c = $contracts[$m[1]];
                $subjects['contract'][$c->id][] = $log->id;
                if (! $byPerson) {
                    continue;
                }
                $row = &$contract[$c->id];
                if ($log->action === 'Created contract') {
                    $row['created_by'] ??= $log->user_id;
                }
                if ($log->action === 'Cancelled contract' && $c->cancelled_at !== null) {
                    $row['cancelled_by'] = $log->user_id;
                }
                $row['updated_by'] = $log->user_id;
                unset($row);
            }
        }

        foreach ($asset as $id => $values) {
            DB::table('assets')->where('id', $id)->update($values);
        }
        foreach ($contract as $id => $values) {
            DB::table('contracts')->where('id', $id)->update($values);
        }

        // Tie the matched entries to their record, as AuditLog::record() does for new ones.
        $types = ['asset' => Relation::getMorphAlias(Asset::class), 'contract' => Relation::getMorphAlias(Contract::class)];
        foreach ($subjects as $kind => $byRecord) {
            foreach ($byRecord as $id => $logIds) {
                foreach (array_chunk($logIds, 500) as $chunk) {
                    DB::table('audit_logs')->whereIn('id', $chunk)->update(['subject_type' => $types[$kind], 'subject_id' => $id]);
                }
            }
        }
    }
};
