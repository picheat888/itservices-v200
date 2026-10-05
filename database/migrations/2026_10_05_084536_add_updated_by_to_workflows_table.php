<?php

use App\Models\Workflow\Workflow;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * workflows.updated_by — who last saved a workflow (users FK, null if the account is deleted), set by
 * App\Models\Concerns\RecordsUpdater. Updated_by only: there is one seeded workflow per request type
 * and nobody adds or deletes them. The steps and their position / approver pivots get nothing — every
 * save deletes and recreates them, so their stamp would always repeat the workflow's.
 *
 * Filled from the latest "Updated workflow" audit entry by a person, matched on details.workflow_id;
 * those entries also get their subject_type / subject_id.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workflows', function (Blueprint $table) {
            $table->foreignId('updated_by')->nullable()->after('updated_at')->constrained('users')->nullOnDelete();
        });

        $users = DB::table('users')->pluck('id')->flip();
        $workflows = DB::table('workflows')->pluck('id')->flip();
        $type = Relation::getMorphAlias(Workflow::class);

        $latest = [];
        $logs = DB::table('audit_logs')->where('action', 'Updated workflow')->orderBy('id')->get(['id', 'user_id', 'details']);
        foreach ($logs as $log) {
            $id = json_decode((string) $log->details, true)['workflow_id'] ?? null;
            if ($id === null || ! $workflows->has($id)) {
                continue;
            }
            DB::table('audit_logs')->where('id', $log->id)->whereNull('subject_type')->update(['subject_type' => $type, 'subject_id' => $id]);
            if ($log->user_id !== null && $users->has($log->user_id)) {
                $latest[$id] = $log->user_id;
            }
        }

        foreach ($latest as $id => $userId) {
            DB::table('workflows')->where('id', $id)->update(['updated_by' => $userId]);
        }
    }

    public function down(): void
    {
        Schema::table('workflows', function (Blueprint $table) {
            $table->dropConstrainedForeignId('updated_by');
        });
    }
};
