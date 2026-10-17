<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Stores each bell row's kind ("type|module") so the tray counts and pages in SQL, and backfills it.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->string('kind', 150)->default('|')->after('type');
            $table->index(['notifiable_type', 'notifiable_id', 'kind'], 'notifications_notifiable_kind_index');
            $table->index(['notifiable_type', 'notifiable_id', 'created_at'], 'notifications_notifiable_created_index');
        });

        DB::table('notifications')->select(['id', 'data'])->orderBy('id')->chunk(2000, function ($rows) {
            $byKind = [];
            foreach ($rows as $row) {
                $data = json_decode((string) $row->data, true) ?: [];
                $byKind[($data['type'] ?? '').'|'.($data['module'] ?? '')][] = $row->id;
            }
            foreach ($byKind as $kind => $ids) {
                DB::table('notifications')->whereIn('id', $ids)->update(['kind' => $kind]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropIndex('notifications_notifiable_kind_index');
            $table->dropIndex('notifications_notifiable_created_index');
            $table->dropColumn('kind');
        });
    }
};
