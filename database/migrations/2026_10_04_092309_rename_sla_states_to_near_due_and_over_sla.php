<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The SLA state words, renamed so the database reads plainly: 'at_risk' → 'near_due' (80% of
 * the target spent) and 'breached' → 'over_sla' (past it). 'on_track', 'met' and 'missed' stay.
 *
 * Moves every place the old words are stored:
 * - tickets.sla_response_alert_level / sla_resolve_alert_level — how far each clock's alert went;
 * - notifications.data.subtype of the SLA bells (response_at_risk → response_near_due, …), so a
 *   bell already in someone's tray still finds its message;
 * - notification_templates.key of those four bells — renamed in place, keeping the admin's
 *   switch, edited messages and last_sent_at;
 * - the "sla" filter saved on scheduled / exported backlog reports (none at the time of writing).
 *
 * down() moves them all back.
 */
return new class extends Migration
{
    /** @var array<string, string> */
    private const STATES = ['at_risk' => 'near_due', 'breached' => 'over_sla'];

    public function up(): void
    {
        $this->move(self::STATES);
    }

    public function down(): void
    {
        $this->move(array_flip(self::STATES));
    }

    /** @param array<string, string> $map old word → new word */
    private function move(array $map): void
    {
        DB::transaction(function () use ($map) {
            foreach ($map as $from => $to) {
                foreach (['sla_response_alert_level', 'sla_resolve_alert_level'] as $column) {
                    DB::table('tickets')->where($column, $from)->update([$column => $to]);
                }

                foreach (['response', 'resolve'] as $clock) {
                    DB::table('notification_templates')
                        ->where('key', "notif_ticket_sla_{$clock}_{$from}")
                        ->update(['key' => "notif_ticket_sla_{$clock}_{$to}"]);
                }
            }

            // Bell payloads are JSON: the subtype of each SLA bell, and the source_key of a settings-page
            // test bell sent for one of them ("notif_ticket_sla_resolve_breached").
            DB::table('notifications')->where('data', 'like', '%ticket_sla%')->orderBy('id')
                ->each(function (object $row) use ($map) {
                    $data = json_decode($row->data, true);
                    if (! is_array($data)) {
                        return;
                    }
                    $changed = false;
                    $subtype = $data['subtype'] ?? null;
                    if (($data['type'] ?? null) === 'ticket_sla' && is_string($subtype) && str_contains($subtype, '_')) {
                        [$clock, $state] = explode('_', $subtype, 2);
                        if (isset($map[$state])) {
                            $data['subtype'] = "{$clock}_{$map[$state]}";
                            $changed = true;
                        }
                    }
                    $source = $data['source_key'] ?? null;
                    if (is_string($source) && preg_match('/^notif_ticket_sla_(response|resolve)_(.+)$/', $source, $m) && isset($map[$m[2]])) {
                        $data['source_key'] = "notif_ticket_sla_{$m[1]}_{$map[$m[2]]}";
                        $changed = true;
                    }
                    if ($changed) {
                        DB::table('notifications')->where('id', $row->id)->update(['data' => json_encode($data)]);
                    }
                });

            // Saved report filters: the backlog's "sla" value.
            foreach (['report_schedules', 'report_exports'] as $table) {
                DB::table($table)->where('report_key', 'tickets.backlog')->orderBy('id')
                    ->each(function (object $row) use ($table, $map) {
                        $filters = json_decode((string) $row->filters, true);
                        if (! is_array($filters) || ! isset($filters['sla'], $map[$filters['sla']])) {
                            return;
                        }
                        $filters['sla'] = $map[$filters['sla']];
                        DB::table($table)->where('id', $row->id)->update(['filters' => json_encode($filters)]);
                    });
            }
        });
    }
};
