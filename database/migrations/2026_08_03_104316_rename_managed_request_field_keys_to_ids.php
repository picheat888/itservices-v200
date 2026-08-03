<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The managed request fields now hold a request_options id, so their keys take
 * the *_id suffix every other reference field uses: hardware/mobile `device` →
 * `device_id`, telephone `device_type` → `device_type_id`.
 *
 * Renames the option rows onto the new key (keeping their ids, which submitted
 * requests may point at) and carries the key across in each request's `fields`
 * json, including the `_display` snapshot rows.
 */
return new class extends Migration
{
    /** @var list<array{type: string, from: string, to: string}> */
    private array $renames = [
        ['type' => 'hardware', 'from' => 'device', 'to' => 'device_id'],
        ['type' => 'mobile', 'from' => 'device', 'to' => 'device_id'],
        ['type' => 'telephone', 'from' => 'device_type', 'to' => 'device_type_id'],
    ];

    public function up(): void
    {
        foreach ($this->renames as $rename) {
            $this->moveOptions($rename['type'], $rename['from'], $rename['to']);
            $this->moveRequestFields($rename['type'], $rename['from'], $rename['to']);
        }
    }

    public function down(): void
    {
        foreach ($this->renames as $rename) {
            $this->moveOptions($rename['type'], $rename['to'], $rename['from']);
            $this->moveRequestFields($rename['type'], $rename['to'], $rename['from']);
        }
    }

    /**
     * Move one list's rows onto the other key. A row already sitting on the
     * target key (a seeder run that got there first) gives way to the original,
     * so the ids requests were given stay valid.
     */
    private function moveOptions(string $type, string $from, string $to): void
    {
        $rows = DB::table('request_options')->where('request_type', $type)->where('field_key', $from)->get();

        foreach ($rows as $row) {
            DB::table('request_options')
                ->where('request_type', $type)->where('field_key', $to)->where('label_en', $row->label_en)
                ->delete();

            DB::table('request_options')->where('id', $row->id)->update(['field_key' => $to]);
        }
    }

    /** Rename the json key on every request of this type, snapshot rows included. */
    private function moveRequestFields(string $type, string $from, string $to): void
    {
        $requests = DB::table('service_requests')->where('type', $type)->get(['id', 'fields']);

        foreach ($requests as $request) {
            $fields = json_decode((string) $request->fields, true);
            if (! is_array($fields) || ! array_key_exists($from, $fields)) {
                continue;
            }

            $fields[$to] = $fields[$from];
            unset($fields[$from]);

            $fields['_display'] = array_map(function (array $row) use ($from, $to) {
                if (($row['key'] ?? null) === $from) {
                    $row['key'] = $to;
                }

                return $row;
            }, $fields['_display'] ?? []);

            DB::table('service_requests')->where('id', $request->id)->update(['fields' => json_encode($fields)]);
        }
    }
};
