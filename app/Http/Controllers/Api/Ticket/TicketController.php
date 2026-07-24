<?php

namespace App\Http\Controllers\Api\Ticket;

use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Ticket\StoreTicketRequest;
use App\Http\Requests\Ticket\UpdateTicketRequest;
use App\Http\Resources\Ticket\TicketResource;
use App\Models\AuditLog;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Ticket\TicketService;
use App\Support\TicketSla;
use Illuminate\Database\Eloquent\Collection;
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
        $query = Ticket::query()->with(['requester', 'assignee', 'relatedAsset', 'attachments']);

        // Whitelisted sort orders (?sort=): newest (default), oldest, recently
        // updated, or priority high→low (CASE keeps it portable across MySQL/SQLite).
        match ($request->query('sort')) {
            'created_asc' => $query->oldest('id'),
            'updated_desc' => $query->orderByDesc('updated_at')->latest('id'),
            'priority_desc' => $query
                ->orderByRaw("CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END")
                ->latest('id'),
            default => $query->latest('id'),
        };

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

    /**
     * Dashboard aggregates over a selectable window (7 / 30 / 90 days, default 30):
     * inbound (created) and closed (resolved) flow each with a trend vs the previous
     * equal-length window, the current unresolved backlog (open + in progress), and
     * the window's SLA %, average response, and per-category mix.
     */
    public function summary(Request $request): JsonResponse
    {
        abort_unless($this->canViewAll($request), 403);

        $days = (int) $request->query('days', 30);
        if (! in_array($days, [7, 30, 90], true)) {
            $days = 30;
        }

        $now = now();
        $curStart = $now->copy()->subDays($days);
        $prevStart = $now->copy()->subDays($days * 2);

        $tickets = Ticket::all();

        // Inbound flow — tickets created in the current vs the previous window.
        $createdCur = $tickets->filter(fn (Ticket $t) => $t->created_at >= $curStart)->count();
        $createdPrev = $tickets->filter(fn (Ticket $t) => $t->created_at >= $prevStart && $t->created_at < $curStart)->count();

        // Closed flow — tickets resolved (completed or canceled) in each window.
        $resolvedInWindow = fn ($start, $end) => $tickets->filter(
            fn (Ticket $t) => $t->resolved_at !== null && $t->resolved_at >= $start && ($end === null || $t->resolved_at < $end)
        );
        $resolvedCur = $resolvedInWindow($curStart, null)->count();
        $resolvedPrev = $resolvedInWindow($prevStart, $curStart)->count();

        // Backlog is a point-in-time snapshot of everything still unresolved.
        $open = $tickets->where('status', TicketStatus::Open)->count();
        $inProgress = $tickets->where('status', TicketStatus::InProgress)->count();

        // SLA % over the tickets resolved within each window, so the trend is comparable.
        $slaCur = $this->slaMetPct($resolvedInWindow($curStart, null));
        $slaPrev = $this->slaMetPct($resolvedInWindow($prevStart, $curStart));

        $byCategory = collect(TicketCategory::cases())->map(fn (TicketCategory $c) => [
            'category' => $c->value,
            'count' => $tickets->filter(fn (Ticket $t) => $t->category === $c && $t->created_at >= $curStart)->count(),
        ]);

        return response()->json([
            'range_days' => $days,

            'created' => $createdCur,
            'created_delta_pct' => $this->deltaPct($createdCur, $createdPrev),

            'resolved' => $resolvedCur,
            'resolved_delta_pct' => $this->deltaPct($resolvedCur, $resolvedPrev),

            'backlog' => $open + $inProgress,
            'backlog_open' => $open,
            'backlog_in_progress' => $inProgress,

            'sla_met_pct' => $slaCur,
            'sla_delta_pts' => ($slaCur === null || $slaPrev === null) ? null : $slaCur - $slaPrev,

            'avg_response_minutes' => $this->avgResponseMinutes(
                $tickets->filter(fn (Ticket $t) => $t->responded_at !== null && $t->responded_at >= $curStart)
            ),

            'by_category' => $byCategory,
        ]);
    }

    /** Percent change of $current against $previous; null when there's no prior baseline. */
    private function deltaPct(int $current, int $previous): ?int
    {
        if ($previous === 0) {
            return null;
        }

        return (int) round((($current - $previous) / $previous) * 100);
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

    /**
     * Average first-response time in minutes (created → responded), rounded.
     * Null when no ticket has been responded to yet.
     *
     * @param  Collection<int, Ticket>  $tickets
     */
    private function avgResponseMinutes(Collection $tickets): ?int
    {
        $responded = $tickets->filter(fn (Ticket $t) => $t->responded_at !== null);
        if ($responded->isEmpty()) {
            return null;
        }

        return (int) round($responded->avg(fn (Ticket $t) => $t->created_at->diffInMinutes($t->responded_at)));
    }

    /**
     * Percentage of completed tickets closed within their priority's resolution
     * target. Null when nothing has been completed yet.
     *
     * @param  Collection<int, Ticket>  $tickets
     */
    private function slaMetPct(Collection $tickets): ?int
    {
        $completed = $tickets->filter(fn (Ticket $t) => $t->status === TicketStatus::Completed && $t->resolved_at !== null);
        if ($completed->isEmpty()) {
            return null;
        }

        $met = $completed->filter(function (Ticket $t) {
            $target = $t->created_at->copy()->addHours(TicketSla::resolveHours($t->priority?->value));

            return $t->resolved_at->lessThanOrEqualTo($target);
        })->count();

        return (int) round(($met / $completed->count()) * 100);
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

    /**
     * Correct a ticket's descriptive fields. Who may edit (IT staff, or the
     * requester while still Open) is enforced by UpdateTicketRequest::authorize.
     */
    public function update(UpdateTicketRequest $request, Ticket $ticket): JsonResponse
    {
        $ticket = $this->service->update($ticket, $request->validated());
        AuditLog::record('Updated ticket', "{$ticket->ticket_no} — {$ticket->subject}");

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }
}
