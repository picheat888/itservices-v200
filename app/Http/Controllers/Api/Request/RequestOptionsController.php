<?php

namespace App\Http\Controllers\Api\Request;

use App\Enums\Request\RequestType;
use App\Http\Controllers\Controller;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Settings\Location;
use App\Models\Workflow\Workflow;
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
    public function index(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('requests.submit'), 403);

        $workflows = Workflow::with('steps')->get()->keyBy(fn (Workflow $w) => $w->request_type->value);

        $types = collect(RequestType::cases())->map(function (RequestType $type) use ($workflows) {
            $workflow = $workflows->get($type->value);

            return [
                'type' => $type->value,
                'fields' => RequestSchemas::for($type),
                'columns' => RequestSchemas::columns($type),
                'workflow' => $workflow === null ? null : [
                    'id' => $workflow->id,
                    'name' => $workflow->name,
                    'active' => $workflow->active,
                    'auto_ticket' => $workflow->auto_ticket,
                    'steps' => $workflow->steps->map(fn ($s) => [
                        'label' => $s->label,
                        'actor_type' => $s->actor_type->value,
                        'kind' => $s->kind->value,
                        'sla_days' => (float) $s->sla_days,
                    ])->values(),
                ],
            ];
        })->values();

        return response()->json([
            'data' => [
                'types' => $types,
                'sources' => [
                    'email_groups' => EmailGroup::orderBy('name')->get(['id', 'name', 'email'])
                        ->map(fn ($g) => ['id' => $g->id, 'label' => $g->email ?: $g->name, 'detail' => $g->name]),
                    'file_shares' => FileShare::orderBy('path')->get(['id', 'name', 'path'])
                        ->map(fn ($s) => ['id' => $s->id, 'label' => $s->path, 'detail' => $s->name]),
                    'social_platforms' => SocialPlatform::orderBy('name')->get(['id', 'name'])
                        ->map(fn ($p) => ['id' => $p->id, 'label' => $p->name, 'detail' => null]),
                    // Brand + name, straight from the Access Directory catalogue.
                    'softwares' => Software::with('brand')->orderBy('name')->get()
                        ->map(fn (Software $s) => [
                            'id' => $s->id,
                            'label' => trim(($s->brand?->name ? $s->brand->name.' ' : '').$s->name),
                            'detail' => $s->license_type?->value,
                        ]),
                    'locations' => Location::orderBy('name')->get(['id', 'name'])
                        ->map(fn ($l) => ['id' => $l->id, 'label' => $l->name, 'detail' => null]),
                ],
            ],
        ]);
    }
}
