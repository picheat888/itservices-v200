<?php

namespace App\Http\Controllers\Api\Ticket;

use App\Http\Controllers\Controller;
use App\Http\Requests\Ticket\AssignTicketRequest;
use App\Http\Requests\Ticket\ForwardTicketRequest;
use App\Http\Requests\Ticket\ResolveTicketRequest;
use App\Http\Requests\Ticket\StoreTicketRequest;
use App\Http\Requests\Ticket\StoreTicketUpdateRequest;
use App\Http\Requests\Ticket\TakeTicketRequest;
use App\Http\Requests\Ticket\TicketIndexRequest;
use App\Http\Requests\Ticket\TicketSummaryRequest;
use App\Http\Requests\Ticket\UpdateTicketRequest;
use App\Http\Resources\Ticket\TicketResource;
use App\Models\AuditLog;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Sidebar\SidebarBadgeService;
use App\Services\Ticket\TicketActionGuard;
use App\Services\Ticket\TicketAssetPickerService;
use App\Services\Ticket\TicketClosureService;
use App\Services\Ticket\TicketListService;
use App\Services\Ticket\TicketService;
use App\Services\Ticket\TicketSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TicketController extends Controller
{
    public function __construct(
        private readonly TicketService $service,
        private readonly TicketActionGuard $guard,
    ) {}

    /** The requester's own assets as Take Case picks; gated by tickets.resolve, not assets.view. */
    public function requesterAssets(Request $request, Ticket $ticket, TicketAssetPickerService $assets): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.resolve'), 403);

        return response()->json(['data' => $assets->heldByRequester($ticket)]);
    }

    /** Any asset, found by typing, for the Take Case picker (same gate as requesterAssets). */
    public function assetOptions(Request $request, TicketAssetPickerService $assets): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.resolve'), 403);

        return response()->json(['data' => $assets->search($request->query('search'))]);
    }

    /** Paginated ticket list with the tab badge counts in meta. */
    public function index(TicketIndexRequest $request, TicketListService $list): JsonResponse
    {
        ['page' => $paginator, 'counts' => $counts] = $list->page($request->user(), $request->filters());

        return response()->json([
            'data' => TicketResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                ...$counts,
            ],
        ]);
    }

    /** Overview figures for the chosen window against the one before it. */
    public function summary(TicketSummaryRequest $request, TicketSummaryService $summary): JsonResponse
    {
        ['start' => $start, 'end' => $end, 'days' => $days] = $request->window();

        return response()->json($summary->overview($request->user(), $start, $end, $days));
    }

    /** "Needs my attention" count for the sidebar badge (SidebarBadgeService). */
    public function badge(Request $request, SidebarBadgeService $badges): JsonResponse
    {
        return response()->json(['count' => $badges->ticketsNeedingAttention($request->user())]);
    }

    /** Staff who can work a case, for the Assign and Forward pickers. */
    public function staff(Request $request): JsonResponse
    {
        // Assigners need it for Assign; assignees (resolve/forward) need it for Forward.
        abort_unless(
            (bool) $request->user()?->hasPermission('tickets.assign')
                || (bool) $request->user()?->hasPermission('tickets.resolve')
                || (bool) $request->user()?->hasPermission('tickets.forward'),
            403
        );

        // Narrowed to the case's category Level when one is passed (?category=)
        $category = $request->query('category');
        $staff = $this->service->staff(is_string($category) ? $category : null)
            // employee_id lets the pickers drop the case's own requester (assign/forward reject them)
            ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'name_th' => $u->name_th, 'employee_id' => $u->employee_id]);

        return response()->json(['data' => $staff]);
    }

    /** Raise a new ticket; the requester is the current user's linked employee. */
    public function store(StoreTicketRequest $request): JsonResponse
    {
        $employee = $request->user()?->employee;
        abort_if($employee === null, 422, 'no_employee_link');

        $ticket = $this->service->create($request->validated(), $employee);
        AuditLog::record('Created ticket', "{$ticket->ticket_no} - {$ticket->subject}", subject: $ticket);

        return (new TicketResource($ticket->load(['requester', 'assignee.employee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, Ticket $ticket): JsonResponse
    {
        $this->guard->canView($request->user(), $ticket)->authorize();

        return (new TicketResource($ticket->load(['requester', 'assignee.employee', 'relatedAsset', 'attachments', 'updates.author.employee'])))->response();
    }

    /** An IT staff takes an open, unassigned case for themselves. */
    public function take(TakeTicketRequest $request, Ticket $ticket): JsonResponse
    {
        $ticket = $this->service->take(
            $ticket,
            $request->user(),
            $request->priority(),
            $request->validated('note'),
            $request->validated('related_asset_id'),
            keepLinkedAsset: $request->keepsLinkedAsset(),
        );
        AuditLog::record('Took ticket', "{$ticket->ticket_no} → {$request->user()?->name}", subject: $ticket);

        return $this->actionResponse($ticket);
    }

    /** A dispatcher assigns an open case to another IT staff (tickets.assign). */
    public function assign(AssignTicketRequest $request, Ticket $ticket): JsonResponse
    {
        $staff = $request->assignee();
        $ticket = $this->service->assign($ticket, $staff, $request->priority(), $request->user());
        AuditLog::record('Assigned ticket', "{$ticket->ticket_no} → {$staff->name}", subject: $ticket);

        return $this->actionResponse($ticket);
    }

    /** Hand an in-progress case to another IT staff; clocks and priority stay put. */
    public function forward(ForwardTicketRequest $request, Ticket $ticket): JsonResponse
    {
        $staff = $request->assignee();
        $ticket = $this->service->forward($ticket, $staff, $request->user());
        AuditLog::record('Forwarded ticket', "{$ticket->ticket_no} → {$staff->name}", subject: $ticket);

        return $this->actionResponse($ticket);
    }

    /** The assignee completes or cancels their in-progress case; a request it came from settles with it. */
    public function resolve(ResolveTicketRequest $request, Ticket $ticket, TicketClosureService $closure): JsonResponse
    {
        $ticket = $closure->close($ticket, $request->user(), $request->completes(), $request->validated('resolution'));

        return $this->actionResponse($ticket);
    }

    /** The assignee's progress note; a change of work class rides on it as the reason. */
    public function storeUpdate(StoreTicketUpdateRequest $request, Ticket $ticket): JsonResponse
    {
        $user = $request->user();
        $before = $ticket->work_class;

        if ($request->reclassifies()) {
            $ticket = $this->service->setWorkClass($ticket, $user, $request->workClass(), $request->validated('body'));
            AuditLog::record(
                'Classified ticket work',
                sprintf('%s - %s → %s', $ticket->ticket_no, $before?->value ?? 'standard', $ticket->work_class->value),
                subject: $ticket,
            );
        } else {
            $this->service->addUpdate($ticket, $user, $request->validated('body'));
            $ticket = $ticket->fresh();
            AuditLog::record('Updated ticket progress', "{$ticket->ticket_no} - {$ticket->subject}", subject: $ticket);
        }

        return (new TicketResource($ticket->load(['requester', 'assignee.employee', 'relatedAsset', 'attachments', 'updates.author.employee'])))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Correct a ticket's descriptive fields; who may edit is UpdateTicketRequest::authorize. */
    public function update(UpdateTicketRequest $request, Ticket $ticket): JsonResponse
    {
        $ticket = $this->service->update($ticket, $request->validated());
        AuditLog::record('Updated ticket', "{$ticket->ticket_no} - {$ticket->subject}", subject: $ticket);

        return $this->actionResponse($ticket);
    }

    /** The case after a workflow action, as the dialogs that sent it read it back. */
    private function actionResponse(Ticket $ticket): JsonResponse
    {
        return (new TicketResource($ticket->load(['requester', 'assignee.employee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }
}
