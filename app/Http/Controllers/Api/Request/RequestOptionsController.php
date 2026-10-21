<?php

namespace App\Http\Controllers\Api\Request;

use App\Enums\Request\RequestType;
use App\Http\Controllers\Controller;
use App\Models\Workflow\Workflow;
use App\Services\Request\RequestAttachmentService;
use App\Services\Request\RequestSourceService;
use App\Support\Permissions;
use App\Support\RequestSchemas;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Everything the New Request dialog needs in one call: the service catalog
 * (type + field schema + its workflow route), and the select datasets the
 * source-backed fields draw from. Cross-module reads are deliberate — this is
 * a Request-module endpoint applying the Request-module gate (the established
 * read-only "peek" pattern).
 */
class RequestOptionsController extends Controller
{
    public function index(Request $request, RequestSourceService $sources): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('requests.submit'), 403);

        $workflows = Workflow::with('steps')->get()->keyBy(fn (Workflow $w) => $w->request_type->value);

        // Only the types this user may file (requests.submit_<type>), in catalog order.
        $types = collect(Permissions::requestTypesFor($request->user()))->map(function (string $value) use ($workflows) {
            $type = RequestType::from($value);
            $workflow = $workflows->get($type->value);

            return [
                'type' => $type->value,
                'fields' => RequestSchemas::for($type),
                'columns' => RequestSchemas::columns($type),
                // Whether the wizard stars the attachment block and refuses to move
                // past step ② without one — the same rule the submit is validated on.
                'attachments_required' => RequestSchemas::attachmentsRequired($type),
                'workflow' => $workflow === null ? null : [
                    'id' => $workflow->id,
                    'name' => $workflow->name,
                    'active' => $workflow->active,
                    'auto_ticket' => $workflow->auto_ticket,
                    'steps' => $workflow->steps->map(fn ($s) => [
                        'label' => $s->label,
                        'actor_type' => $s->actor_type->value,
                        'kind' => $s->kind->value,
                    ])->values(),
                ],
            ];
        })->values();

        return response()->json([
            'data' => [
                'types' => $types,
                // The upload limits, so the wizard turns files away before a 40 MB
                // post reaches PHP rather than after.
                'attachments' => [
                    'max_files' => RequestAttachmentService::MAX_FILES,
                    'max_size_kb' => RequestAttachmentService::MAX_SIZE_KB,
                    'extensions' => explode(',', RequestAttachmentService::ALLOWED_EXTENSIONS),
                ],
                // Only the sources the types this user may file draw from.
                'sources' => $sources->forTypes(Permissions::requestTypesFor($request->user())),
            ],
        ]);
    }

    /**
     * One field's list, reloaded when its dropdown opens: the user must be able to file that type.
     */
    public function field(Request $request, RequestSourceService $sources, string $type, string $field): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user?->hasPermission('requests.submit') && $user->hasPermission("requests.submit_{$type}"), 403);

        $rows = $sources->field($type, $field);
        abort_if($rows === null, 404);

        return response()->json(['data' => $rows]);
    }
}
