<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Gives every reference a request can make a real column with a real foreign
 * key. They used to be ids inside the `fields` json, where the database can
 * enforce nothing: delete the referenced row and the request silently pointed at
 * an id that no longer existed.
 *
 * `nullOnDelete` keeps the existing behaviour that master data stays deletable —
 * the request's `_display` snapshot already holds the label it was submitted
 * with, so history reads correctly even after the reference is cleared.
 *
 * The json keeps what has no table behind it: free text, dates, plain selects
 * (access_level, sim…) and the `_display` snapshot.
 */
return new class extends Migration
{
    /** @var array<string, array{column: string, table: string}> */
    private array $references = [
        'device_id' => ['column' => 'request_option_id', 'table' => 'request_options'],
        'device_type_id' => ['column' => 'request_option_id', 'table' => 'request_options'],
        'file_share_id' => ['column' => 'file_share_id', 'table' => 'file_shares'],
        'email_group_id' => ['column' => 'email_group_id', 'table' => 'email_groups'],
        'social_platform_id' => ['column' => 'social_platform_id', 'table' => 'social_platforms'],
        'software_id' => ['column' => 'software_id', 'table' => 'softwares'],
        'location_id' => ['column' => 'location_id', 'table' => 'locations'],
    ];

    public function up(): void
    {
        Schema::table('service_requests', function (Blueprint $table) {
            foreach ($this->columns() as $column => $referencedTable) {
                $table->foreignId($column)->nullable()->after('fields')
                    ->constrained($referencedTable)->nullOnDelete();
            }
        });

        $this->moveIdsOutOfJson();
    }

    public function down(): void
    {
        $this->moveIdsBackIntoJson();

        Schema::table('service_requests', function (Blueprint $table) {
            foreach (array_keys($this->columns()) as $column) {
                $table->dropConstrainedForeignId($column);
            }
        });
    }

    /**
     * The columns to create, de-duplicated — device_id and device_type_id are the
     * same kind of reference and share one column.
     *
     * @return array<string, string>
     */
    private function columns(): array
    {
        $columns = [];
        foreach ($this->references as $reference) {
            $columns[$reference['column']] = $reference['table'];
        }

        return $columns;
    }

    /** Copy each request's reference ids from `fields` into their new columns. */
    private function moveIdsOutOfJson(): void
    {
        foreach (DB::table('service_requests')->get(['id', 'fields']) as $request) {
            $fields = json_decode((string) $request->fields, true);
            if (! is_array($fields)) {
                continue;
            }

            $update = [];
            foreach ($this->references as $key => $reference) {
                if (! array_key_exists($key, $fields)) {
                    continue;
                }
                // Only keep an id the referenced row still has — a stale id would
                // now violate the foreign key.
                $id = (int) $fields[$key];
                if ($id > 0 && DB::table($reference['table'])->where('id', $id)->exists()) {
                    $update[$reference['column']] = $id;
                }
                unset($fields[$key]);
            }

            if ($update === []) {
                continue;
            }

            DB::table('service_requests')->where('id', $request->id)
                ->update([...$update, 'fields' => json_encode($fields)]);
        }
    }

    /** Put the ids back under their `fields` keys, guided by each request's type. */
    private function moveIdsBackIntoJson(): void
    {
        foreach (DB::table('service_requests')->get() as $request) {
            $fields = json_decode((string) $request->fields, true);
            if (! is_array($fields)) {
                continue;
            }

            $changed = false;
            foreach ($this->references as $key => $reference) {
                $id = $request->{$reference['column']} ?? null;

                // device_id and device_type_id share a column, so the request's own
                // type decides which key gets the id back.
                if ($id !== null && $this->typeUses($request->type, $key)) {
                    $fields[$key] = (int) $id;
                    $changed = true;
                }
            }

            if ($changed) {
                DB::table('service_requests')->where('id', $request->id)->update(['fields' => json_encode($fields)]);
            }
        }
    }

    /** Whether a request type carries this field at all. */
    private function typeUses(string $type, string $key): bool
    {
        return match ($key) {
            'device_id' => in_array($type, ['hardware', 'mobile'], true),
            'device_type_id', 'location_id' => $type === 'telephone',
            'file_share_id' => $type === 'fileshare',
            'email_group_id' => $type === 'mailgroup',
            'social_platform_id' => $type === 'social',
            'software_id' => $type === 'software',
            default => false,
        };
    }
};
