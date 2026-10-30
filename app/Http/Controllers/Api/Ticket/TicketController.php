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

    /** True when the user may see every ticket (IT staff); others see only their own. */
    private function canViewAll(Request $request): bool
    {
        return (bool) $request->user()?->hasPermission('tickets.view_all');
    }

    /**
     * The requester's own assets as one-click picks in Take Case. Gated by tickets.resolve,
     * not assets.view, like the other cross-module peeks.
     */
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
        $paginator = $list->paginate($request->user(), $request->filters());

        return response()->json([
            'data' => TicketResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                ...$list->tabCounts($request->user()),
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
        abort_unless(
            $this->canViewAll($request) || $ticket->requester_id === $request->user()?->employee_id,
            403,
        );

        return (new TicketResource($ticket->load(['requester', 'assignee.employee', 'relatedAsset', 'attachments', 'updates.author.employee'])))->response();
    }

    /** An IT staff takes an open, unassigned case for themselves (TicketActionGuard::assertCanTake). */
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
        $this->guard->assertCanAssignTo($request->user(), $staff, $ticket);

        $ticket = $this->service->assign($ticket, $staff, $request->priority(), $request->user());
        AuditLog::record('Assigned ticket', "{$ticket->ticket_no} → {$staff->name}", subject: $ticket);

        return $this->actionResponse($ticket);
    }

    /** Hand an in-progress case to another IT staff; clocks and priority stay put. */
    public function forward(ForwardTicketRequest $request, Ticket $ticket): JsonResponse
    {
        $staff = $request->assignee();
        $this->guard->assertCanReceive($staff, $ticket);

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

    /**
     * The assignee writes a progress note on a case in flight. Handing the repair to a technician
     * rides on the same note, which is the reason for the new deadline.
     */
    public function storeUpdate(StoreTicketUpdateRequest $request, Ticket $ticket): JsonResponse
    {
        $user = $request->user();
        $class = $request->workClass();
        $before = $ticket->work_class;

        if ($class !== null && $class !== $before) {
            $this->guard->assertCanReclassify($user, $ticket, $class);
            $ticket = $this->service->setWorkClass($ticket, $user, $class, $request->validated('body'));
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

    /**
     * Correct a ticket's descriptive fields. Who may edit (IT staff, or the
     * requester while still Open) is enforced by UpdateTicketRequest::authorize.
     */
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
