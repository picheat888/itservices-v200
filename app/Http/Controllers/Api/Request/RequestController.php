<?php

namespace App\Http\Controllers\Api\Request;

use App\Http\Controllers\Controller;
use App\Http\Requests\Request\RequestIndexRequest;
use App\Http\Requests\Request\StoreServiceRequestRequest;
use App\Http\Resources\Request\ServiceRequestResource;
use App\Models\AuditLog;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Services\Request\RequestListService;
use App\Services\Request\RequestService;
use App\Support\OverviewPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Service requests: the list (RequestListService), show, submit, and the four workflow
 * transitions (approve / reject / complete / cancel) in RequestService.
 */
class RequestController extends Controller
{
    /**
     * What one request needs to render on its own: chain with approver accounts, ticket and holder, route, requester card.
     *
     * @var list<string>
     */
    private const DETAIL_RELATIONS = ['approvals.approver.user', 'approvals.actedBy.employee', 'ticket.assignee.employee', 'submittedBy.employee', 'workflow', 'employee.position', 'employee.department', 'attachments'];

    public function __construct(private readonly RequestService $service) {}

    public function index(RequestIndexRequest $request, RequestListService $list): JsonResponse
    {
        $user = $request->user();
        $page = $list->page($user, $request->filters());

        return response()->json([
            'data' => ServiceRequestResource::collection($page->items()),
            'meta' => $list->meta($user, $page, OverviewPeriod::fromRequest($request)),
        ]);
    }

    public function store(StoreServiceRequestRequest $request): JsonResponse
    {
        $serviceRequest = $this->service->submit($request->user(), $request->validated());

        AuditLog::record('Submitted service request', $serviceRequest->reference, [
            'service_request_id' => $serviceRequest->id,
            'type' => $serviceRequest->type->value,
        ], subject: $serviceRequest);

        return $this->detail($serviceRequest)->response()->setStatusCode(201);
    }

    public function show(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        // Same rule as the attachment download route (ServiceRequest::isVisibleTo)
        abort_unless($serviceRequest->isVisibleTo($request->user()), 403);

        return $this->detail($serviceRequest);
    }

    /** Approve the current step (note optional). */
    public function approve(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $data = $request->validate(['step_id' => ['required', 'integer'], 'note' => ['nullable', 'string', 'max:2000']]);
        $serviceRequest = $this->service->approve($serviceRequest, $request->user(), (int) $data['step_id'], $data['note'] ?? null);

        AuditLog::record('Approved service request step', $serviceRequest->reference, subject: $serviceRequest);

        return $this->detail($serviceRequest);
    }

    /** Reject the current step — a remark is always required. */
    public function reject(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $data = $request->validate(['step_id' => ['required', 'integer'], 'note' => ['required', 'string', 'max:2000']]);
        $serviceRequest = $this->service->reject($serviceRequest, $request->user(), (int) $data['step_id'], $data['note']);

        AuditLog::record('Rejected service request', $serviceRequest->reference, subject: $serviceRequest);

        return $this->detail($serviceRequest);
    }

    /** Mark an approved request done (IT queue). */
    public function complete(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $serviceRequest = $this->service->complete($serviceRequest, $request->user());

        AuditLog::record('Completed service request', $serviceRequest->reference, subject: $serviceRequest);

        return $this->detail($serviceRequest);
    }

    /** Owner, on-behalf filer or a requests.cancel_any holder withdraws a pending request. */
    public function cancel(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:2000']]);
        $actor = $request->user();
        $serviceRequest = $this->service->cancel($serviceRequest, $actor, trim($data['reason']));

        $target = $serviceRequest->isOwnedOrFiledBy($actor)
            ? $serviceRequest->reference
            : "{$serviceRequest->reference} (for the owner)";
        AuditLog::record('Cancelled service request', $target, subject: $serviceRequest);

        return $this->detail($serviceRequest);
    }

    /** One request with everything its detail view renders, group-step names included. */
    private function detail(ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $serviceRequest->load([...RequestListService::approvalsWithParent(), ...self::DETAIL_RELATIONS]);
        RequestApproval::preloadGroupNames($serviceRequest->approvals);
        RequestApproval::preloadGroupCandidates($serviceRequest->approvals);

        return new ServiceRequestResource($serviceRequest);
    }
}
