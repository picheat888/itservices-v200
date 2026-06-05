<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Counting and Event were collapsed to a single switch each (stock.view_count /
     * stock.view_events), retiring the separate stock.count and stock.events action
     * keys. Their leftover role_permissions rows must be pruned, otherwise saving a
     * role that still holds one fails validation (Rule::in(Permissions::all())).
     *
     * @var list<string>
     */
    private array $removedKeys = ['stock.count', 'stock.events'];

    public function up(): void
    {
        DB::table('role_permissions')
            ->whereIn('permission', $this->removedKeys)
            ->delete();
    }

    /**
     * Irreversible: the permission keys no longer exist in the catalog.
     */
    public function down(): void
    {
        //
    }
};
