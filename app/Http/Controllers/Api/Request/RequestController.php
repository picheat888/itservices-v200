<?php

namespace App\Http\Controllers\Api\Request;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\RequestType;
use App\Enums\Request\WorkflowStepKind;
use App\Http\Controllers\Controller;
use App\Http\Requests\Request\StoreServiceRequestRequest;
use App\Http\Resources\Request\ServiceRequestResource;
use App\Models\AuditLog;
use App\Models\Employee\Employee;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Services\Request\RequestService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Service requests: list/show scoped to what the viewer participates in,
 * submit, and the four workflow transitions (approve / reject / fulfill /
 * cancel). All state logic lives in RequestService.
 */
class RequestController extends Controller
{
    /**
     * What one request needs to render on its own: the frozen chain (with each
     * approver's account, to report who still cannot sign in), the linked ticket,
     * the route it took, and the requester's live employee record for the
     * identity card (code / position / photo).
     *
     * @var list<string>
     */
    // ticket.assignee: the trail says who is working the case, not just that one exists.
    /** Public so RequestAttachmentController answers with the same shape this one does. */
    public const DETAIL_RELATIONS = ['approvals.approver.user', 'ticket.assignee', 'workflow', 'employee.position', 'attachments'];

    public function __construct(private readonly RequestService $service) {}

    /**
     * Visibility: view_all (or super) sees everything; everyone else sees the
     * requests they submitted, the ones they appear in as an approver, and —
     * with requests.fulfill — the approved queue.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user && (
            $user->hasPermission('requests.submit')
            || $user->hasPermission('requests.view_all')
            || $user->hasPermission('requests.fulfill')
        ), 403);

        $seesAll = $user->isSuper() || $user->hasPermission('requests.view_all');
        $canFulfill = (bool) $user->hasPermission('requests.fulfill');
        $employeeId = $user->employee_id;
        // The employee record, not just the id: a step open to a group is matched on this
        // person's department and position as well as on their name.
        $employee = $user->employee;

        $visible = function ($query) use ($seesAll, $canFulfill, $user, $employeeId, $employee) {
            if ($seesAll) {
                return $query;
            }

            return $query->where(function ($q) use ($user, $employeeId, $employee, $canFulfill) {
                // Own requests, plus the ones filed on somebody else's behalf — an
                // onboarding request has no owner account to match on.
                $q->where('user_id', $user->id)
                    ->orWhere('submitted_by_user_id', $user->id);
                if ($employeeId !== null) {
                    // Requests that are ABOUT this person, whoever filed them: their own
                    // onboarding was filed before they had an account, so `user_id` is
                    // null on it and without this they cannot read their own history.
                    $q->orWhere('employee_id', $employeeId)
                        ->orWhereHas('approvals', fn ($a) => $a->actionableBy($employee));
                }
                if ($canFulfill) {
                    $q->orWhereIn('status', [RequestStatus::Approved->value, RequestStatus::Fulfilled->value]);
                }
            });
        };

        // Actionable first (pending → approved → fulfilled → the rest), newest within each group.
        // approver.user comes along because each row reports whether its approver still
        // lacks a login — without it that is one extra query per approval row. Same for
        // ticket.assignee: every row with a case serializes who holds it.
        $query = $visible(ServiceRequest::with(['approvals.approver.user', 'ticket.assignee']));
        // Two orders, because the two readers want different things. The list wants what is
        // actionable first; the dashboard's activity feed wants what moved last — and under
        // the actionable order a request approved five minutes ago sat below one that has
        // been pending since last month, which is not what "recent activity" means.
        //
        // Both end on the id so the order is total: two requests filed in the same second
        // otherwise tie, and this list is paginated server-side, where an unstable tie can
        // repeat a row on one page and drop it from the next.
        $request->query('sort') === 'activity'
            ? $query->orderByDesc('last_activity_at')->latest('id')
            : $query
                ->orderByRaw("CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'fulfilled' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END")
                ->latest()
                ->latest('id');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($type = $request->query('type')) {
            $query->where('type', $type);
        }
        if ($search = trim((string) $request->query('search'))) {
            // The service name is matched against the TYPE, not the stored title: the title is
            // one canonical English string while the SPA writes the service name in the
            // reader's language, so a Thai reader searching what they see on screen would
            // otherwise find nothing. RequestType::matching() resolves the term against both
            // languages, and `type` is indexed where a leading-wildcard LIKE on title cannot
            // be. The title LIKE stays for rows written before the server owned that column.
            $types = RequestType::matching($search);
            $query->where(function ($q) use ($search, $types) {
                $q->where('reference', 'like', "%{$search}%")
                    ->orWhere('title', 'like', "%{$search}%")
                    ->orWhere('requester_name', 'like', "%{$search}%");
                if ($types !== []) {
                    $q->orWhereIn('type', $types);
                }
            });
        }
        // Tab scopes: awaiting my decision / the IT fulfillment queue / only my own.
        if ($request->query('scope') === 'approvals') {
            // An account with no employee record cannot be anybody's approver, so the answer
            // is nothing — NOT the unfiltered list. The condition used to sit in the `if`,
            // which meant the administrator (employee_id null) asked for "waiting on me" and
            // got every request in the system back under that heading, each with
            // can_approve false and a meta.awaiting_me of 0 contradicting the rows beside it.
            $employeeId === null
                ? $query->whereIn('id', [])
                : $query->whereHas('approvals', fn ($a) => $a
                    ->actionableBy($employee)
                    ->where('status', ApprovalStatus::Current->value));
        } elseif ($request->query('scope') === 'queue' && $canFulfill) {
            $query->where('status', RequestStatus::Approved->value);
        } elseif ($request->query('scope') === 'mine') {
            // "Mine" means about me or by me: the request I filed, the one I filed for
            // somebody else, and the one somebody filed for me.
            $query->where(function ($q) use ($user, $employeeId) {
                $q->where('user_id', $user->id)->orWhere('submitted_by_user_id', $user->id);
                if ($employeeId !== null) {
                    $q->orWhere('employee_id', $employeeId);
                }
            });
        }

        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));
        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => ServiceRequestResource::collection($paginator->items()),
            'meta' => $this->meta($paginator, $visible, $canFulfill, $employee),
        ]);
    }

    public function store(StoreServiceRequestRequest $request): JsonResponse
    {
        $serviceRequest = $this->service->submit($request->user(), $request->validated());

        AuditLog::record('Submitted service request', $serviceRequest->reference, [
            'service_request_id' => $serviceRequest->id,
            'type' => $serviceRequest->type->value,
        ]);

        return (new ServiceRequestResource($serviceRequest->load(self::DETAIL_RELATIONS)))
            ->response()->setStatusCode(201);
    }

    public function show(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        // The same rule the attachment download route answers to — see
        // ServiceRequest::isVisibleTo.
        abort_unless($serviceRequest->isVisibleTo($request->user()), 403);

        return new ServiceRequestResource($serviceRequest->load(self::DETAIL_RELATIONS));
    }

    /** Approve the current step (note optional). */
    public function approve(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:2000']]);
        $serviceRequest = $this->service->approve($serviceRequest, $request->user(), $data['note'] ?? null);

        AuditLog::record('Approved service request step', $serviceRequest->reference);

        return new ServiceRequestResource($serviceRequest->load(self::DETAIL_RELATIONS));
    }

    /** Reject the current step — a remark is always required. */
    public function reject(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $data = $request->validate(['note' => ['required', 'string', 'max:2000']]);
        $serviceRequest = $this->service->reject($serviceRequest, $request->user(), $data['note']);

        AuditLog::record('Rejected service request', $serviceRequest->reference);

        return new ServiceRequestResource($serviceRequest->load(self::DETAIL_RELATIONS));
    }

    /** Mark an approved request done (IT queue). */
    public function fulfill(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $serviceRequest = $this->service->fulfill($serviceRequest, $request->user());

        AuditLog::record('Fulfilled service request', $serviceRequest->reference);

        return new ServiceRequestResource($serviceRequest->load(self::DETAIL_RELATIONS));
    }

    /** Requester withdraws their own pending request. */
    public function cancel(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $serviceRequest = $this->service->cancel($serviceRequest, $request->user());

        AuditLog::record('Cancelled service request', $serviceRequest->reference);

        return new ServiceRequestResource($serviceRequest->load(self::DETAIL_RELATIONS));
    }

    /**
     * KPI aggregates over the viewer's full visible set — independent of the
     * current page, search box and filters, so the stat cards stay stable.
     *
     * @param  callable(Builder): Builder  $visible
     * @return array<string, mixed>
     */
    private function meta($paginator, callable $visible, bool $canFulfill, ?Employee $employee): array
    {
        $counts = $visible(ServiceRequest::query())
            ->selectRaw('status, count(*) as n')
            ->groupBy('status')
            ->pluck('n', 'status');

        // Counted the way the "waiting on me" tab filters, group steps included — the card
        // and the list it heads must not disagree about how many there are.
        $awaitingMe = $employee === null ? 0 : RequestApproval::query()
            ->actionableBy($employee)
            ->where('status', ApprovalStatus::Current->value)
            ->where('kind', WorkflowStepKind::Approval->value)
            ->count();
        // Mean days from submit to the final decision, over the last 200 decided
        // requests (PHP-side for cross-database portability).
        $decided = $visible(ServiceRequest::query())
            ->whereIn('status', [RequestStatus::Approved->value, RequestStatus::Rejected->value, RequestStatus::Fulfilled->value])
            ->latest()->limit(200)
            ->get(['created_at', 'approved_at', 'rejected_at']);
        $cycles = $decided
            ->map(fn (ServiceRequest $r) => ($r->approved_at ?? $r->rejected_at)?->diffInMinutes($r->created_at, true))
            ->filter(fn ($minutes) => $minutes !== null);

        return [
            'total' => $paginator->total(),
            'per_page' => $paginator->perPage(),
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'pending' => (int) ($counts[RequestStatus::Pending->value] ?? 0),
            'approved' => (int) ($counts[RequestStatus::Approved->value] ?? 0),
            'rejected' => (int) ($counts[RequestStatus::Rejected->value] ?? 0),
            'fulfilled' => (int) ($counts[RequestStatus::Fulfilled->value] ?? 0),
            'cancelled' => (int) ($counts[RequestStatus::Cancelled->value] ?? 0),
            'awaiting_me' => $awaitingMe,
            'to_fulfill' => $canFulfill ? (int) ($counts[RequestStatus::Approved->value] ?? 0) : 0,
            'avg_cycle_days' => $cycles->isEmpty() ? null : round($cycles->avg() / 1440, 1),
        ];
    }
}
