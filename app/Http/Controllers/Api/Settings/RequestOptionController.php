<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Settings\RequestOption;
use App\Support\RequestSchemas;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;
use Illuminate\Validation\ValidationException;

/**
 * Settings → Master data → Request data: the choice lists behind the request
 * form's managed selects (Hardware device, Mobile device, Telephone handset).
 *
 * Both labels are freely editable — a request stores the row's id, so renaming a
 * choice never breaks what an old request points at. Display order is set by
 * dragging the rows, which posts the whole list back to `reorder`.
 */
class RequestOptionController extends Controller
{
    /** Every managed list plus its current choices. */
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => [
                'lists' => RequestSchemas::managedLists(),
                'options' => RequestOption::orderBy('request_type')->orderBy('field_key')
                    ->orderBy('sort_order')->orderBy('label_en')->get(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['sort_order'] = $this->nextSortOrder($data['request_type'], $data['field_key']);

        $option = RequestOption::create($data);
        RequestSchemas::flushManagedCache();
        AuditLog::record('Created request option', "{$option->request_type}.{$option->field_key} · {$option->label_en}");

        return response()->json(['data' => $option, 'message' => 'success'], 201);
    }

    /** Labels and the active flag only — the list it belongs to and its place are fixed. */
    public function update(Request $request, RequestOption $requestOption): JsonResponse
    {
        $data = $request->validate([
            'label_en' => [
                'required', 'string', 'max:120',
                $this->uniqueLabel($requestOption->request_type, $requestOption->field_key)->ignore($requestOption->id),
            ],
            'label_th' => ['nullable', 'string', 'max:120'],
            'active' => ['nullable', 'boolean'],
        ]);

        $before = $requestOption->getOriginal();
        $requestOption->update($data);
        RequestSchemas::flushManagedCache();
        AuditLog::record(
            'Updated request option',
            "{$requestOption->request_type}.{$requestOption->field_key} · {$requestOption->label_en}",
            AuditLog::changes($before, $requestOption),
        );

        return response()->json(['data' => $requestOption, 'message' => 'success']);
    }

    /**
     * Rewrite the display order of one list from the ids it is given, top first.
     * The client sends the whole list after a drag, so a partial order is a bug
     * rather than a partial update — it is rejected instead of half-applied.
     */
    public function reorder(Request $request): JsonResponse
    {
        $lists = collect(RequestSchemas::managedLists());

        $data = $request->validate([
            'request_type' => ['required', 'string', Rule::in($lists->pluck('request_type')->unique()->all())],
            'field_key' => ['required', 'string', Rule::in($lists->pluck('field_key')->unique()->all())],
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
        ]);

        $ids = array_values(array_unique(array_map('intval', $data['ids'])));

        $options = DB::transaction(function () use ($data, $ids) {
            $list = RequestOption::forField($data['request_type'], $data['field_key'])->lockForUpdate()->get();

            $given = $ids;
            $held = $list->pluck('id')->all();
            sort($given);
            sort($held);
            if ($given !== $held) {
                throw ValidationException::withMessages(['ids' => 'The order must name every choice of this list exactly once.']);
            }

            // Spaced by ten to match how a new choice is appended.
            foreach ($ids as $index => $id) {
                $list->firstWhere('id', $id)?->update(['sort_order' => ($index + 1) * 10]);
            }

            return RequestOption::forField($data['request_type'], $data['field_key'])->get();
        });

        RequestSchemas::flushManagedCache();
        AuditLog::record(
            'Reordered request options',
            "{$data['request_type']}.{$data['field_key']} · ".$options->pluck('label_en')->implode(' → '),
        );

        return response()->json(['data' => $options, 'message' => 'success']);
    }

    /**
     * Deleting is safe for history: each request stores its own display snapshot
     * at submit time, so a removed choice never blanks out an old request. It
     * simply stops being offered.
     */
    public function destroy(RequestOption $requestOption): JsonResponse
    {
        AuditLog::record('Deleted request option', "{$requestOption->request_type}.{$requestOption->field_key} · {$requestOption->label_en}");
        $requestOption->delete();
        RequestSchemas::flushManagedCache();

        return response()->json(['message' => 'success']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        // Only lists the schema actually declares as managed may be written to.
        $lists = collect(RequestSchemas::managedLists());

        $data = $request->validate([
            'request_type' => ['required', 'string', Rule::in($lists->pluck('request_type')->unique()->all())],
            'field_key' => ['required', 'string', Rule::in($lists->pluck('field_key')->unique()->all())],
            'label_en' => ['required', 'string', 'max:120'],
            'label_th' => ['nullable', 'string', 'max:120'],
            'active' => ['nullable', 'boolean'],
        ]);

        // The label is the identity people see, so it has to be unique per list.
        // Checked after the list itself is known to be valid.
        $request->validate([
            'label_en' => [$this->uniqueLabel($data['request_type'], $data['field_key'])],
        ]);

        return $data;
    }

    /** "This choice already exists in this list" — scoped to the one list. */
    private function uniqueLabel(string $type, string $field): Unique
    {
        return Rule::unique('request_options', 'label_en')
            ->where(fn ($q) => $q->where('request_type', $type)->where('field_key', $field));
    }

    /** A new choice joins at the bottom of its list, where the person who added it expects to find it. */
    private function nextSortOrder(string $type, string $field): int
    {
        return (int) RequestOption::where('request_type', $type)->where('field_key', $field)->max('sort_order') + 10;
    }
}
