<?php

namespace App\Http\Controllers\Api\Request;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\WorkflowStepKind;
use App\Http\Controllers\Controller;
use App\Http\Requests\Request\StoreServiceRequestRequest;
use App\Http\Resources\Request\ServiceRequestResource;
use App\Models\AuditLog;
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

        $visible = function ($query) use ($seesAll, $canFulfill, $user, $employeeId) {
            if ($seesAll) {
                return $query;
            }

            return $query->where(function ($q) use ($user, $employeeId, $canFulfill) {
                // Own requests, plus the ones filed on somebody else's behalf — an
                // onboarding request has no owner account to match on.
                $q->where('user_id', $user->id)
                    ->orWhere('submitted_by_user_id', $user->id);
                if ($employeeId !== null) {
                    $q->orWhereHas('approvals', fn ($a) => $a->where('approver_employee_id', $employeeId));
                }
                if ($canFulfill) {
                    $q->orWhereIn('status', [RequestStatus::Approved->value, RequestStatus::Fulfilled->value]);
                }
            });
        };

        // Actionable first (pending → approved → fulfilled → the rest), newest within each group.
        // approver.user comes along because each row reports whether its approver still
        // lacks a login — without it that is one extra query per approval row.
        $query = $visible(ServiceRequest::with(['approvals.approver.user', 'ticket']))
            ->orderByRaw("CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'fulfilled' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END")
            ->latest();

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($type = $request->query('type')) {
            $query->where('type', $type);
        }
        if ($search = trim((string) $request->query('search'))) {
            $query->where(function ($q) use ($search) {
                $q->where('reference', 'like', "%{$search}%")
                    ->orWhere('title', 'like', "%{$search}%")
                    ->orWhere('requester_name', 'like', "%{$search}%");
            });
        }
        // Tab scopes: awaiting my decision / the IT fulfillment queue / only my own.
        if ($request->query('scope') === 'approvals' && $employeeId !== null) {
            $query->whereHas('approvals', fn ($a) => $a
                ->where('approver_employee_id', $employeeId)
                ->where('status', ApprovalStatus::Current->value));
        } elseif ($request->query('scope') === 'queue' && $canFulfill) {
            $query->where('status', RequestStatus::Approved->value);
        } elseif ($request->query('scope') === 'mine') {
            $query->where(fn ($q) => $q->where('user_id', $user->id)->orWhere('submitted_by_user_id', $user->id));
        }

        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));
        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => ServiceRequestResource::collection($paginator->items()),
            'meta' => $this->meta($paginator, $visible, $canFulfill, $employeeId),
        ]);
    }

    public function store(StoreServiceRequestRequest $request): JsonResponse
    {
        $serviceRequest = $this->service->submit($request->user(), $request->validated());

        AuditLog::record('Submitted service request', $serviceRequest->reference, [
            'service_request_id' => $serviceRequest->id,
            'type' => $serviceRequest->type->value,
        ]);

        return (new ServiceRequestResource($serviceRequest->load(['approvals.approver.user', 'ticket', 'workflow'])))
            ->response()->setStatusCode(201);
    }

    public function show(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $user = $request->user();
        $isParticipant = $user->id === $serviceRequest->user_id
            || $user->id === $serviceRequest->submitted_by_user_id
            || ($user->employee_id !== null && $serviceRequest->approvals()
                ->where('approver_employee_id', $user->employee_id)->exists());
        abort_unless($isParticipant
            || $user->isSuper()
            || $user->hasPermission('requests.view_all')
            || $user->hasPermission('requests.fulfill'), 403);

        return new ServiceRequestResource($serviceRequest->load(['approvals.approver.user', 'ticket', 'workflow']));
    }

    /** Approve the current step (note optional). */
    public function approve(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:2000']]);
        $serviceRequest = $this->service->approve($serviceRequest, $request->user(), $data['note'] ?? null);

        AuditLog::record('Approved service request step', $serviceRequest->reference);

        return new ServiceRequestResource($serviceRequest->load(['approvals.approver.user', 'ticket']));
    }

    /** Reject the current step — a remark is always required. */
    public function reject(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $data = $request->validate(['note' => ['required', 'string', 'max:2000']]);
        $serviceRequest = $this->service->reject($serviceRequest, $request->user(), $data['note']);

        AuditLog::record('Rejected service request', $serviceRequest->reference);

        return new ServiceRequestResource($serviceRequest->load(['approvals.approver.user', 'ticket']));
    }

    /** Mark an approved request done (IT queue). */
    public function fulfill(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $serviceRequest = $this->service->fulfill($serviceRequest, $request->user());

        AuditLog::record('Fulfilled service request', $serviceRequest->reference);

        return new ServiceRequestResource($serviceRequest->load(['approvals.approver.user', 'ticket']));
    }

    /** Requester withdraws their own pending request. */
    public function cancel(Request $request, ServiceRequest $serviceRequest): ServiceRequestResource
    {
        $serviceRequest = $this->service->cancel($serviceRequest, $request->user());

        AuditLog::record('Cancelled service request', $serviceRequest->reference);

        return new ServiceRequestResource($serviceRequest->load(['approvals.approver.user', 'ticket']));
    }

    /**
     * KPI aggregates over the viewer's full visible set — independent of the
     * current page, search box and filters, so the stat cards stay stable.
     *
     * @param  callable(Builder): Builder  $visible
     * @return array<string, mixed>
     */
    private function meta($paginator, callable $visible, bool $canFulfill, ?int $employeeId): array
    {
        $counts = $visible(ServiceRequest::query())
            ->selectRaw('status, count(*) as n')
            ->groupBy('status')
            ->pluck('n', 'status');

        $awaitingMe = $employeeId === null ? 0 : RequestApproval::where('approver_employee_id', $employeeId)
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
