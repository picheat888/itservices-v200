<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Permission keys removed from the Stock Control catalog. Their leftover
     * role_permissions rows must be pruned, otherwise saving any role that still
     * holds one of them fails validation (Rule::in(Permissions::all())).
     *
     * @var list<string>
     */
    private array $removedKeys = [
        'stock.manage_warehouse',
        'stock.audit',
        'stock.delete',
    ];

    /**
     * Delete the orphaned grants for the retired stock permissions.
     */
    public function up(): void
    {
        DB::table('role_permissions')
            ->whereIn('permission', $this->removedKeys)
            ->delete();
    }

    /**
     * Irreversible: the permission keys no longer exist in the catalog, so the
     * pruned grants cannot be meaningfully restored.
     */
    public function down(): void
    {
        //
    }
};
