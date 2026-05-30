<?php

namespace App\Http\Controllers\Api;

use App\Enums\TicketCategory;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTicketRequest;
use App\Http\Resources\TicketResource;
use App\Models\AuditLog;
use App\Models\Ticket;
use App\Models\User;
use App\Services\TicketService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Enum;

class TicketController extends Controller
{
    public function __construct(private readonly TicketService $service) {}

    /** True when the user may see every ticket (IT staff); others see only their own. */
    private function canViewAll(Request $request): bool
    {
        return (bool) $request->user()?->hasPermission('tickets.view_all');
    }

    /**
     * Paginated ticket list. IT staff (tickets.view_all) see all tickets; everyone
     * else sees only the ones they requested. Supports search (no/subject) plus
     * status / category / priority filters, and a "mine" scope for assignees.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Ticket::query()->with(['requester', 'assignee', 'relatedAsset', 'attachments'])->latest('id');

        if (! $this->canViewAll($request)) {
            $query->where('requester_id', $request->user()?->employee_id);
        }

        if ($request->boolean('mine')) {
            $query->where('assignee_id', $request->user()?->id);
        }
        if ($request->filled('search')) {
            $q = '%'.$request->query('search').'%';
            $query->where(function ($w) use ($q) {
                $w->where('ticket_no', 'like', $q)->orWhere('subject', 'like', $q);
            });
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }
        if ($request->filled('category')) {
            $query->where('category', $request->query('category'));
        }
        if ($request->filled('priority')) {
            $query->where('priority', $request->query('priority'));
        }

        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));
        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => TicketResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    /** Dashboard aggregates: status counts and a per-category breakdown (IT only). */
    public function summary(Request $request): JsonResponse
    {
        abort_unless($this->canViewAll($request), 403);

        $tickets = Ticket::all();

        $byCategory = collect(TicketCategory::cases())->map(fn (TicketCategory $c) => [
            'category' => $c->value,
            'count' => $tickets->where('category', $c)->count(),
        ]);

        return response()->json([
            'total' => $tickets->count(),
            'open' => $tickets->where('status', TicketStatus::Open)->count(),
            'in_progress' => $tickets->where('status', TicketStatus::InProgress)->count(),
            'completed' => $tickets->where('status', TicketStatus::Completed)->count(),
            'canceled' => $tickets->where('status', TicketStatus::Canceled)->count(),
            'by_category' => $byCategory,
        ]);
    }

    /**
     * IT staff who can be assigned a ticket — login accounts holding the super or
     * admin (IT) role. Used to populate the super admin's assign dropdown.
     */
    public function staff(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.assign'), 403);

        $staff = User::query()
            ->whereHas('role', fn ($q) => $q->whereIn('key', ['super', 'admin']))
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name]);

        return response()->json(['data' => $staff]);
    }

    /** Raise a new ticket; the requester is the current user's linked employee. */
    public function store(StoreTicketRequest $request): JsonResponse
    {
        $employee = $request->user()?->employee;
        abort_if($employee === null, 422, 'Your account is not linked to an employee record.');

        $ticket = $this->service->create($request->validated(), $employee);
        AuditLog::record('Created ticket', "{$ticket->ticket_no} — {$ticket->subject}");

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, Ticket $ticket): JsonResponse
    {
        abort_unless(
            $this->canViewAll($request) || $ticket->requester_id === $request->user()?->employee_id,
            403,
        );

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))->response();
    }

    /** An IT staff takes an open, unassigned case for themselves (tickets.resolve). */
    public function take(Request $request, Ticket $ticket): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.resolve'), 403);
        abort_unless($ticket->status === TicketStatus::Open && $ticket->isUnassigned(), 422, 'Ticket is not open for taking.');

        $data = $request->validate([
            'priority' => ['required', new Enum(TicketPriority::class)],
            'note' => ['nullable', 'string', 'max:2000'],
            'related_asset_id' => ['nullable', Rule::exists('assets', 'id')],
        ]);

        $ticket = $this->service->take(
            $ticket,
            $request->user(),
            TicketPriority::from($data['priority']),
            $data['note'] ?? null,
            $data['related_asset_id'] ?? null,
        );
        AuditLog::record('Took ticket', "{$ticket->ticket_no} → {$request->user()?->name}");

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }

    /** A super admin assigns an open case to a chosen IT staff (tickets.assign). */
    public function assign(Request $request, Ticket $ticket): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.assign'), 403);
        abort_unless($ticket->status === TicketStatus::Open, 422, 'Only open tickets can be assigned.');

        $data = $request->validate([
            'assignee_id' => ['required', Rule::exists('users', 'id')],
            'priority' => ['required', new Enum(TicketPriority::class)],
        ]);

        $staff = User::findOrFail($data['assignee_id']);
        $ticket = $this->service->assign($ticket, $staff, TicketPriority::from($data['priority']));
        AuditLog::record('Assigned ticket', "{$ticket->ticket_no} → {$staff->name}");

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }

    /**
     * The assignee completes or cancels an in-progress case with a resolution note
     * (tickets.resolve). Only the assignee may close their own case.
     */
    public function resolve(Request $request, Ticket $ticket): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.resolve'), 403);
        abort_unless($ticket->assignee_id === $request->user()?->id, 403, 'Only the assignee can resolve this ticket.');
        abort_unless($ticket->status === TicketStatus::InProgress, 422, 'Only in-progress tickets can be resolved.');

        $data = $request->validate([
            'mode' => ['required', 'in:complete,cancel'],
            'resolution' => ['required', 'string', 'min:10', 'max:5000'],
        ]);

        $ticket = $this->service->resolve($ticket, $data['mode'] === 'complete', $data['resolution']);
        AuditLog::record('Resolved ticket', "{$ticket->ticket_no} → {$ticket->status?->value}");

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }

    /** Delete a ticket (tickets.delete). */
    public function destroy(Request $request, Ticket $ticket): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.delete'), 403);
        AuditLog::record('Deleted ticket', "{$ticket->ticket_no} — {$ticket->subject}");
        $ticket->delete();

        return response()->json(['message' => 'success']);
    }
}
