<?php

// Settings -> Request data: add, edit, reorder and delete the choices behind the request form's managed selects.

namespace App\Services\Settings;

use App\Models\AuditLog;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\RequestOption;
use App\Support\RequestSchemas;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RequestOptionService
{
    /**
     * A new choice joins at the bottom of its list.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): RequestOption
    {
        $data['sort_order'] = (int) RequestOption::where('request_type', $data['request_type'])
            ->where('field_key', $data['field_key'])->max('sort_order') + 10;

        $option = RequestOption::create($data);
        RequestSchemas::flushManagedCache();
        AuditLog::record('Created request option', "{$option->request_type}.{$option->field_key}: {$option->label_en}", subject: $option);

        return $option;
    }

    /** @param  array<string, mixed>  $data  labels and the active flag only */
    public function update(RequestOption $option, array $data): RequestOption
    {
        $before = $option->getOriginal();
        $option->update($data);
        RequestSchemas::flushManagedCache();
        AuditLog::record(
            'Updated request option',
            "{$option->request_type}.{$option->field_key}: {$option->label_en}",
            AuditLog::changes($before, $option),
            subject: $option,
        );

        return $option;
    }

    /**
     * Rewrites one list's order from the ids, top first; anything but the whole list once is a 422 on ids.
     *
     * @param  list<int|string>  $ids
     * @return Collection<int, RequestOption>
     */
    public function reorder(string $type, string $field, array $ids): Collection
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));

        $options = DB::transaction(function () use ($type, $field, $ids) {
            $list = RequestOption::forField($type, $field)->lockForUpdate()->get();

            $given = $ids;
            $held = $list->pluck('id')->all();
            sort($given);
            sort($held);
            if ($given !== $held) {
                throw ValidationException::withMessages(['ids' => 'The order must name every choice of this list exactly once.']);
            }

            // Spaced by ten, as a new choice is appended
            foreach ($ids as $index => $id) {
                $list->firstWhere('id', $id)?->update(['sort_order' => ($index + 1) * 10]);
            }

            return RequestOption::forField($type, $field)->get();
        });

        RequestSchemas::flushManagedCache();
        AuditLog::record('Reordered request options', "{$type}.{$field}: ".$options->pluck('label_en')->implode(' → '));

        return $options;
    }

    /** How many requests point at the choice; only an unused one may be deleted (retire with `active` instead). */
    public function usageCount(RequestOption $option): int
    {
        return ServiceRequest::where('request_option_id', $option->id)->count();
    }

    public function delete(RequestOption $option): void
    {
        AuditLog::recordDeleted('Deleted request option', "{$option->request_type}.{$option->field_key}: {$option->label_en}", $option);
        $option->delete();
        RequestSchemas::flushManagedCache();
    }
}
