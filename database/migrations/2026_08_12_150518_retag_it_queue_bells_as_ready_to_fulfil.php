<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Bells already sitting in the IT queue's inbox said "awaiting your decision - IT Staff".
 * Nobody there decides anything: the fulfilment step delivers, and when the workflow
 * opened its own case it is that case that carries the work — so the bell stood next to
 * the case's own "new case waiting to be taken" bell, asking for an approval that does
 * not exist.
 *
 * RequestNotificationService now sends `ready_to_fulfill` for that step. Notifications
 * are written once and never re-rendered from source, so the rows already delivered keep
 * whatever they were stamped with; this retags them and fills in the case they belong to.
 *
 * Identified by step_label = 'IT Staff', which only the queue bell ever carried — an
 * approval rung is labelled with a position ("Manager", "Supervisor").
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->eachQueueBell(function (array $data, string $id) {
            $request = DB::table('service_requests')->find($data['service_request_id'] ?? 0);
            $ticketNo = $request?->ticket_id === null
                ? null
                : DB::table('tickets')->where('id', $request->ticket_id)->value('ticket_no');

            $this->write($id, [
                ...$data,
                'subtype' => 'ready_to_fulfill',
                // The label was only ever the words the old copy needed.
                'step_label' => null,
                'ticket_id' => $request?->ticket_id,
                'ticket_no' => $ticketNo,
            ]);
        });
    }

    public function down(): void
    {
        $rows = DB::table('notifications')
            ->where('data', 'like', '%"type":"request"%')
            ->where('data', 'like', '%"subtype":"ready_to_fulfill"%')
            ->get(['id', 'data']);

        foreach ($rows as $row) {
            $data = json_decode($row->data, true);
            if (! is_array($data)) {
                continue;
            }

            $this->write($row->id, [...$data, 'subtype' => 'waiting', 'step_label' => 'IT Staff']);
        }
    }

    /**
     * Run a callback over every delivered queue bell.
     *
     * @param  callable(array<string, mixed>, string): void  $handle
     */
    private function eachQueueBell(callable $handle): void
    {
        $rows = DB::table('notifications')
            ->where('data', 'like', '%"type":"request"%')
            ->where('data', 'like', '%"subtype":"waiting"%')
            ->get(['id', 'data']);

        foreach ($rows as $row) {
            $data = json_decode($row->data, true);
            if (! is_array($data) || ($data['step_label'] ?? null) !== 'IT Staff') {
                continue;
            }

            $handle($data, $row->id);
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function write(string $id, array $data): void
    {
        DB::table('notifications')->where('id', $id)->update(['data' => json_encode($data)]);
    }
};
