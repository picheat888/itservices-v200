<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\StoreRequestOptionRequest;
use App\Models\Settings\RequestOption;
use App\Services\Settings\RequestOptionService;
use App\Support\InUse;
use App\Support\RequestSchemas;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Settings -> Master data -> Request data: the choice lists behind the request form's managed selects; requests store the id, so labels stay editable. */
class RequestOptionController extends Controller
{
    public function __construct(private readonly RequestOptionService $options) {}

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

    public function store(StoreRequestOptionRequest $request): JsonResponse
    {
        $option = $this->options->create($request->validated());

        return response()->json(['data' => $option, 'message' => 'success'], 201);
    }

    /** Labels and the active flag only; the list it belongs to and its place are fixed. */
    public function update(Request $request, RequestOption $requestOption): JsonResponse
    {
        $data = $request->validate([
            'label_en' => [
                'required', 'string', 'max:120',
                StoreRequestOptionRequest::uniqueLabel($requestOption->request_type, $requestOption->field_key)->ignore($requestOption->id),
            ],
            'label_th' => ['nullable', 'string', 'max:120'],
            'active' => ['nullable', 'boolean'],
        ]);

        return response()->json(['data' => $this->options->update($requestOption, $data), 'message' => 'success']);
    }

    /** One list's display order from the whole list of ids after a drag, top first; a partial order is refused. */
    public function reorder(Request $request): JsonResponse
    {
        $lists = collect(RequestSchemas::managedLists());

        $data = $request->validate([
            'request_type' => ['required', 'string', Rule::in($lists->pluck('request_type')->unique()->all())],
            'field_key' => ['required', 'string', Rule::in($lists->pluck('field_key')->unique()->all())],
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
        ]);

        $options = $this->options->reorder($data['request_type'], $data['field_key'], $data['ids']);

        return response()->json(['data' => $options, 'message' => 'success']);
    }

    /** A choice requests point at is never deleted (409, as other master data); retire it with `active`. */
    public function destroy(RequestOption $requestOption): JsonResponse
    {
        $refusal = InUse::refusal([$this->options->usageCount($requestOption)]);
        if ($refusal) {
            return $refusal;
        }

        $this->options->delete($requestOption);

        return response()->json(['message' => 'success']);
    }
}
