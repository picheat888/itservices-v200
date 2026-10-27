<?php

// Stock count redesign: per-line reasons and serial lists, recount link, and who confirmed a count.

use App\Models\Stock\StockCount;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_count_lines', function (Blueprint $table) {
            $table->string('reason', 30)->nullable();
            $table->string('reason_note', 500)->nullable();
            $table->json('missing_serial_ids')->nullable();
            $table->json('found_serial_ids')->nullable();
        });

        Schema::table('stock_counts', function (Blueprint $table) {
            $table->foreignId('recount_of_id')->nullable()->constrained('stock_counts')->nullOnDelete();
            $table->foreignId('committed_by')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->string('reason', 30)->nullable();
        });

        $this->backfillCommittedBy();
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropColumn('reason');
        });

        Schema::table('stock_counts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('committed_by');
            $table->dropConstrainedForeignId('recount_of_id');
        });

        Schema::table('stock_count_lines', function (Blueprint $table) {
            $table->dropColumn(['reason', 'reason_note', 'missing_serial_ids', 'found_serial_ids']);
        });
    }

    // Committed counts take their confirmer from the commit audit entry
    private function backfillCommittedBy(): void
    {
        $subjectType = Relation::getMorphAlias(StockCount::class);

        $entries = DB::table('audit_logs')
            ->where('action', 'Committed stock count')
            ->where('subject_type', $subjectType)
            ->whereNotNull('user_id')
            ->orderBy('id')
            ->get(['subject_id', 'user_id']);

        foreach ($entries as $entry) {
            DB::table('stock_counts')
                ->where('id', $entry->subject_id)
                ->where('status', 'committed')
                ->whereNull('committed_by')
                ->whereExists(fn ($query) => $query->select(DB::raw(1))->from('users')->where('users.id', $entry->user_id))
                ->update(['committed_by' => $entry->user_id]);
        }
    }
};
