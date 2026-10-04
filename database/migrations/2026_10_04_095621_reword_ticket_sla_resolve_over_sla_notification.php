<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * NT-35 (notif_ticket_sla_resolve_over_sla) in plain words: "SLA breached" / "SLA breach แล้ว" →
 * "this case is past its SLA" / "เคสนี้เกิน SLA", alongside NT-33's "เกินเวลารับเคสแล้ว - …".
 * The tray reads notification_templates, so the stored row moves too — but each language only
 * while it still holds the old standard text: an administrator's own wording is left alone.
 * NotificationCatalogue and the lang files carry the same new text.
 */
return new class extends Migration
{
    private const KEY = 'notif_ticket_sla_resolve_over_sla';

    /** @var array<string, array{0: string, 1: string}> column → [old, new] */
    private const TEXT = [
        'message_en' => ['Resolution overdue - SLA breached', 'Resolution overdue - this case is past its SLA'],
        'message_th' => ['เกินกำหนดปิดเคส - SLA breach แล้ว', 'เกินกำหนดปิดเคสแล้ว - เคสนี้เกิน SLA'],
    ];

    public function up(): void
    {
        foreach (self::TEXT as $column => [$old, $new]) {
            DB::table('notification_templates')->where('key', self::KEY)->where($column, $old)->update([$column => $new]);
        }
    }

    public function down(): void
    {
        foreach (self::TEXT as $column => [$old, $new]) {
            DB::table('notification_templates')->where('key', self::KEY)->where($column, $new)->update([$column => $old]);
        }
    }
};
