<?php

// Saves the Ticket & SLA settings in one transaction and moves the deadlines of every open ticket to the new targets.

namespace App\Services\Settings;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketSlaClock;
use App\Models\AuditLog;
use App\Models\Settings\AppSetting;
use App\Models\Settings\SlaTarget;
use App\Services\Ticket\TicketDeadlineService;
use App\Support\TicketSla;
use Illuminate\Support\Facades\DB;

class SlaSettingsService
{
    public function __construct(private readonly TicketDeadlineService $deadlines) {}

    /** @param  array<string, mixed>  $data  validated by UpdateSlaSettingsRequest */
    public function save(array $data): void
    {
        try {
            DB::transaction(fn () => $this->write($data));
        } finally {
            // A rolled-back save must not leave its values in the caches
            AppSetting::flushCache();
            TicketSla::flush();
        }

        AuditLog::record('Updated SLA settings', 'ticket_sla');
    }

    /** @param  array<string, mixed>  $data */
    private function write(array $data): void
    {
        // Priority targets: one row each, written over whatever was there
        foreach ($data['ticket_sla'] as $priority => $row) {
            SlaTarget::updateOrCreate(
                ['scope' => SlaScope::Priority->value, 'match_value' => (string) $priority],
                [
                    'resolve_hours' => (int) $row['resolve'],
                    'clock' => $row['clock'] ?? TicketSlaClock::Business->value,
                    'enabled' => true,
                ],
            );
        }

        // Request-type and repair lists arrive whole; the Priority form alone sends neither
        if (array_key_exists('ticket_sla_request', $data)) {
            // Forced on: a case from a request has no priority to fall back to
            $this->saveScopeRows(
                SlaScope::RequestType,
                'type',
                array_map(fn (array $row) => $row + ['enabled' => true], $data['ticket_sla_request']),
            );
        }
        if (array_key_exists('ticket_sla_work_class', $data)) {
            // Keyed through TicketSla so writer and reader share the format
            $this->saveScopeRows(SlaScope::WorkClass, 'key', array_map(
                fn (array $row) => $row + ['key' => TicketSla::workClassKey($row['category'], $row['work_class'])],
                $data['ticket_sla_work_class'],
            ));
        }

        if (isset($data['ticket_sla_response'])) {
            AppSetting::put(TicketSla::RESPONSE_KEY, (string) $data['ticket_sla_response']);
        }
        if (isset($data['ticket_sla_goal'])) {
            AppSetting::put(TicketSla::GOAL_KEY, (string) $data['ticket_sla_goal']);
        }
        if (isset($data['ticket_sla_hours'])) {
            AppSetting::put(TicketSla::HOURS_KEY, json_encode($data['ticket_sla_hours']));
        }
        TicketSla::flush(); // the deadlines below use the new values

        $this->deadlines->recomputeOpen();
    }

    /**
     * Whole-list save for a scope keyed on something other than priority: upsert every row, delete the scope's rows not in it.
     *
     * @param  list<array{resolve: int, clock?: string, enabled?: bool}>  $rows
     */
    private function saveScopeRows(SlaScope $scope, string $keyField, array $rows): void
    {
        $keep = [];
        foreach ($rows as $row) {
            $keep[] = $row[$keyField];
            SlaTarget::updateOrCreate(
                ['scope' => $scope->value, 'match_value' => $row[$keyField]],
                [
                    'resolve_hours' => (int) $row['resolve'],
                    'clock' => $row['clock'] ?? TicketSlaClock::Business->value,
                    'enabled' => (bool) ($row['enabled'] ?? true),
                ],
            );
        }
        SlaTarget::where('scope', $scope->value)->whereNotIn('match_value', $keep)->delete();
    }
}
