<?php

// Stock requests keep who approved and who fulfilled as user ids, next to the name text that was shown.

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_requests', function (Blueprint $table) {
            $table->foreignId('approver_id')->nullable()->after('approver_name')->constrained('users')->nullOnDelete();
            $table->foreignId('fulfilled_by_id')->nullable()->after('fulfilled_by')->constrained('users')->nullOnDelete();
        });

        // Only a name held by exactly one user is matched
        $userIdByName = DB::table('users')->select('name', DB::raw('MIN(id) as id'))
            ->groupBy('name')->havingRaw('COUNT(*) = 1')->pluck('id', 'name');

        foreach (['approver_name' => 'approver_id', 'fulfilled_by' => 'fulfilled_by_id'] as $nameColumn => $idColumn) {
            foreach ($userIdByName as $name => $userId) {
                DB::table('stock_requests')->where($nameColumn, $name)->whereNull($idColumn)->update([$idColumn => $userId]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('stock_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('approver_id');
            $table->dropConstrainedForeignId('fulfilled_by_id');
        });
    }
};
