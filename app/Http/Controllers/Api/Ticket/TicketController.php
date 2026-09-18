<?php

namespace App\Http\Controllers\Api\Ticket;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketStatus;
use App\Enums\Ticket\TicketWorkClass;
use App\Http\Controllers\Controller;
use App\Http\Requests\Ticket\StoreTicketRequest;
use App\Http\Requests\Ticket\UpdateTicketRequest;
use App\Http\Resources\Ticket\TicketResource;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Request\RequestService;
use App\Services\Sidebar\SidebarBadgeService;
use App\Services\Ticket\TicketService;
use App\Support\Permissions;
use App\Support\TicketSla;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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
     * Read-only list of the assets the ticket's REQUESTER currently holds, so the
     * Take Case dialog can offer their own devices as one-click picks. Gated by
     * tickets.resolve (a taker-side read) — NOT assets.view — mirroring the
     * cross-module "peek" pattern (asset → contract, employee → assets).
     */
    public function requesterAssets(Request $request, Ticket $ticket): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.resolve'), 403);

        $assets = Asset::query()
            ->with('model')
            ->where('owner_employee_id', $ticket->requester_id)
            ->orderByDesc('owned_since')
            ->get()
            ->map(fn (Asset $a) => [
                'id' => $a->id,
                'asset_code' => $a->asset_code,
                'model' => $a->model?->name,
            ]);

        return response()->json(['data' => $assets]);
    }

    /**
     * Ticket categories the user's Level keys grant (tickets.level_*). Staff-side
     * visibility, taking, target lists and alerts are all scoped to these — strict:
     * an empty list means no cases at all.
     *
     * @return list<string>
     */
    private static function levelsFor(?User $user): array
    {
        // Implementation lives in Support\Permissions so the sidebar badge resolves the
        // very same levels without importing this controller.
        return Permissions::ticketLevelsFor($user);
    }

    /**
     * Paginated ticket list. IT staff (tickets.view_all) see all tickets; everyone
     * else sees only the ones they requested. Supports search (no/subject) plus
     * status / category / priority filters, a "mine" scope for assignees, and a
     * "requested" scope (gated by tickets.my) for tickets the user filed themselves.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Ticket::query()->with(['requester', 'assignee', 'relatedAsset', 'attachments', 'serviceRequest']);

        if ($request->boolean('requested')) {
            // My Tickets: only what the user filed themselves, behind its own gate
            // so the tab can be granted per role from Permission Management.
            abort_unless((bool) $request->user()?->hasPermission('tickets.my'), 403);
            $query->where('requester_id', $request->user()?->employee_id);
        }

        if ($request->boolean('mine')) {
            $query->where('assignee_id', $request->user()?->id);
            // My Jobs: work still in motion (open / in progress) comes first; finished
            // work (completed / canceled) sinks below. The chosen sort applies within
            // each group because this ORDER BY is registered before it.
            $query->orderByRaw("CASE WHEN status IN ('completed', 'canceled') THEN 1 ELSE 0 END");
        }

        // The deadline of the clock a ticket is currently running against: response
        // while it waits for a take, resolution afterwards (persisted columns).
        $activeDue = "CASE WHEN status = 'open' AND responded_at IS NULL THEN sla_response_due_at ELSE sla_resolve_due_at END";

        // Whitelisted sort orders (?sort=): newest (default), oldest, recently
        // updated, priority high→low, or most-urgent SLA first (CASE keeps them
        // portable across MySQL/SQLite).
        // Priority and the SLA clocks are only shown to whoever can take a case
        // (TicketResource::showsDeskInternals), so they are not something to sort or filter by
        // either — a hand-typed ?sort=priority_desc would otherwise order the list by a column
        // the reader is not being shown.
        $canSeeInternals = TicketResource::showsDeskInternals($request);
        $sort = (string) $request->query('sort');
        if (! $canSeeInternals && in_array($sort, ['priority_desc', 'sla_due'], true)) {
            $sort = '';
        }

        match ($sort) {
            'created_asc' => $query->oldest('id'),
            'updated_desc' => $query->orderByDesc('updated_at')->latest('id'),
            'priority_desc' => $query
                ->orderByRaw("CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END")
                ->latest('id'),
            'sla_due' => $query
                // Work still in motion first, then whichever deadline lands soonest.
                ->orderByRaw("CASE WHEN status IN ('completed', 'canceled') THEN 1 ELSE 0 END")
                ->orderByRaw("{$activeDue} ASC")
                ->latest('id'),
            default => $query->latest('id'),
        };

        // SLA filter (?sla=breached): active tickets whose current deadline has passed.
        if ($canSeeInternals && $request->query('sla') === 'breached') {
            $query->whereIn('status', TicketStatus::liveValues())
                ->whereRaw("{$activeDue} < ?", [now()->toDateTimeString()]);
        }

        if (! $this->canViewAll($request)) {
            $query->where('requester_id', $request->user()?->employee_id);
        } elseif (! $request->boolean('mine') && ! $request->boolean('requested')) {
            // Staff browsing the all-tickets tab see only the categories their
            // Ticket Level grants (own assignments / own requests are never scoped).
            $query->whereIn('category', self::levelsFor($request->user()));
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
        if ($canSeeInternals && $request->filled('priority')) {
            $query->where('priority', $request->query('priority'));
        }

        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));
        $paginator = $query->paginate($perPage);

        // Tab badges, deliberately ignoring the tab filters so the counts never
        // shift with them: open tickets in the viewer's scope (All tab) and the
        // viewer's own unfinished assignments (My Jobs tab).
        $openCount = Ticket::query()
            ->when(
                $this->canViewAll($request),
                fn ($q) => $q->whereIn('category', self::levelsFor($request->user())),
                fn ($q) => $q->where('requester_id', $request->user()?->employee_id),
            )
            ->where('status', TicketStatus::Open)
            ->count();
        $myJobsCount = Ticket::query()
            ->where('assignee_id', $request->user()?->id)
            ->whereIn('status', TicketStatus::working())
            ->count();
        // The viewer's own still-unresolved requests (My Tickets tab).
        $myTicketsCount = Ticket::query()
            ->where('requester_id', $request->user()?->employee_id)
            ->whereIn('status', TicketStatus::live())
            ->count();

        return response()->json([
            'data' => TicketResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'open_count' => $openCount,
                'my_jobs_count' => $myJobsCount,
                'my_tickets_count' => $myTicketsCount,
            ],
        ]);
    }

    /**
     * Dashboard aggregates over a selectable window — a preset (7 / 30 / 90 days,
     * default 30) or a custom inclusive ?from=&to= date pair (capped at 366 days):
     * inbound (created) and closed (resolved) flow each with a trend vs the previous
     * equal-length window, the current unresolved backlog (open + in progress), and
     * the window's SLA %, average response, and per-category mix.
     */
    public function summary(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.view_dashboard'), 403);

        if ($request->filled('from') || $request->filled('to')) {
            $request->validate([
                'from' => ['required', 'date_format:Y-m-d'],
                'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            ]);
            $curEnd = Carbon::parse($request->query('to'))->endOfDay();
            $curStart = Carbon::parse($request->query('from'))->startOfDay();
            if ($curStart->diffInDays($curEnd) > 366) {
                $curStart = $curEnd->copy()->subDays(366)->startOfDay();
            }
            $days = (int) round($curStart->diffInDays($curEnd));
        } else {
            $days = (int) $request->query('days', 30);
            if (! in_array($days, [7, 30, 90], true)) {
                $days = 30;
            }
            $curEnd = now();
            $curStart = $curEnd->copy()->subDays($days);
        }

        // The comparison window sits immediately before, with the exact same length.
        $windowSeconds = (int) $curStart->diffInSeconds($curEnd);
        $prevStart = $curStart->copy()->subSeconds($windowSeconds);

        $tickets = Ticket::all();

        // Inbound flow — tickets created in the current vs the previous window.
        $createdCur = $tickets->filter(fn (Ticket $t) => $t->created_at >= $curStart && $t->created_at <= $curEnd)->count();
        $createdPrev = $tickets->filter(fn (Ticket $t) => $t->created_at >= $prevStart && $t->created_at < $curStart)->count();

        // Closed flow — tickets resolved (completed or canceled) in each window.
        $resolvedInWindow = fn ($start, $end) => $tickets->filter(
            fn (Ticket $t) => $t->resolved_at !== null && $t->resolved_at >= $start && $t->resolved_at <= $end
        );
        $resolvedCur = $resolvedInWindow($curStart, $curEnd)->count();
        $resolvedPrev = $resolvedInWindow($prevStart, $curStart)->count();

        // 30/45 วันเป็น KPI คนละตัวกับ SLA อยู่แล้วในความเป็นจริงขององค์กร การเอาเป้าหมาย
        // 4 ชั่วโมงกับ 360 ชั่วโมงมาเฉลี่ยเป็นเปอร์เซ็นต์เดียวทำให้ตัวเลขอ่านยากขึ้น ไม่ใช่ง่ายขึ้น
        // เคสตกกลุ่มไหนตัดสินจากค่า work_class ปัจจุบัน — AuditLog เก็บประวัติไว้ให้แล้วถ้าต้องสาว
        $isRepair = fn (Ticket $t) => $t->work_class?->isRepair() ?? false;
        $standardIn = fn ($start, $end) => $resolvedInWindow($start, $end)->reject($isRepair);
        $repairIn = fn ($start, $end) => $resolvedInWindow($start, $end)->filter($isRepair);

        // Backlog is a point-in-time snapshot of everything still unresolved.
        $open = $tickets->where('status', TicketStatus::Open)->count();
        $inProgress = $tickets->where('status', TicketStatus::InProgress)->count();

        // Cases currently past their active SLA deadline (response clock while open
        // and untaken, resolution clock afterwards) — the dashboard's red status row.
        $breachedNow = $tickets
            ->filter(fn (Ticket $t) => in_array($t->status, TicketStatus::live(), true))
            ->filter(function (Ticket $t) {
                $due = ($t->status === TicketStatus::Open && $t->responded_at === null)
                    ? $t->sla_response_due_at
                    : $t->sla_resolve_due_at;

                return $due !== null && $due->isPast();
            })
            ->count();

        // SLA % over the tickets resolved within each window, so the trend is comparable.
        $slaCur = $this->slaMetPct($standardIn($curStart, $curEnd));
        $slaPrev = $this->slaMetPct($standardIn($prevStart, $curStart));

        // Repair KPI — same math, over the repair-classed cases the SLA figure above excludes.
        $repairCur = $this->slaMetPct($repairIn($curStart, $curEnd));
        $repairPrev = $this->slaMetPct($repairIn($prevStart, $curStart));

        // Response SLA % over the tickets first-responded within each window. Open
        // tickets that are already past due are NOT counted here — they live in the
        // backlog KPI and the red per-ticket badge instead.
        $respondedInWindow = fn ($start, $end) => $tickets->filter(
            fn (Ticket $t) => $t->responded_at !== null && $t->responded_at >= $start && $t->responded_at <= $end
        );
        $respSlaCur = $this->responseSlaMetPct($respondedInWindow($curStart, $curEnd));
        $respSlaPrev = $this->responseSlaMetPct($respondedInWindow($prevStart, $curStart));

        // Average time-to-take per window (minutes) — the delta reads negative = faster.
        $avgCur = $this->avgResponseMinutes($respondedInWindow($curStart, $curEnd));
        $avgPrev = $this->avgResponseMinutes($respondedInWindow($prevStart, $curStart));

        $byCategory = collect(TicketCategory::cases())->map(fn (TicketCategory $c) => [
            'category' => $c->value,
            'count' => $tickets->filter(fn (Ticket $t) => $t->category === $c && $t->created_at >= $curStart && $t->created_at <= $curEnd)->count(),
        ]);

        return response()->json([
            'range_days' => $days,

            'created' => $createdCur,
            // Absolute change in tickets vs the previous window (always computable,
            // unlike a % change which has no baseline when the prior window is empty).
            'created_delta_count' => $createdCur - $createdPrev,

            'resolved' => $resolvedCur,
            // Absolute change in tickets vs the previous window — same reading as `created`.
            'resolved_delta_count' => $resolvedCur - $resolvedPrev,

            'backlog' => $open + $inProgress,
            'backlog_open' => $open,
            'backlog_in_progress' => $inProgress,
            'sla_breached_now' => $breachedNow,

            'sla_met_pct' => $slaCur,
            'sla_delta_pts' => ($slaCur === null || $slaPrev === null) ? null : $slaCur - $slaPrev,

            'repair_kpi_met_pct' => $repairCur,
            'repair_kpi_delta_pts' => ($repairCur === null || $repairPrev === null) ? null : $repairCur - $repairPrev,
            // งานซ่อมที่ยังไม่ปิด — ทำให้อ่านออกว่า null แปลว่า "ไม่มีงาน" หรือ "ยังไม่มีอันไหนปิด"
            'repair_backlog' => $tickets
                ->filter(fn (Ticket $t) => in_array($t->status, TicketStatus::live(), true))
                ->filter($isRepair)
                ->count(),
            // หน้าจอใช้ค่านี้ตัดสินว่าจะโชว์การ์ด KPI ไหม
            'has_repair_rules' => ! empty(TicketSla::rules()[SlaScope::WorkClass->value] ?? []),

            'response_sla_met_pct' => $respSlaCur,
            'response_sla_delta_pts' => ($respSlaCur === null || $respSlaPrev === null) ? null : $respSlaCur - $respSlaPrev,
            // The configured target (Settings → Ticket & SLA) the % above is judged against.
            'response_target_minutes' => TicketSla::responseMinutes(),

            'avg_response_minutes' => $avgCur,
            'avg_response_delta_minutes' => ($avgCur === null || $avgPrev === null) ? null : $avgCur - $avgPrev,

            'by_category' => $byCategory,
        ]);
    }

    /**
     * "Needs my attention" count for the sidebar badge — DISTINCT tickets that are
     * any of: open and waiting for a take (staff with tickets.resolve only), the
     * viewer's own unfinished assignments, or the viewer's own unresolved requests.
     * OR'd in one query so an overlapping ticket (e.g. staff filed it themselves)
     * is never counted twice. The count itself lives in SidebarBadgeService, which
     * serves the combined sidebar endpoint — one rule, two callers.
     */
    public function badge(Request $request, SidebarBadgeService $badges): JsonResponse
    {
        return response()->json(['count' => $badges->ticketsNeedingAttention($request->user())]);
    }

    /**
     * IT staff who can be assigned a ticket — login accounts holding the super or
     * admin (IT) role. Used to populate the super admin's assign dropdown.
     */
    public function staff(Request $request): JsonResponse
    {
        // Assigners need it for Assign; assignees (resolve/forward) need it for Forward.
        abort_unless(
            (bool) $request->user()?->hasPermission('tickets.assign')
                || (bool) $request->user()?->hasPermission('tickets.resolve')
                || (bool) $request->user()?->hasPermission('tickets.forward'),
            403
        );

        // Permission-first: whoever can actually work a case (tickets.resolve),
        // narrowed to the case's category Level when one is passed (?category=).
        $category = $request->query('category');
        $staff = User::all()
            ->filter(fn (User $u) => $u->hasPermission('tickets.resolve'))
            ->when(is_string($category) && $category !== '', fn ($c) => $c->filter(
                fn (User $u) => $u->hasPermission("tickets.level_{$category}"),
            ))
            ->sortBy('name')
            ->values()
            // employee_id so the pickers can drop the case's own requester: assign() and
            // forward() reject that person (anti case-pumping), and a name in the list that
            // always answers 422 is a choice the screen should never have offered.
            ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'employee_id' => $u->employee_id]);

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

        $met = $completed->filter(
            // Business-time deadline — the same clock the per-ticket SLA badge runs on.
            fn (Ticket $t) => $t->resolved_at->lessThanOrEqualTo(TicketSla::resolveDueAt($t))
        )->count();

        return (int) round(($met / $completed->count()) * 100);
    }

    /**
     * Percentage of first responses given within their priority's response target
     * (business time). Null when nothing has been responded to yet.
     *
     * @param  Collection<int, Ticket>  $tickets
     */
    private function responseSlaMetPct(Collection $tickets): ?int
    {
        $responded = $tickets->filter(fn (Ticket $t) => $t->responded_at !== null);
        if ($responded->isEmpty()) {
            return null;
        }

        $met = $responded->filter(
            fn (Ticket $t) => $t->responded_at->lessThanOrEqualTo(TicketSla::responseDueAt($t))
        )->count();

        return (int) round(($met / $responded->count()) * 100);
    }

    /** Raise a new ticket; the requester is the current user's linked employee. */
    public function store(StoreTicketRequest $request): JsonResponse
    {
        $employee = $request->user()?->employee;
        abort_if($employee === null, 422, 'Your account is not linked to an employee record.');

        $ticket = $this->service->create($request->validated(), $employee);
        AuditLog::record('Created ticket', "{$ticket->ticket_no} - {$ticket->subject}");

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, Ticket $ticket): JsonResponse
    {
        abort_unless(
            $this->canViewAll($request) || $ticket->requester_id === $request->user()?->employee_id,
            403,
        );

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments', 'updates'])))->response();
    }

    /** An IT staff takes an open, unassigned case for themselves (tickets.resolve). */
    public function take(Request $request, Ticket $ticket): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.resolve'), 403);
        // Ticket Level: only categories the taker's level keys grant.
        abort_unless(
            (bool) $request->user()?->hasPermission("tickets.level_{$ticket->category?->value}"),
            403,
            'Your Ticket Level does not cover this category.'
        );
        abort_unless($ticket->status === TicketStatus::Open && $ticket->isUnassigned(), 422, 'Ticket is not open for taking.');
        // Anti case-pumping: a case can never be handled by the person who filed it.
        abort_if(
            $ticket->requester_id !== null && $ticket->requester_id === $request->user()?->employee_id,
            422,
            'You cannot take a case you filed yourself.'
        );

        // A case opened from an approved request carries its own target, decided by what was
        // asked for. Priority is not merely optional there — it is refused, so the rule cannot
        // be worked around by posting one directly.
        $fromRequest = $ticket->serviceRequest()->exists();
        $data = $request->validate([
            'priority' => [$fromRequest ? 'prohibited' : 'required', new Enum(TicketPriority::class)],
            'note' => ['nullable', 'string', 'max:2000'],
            'related_asset_id' => ['nullable', Rule::exists('assets', 'id')],
        ]);

        $ticket = $this->service->take(
            $ticket,
            $request->user(),
            isset($data['priority']) ? TicketPriority::from($data['priority']) : null,
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
        $this->assertNotTheRequester($request, $ticket);
        abort_unless($ticket->status === TicketStatus::Open, 422, 'Only open tickets can be assigned.');

        // Same rule as take(): a request-born case is never given a priority.
        $fromRequest = $ticket->serviceRequest()->exists();
        $data = $request->validate([
            'assignee_id' => ['required', Rule::exists('users', 'id')],
            'priority' => [$fromRequest ? 'prohibited' : 'required', new Enum(TicketPriority::class)],
        ]);

        $staff = User::findOrFail($data['assignee_id']);
        // Assign hands a case to someone ELSE — taking it yourself is what Take Case
        // is for (it records an initial note and skips the self-addressed bell).
        abort_if($staff->id === $request->user()?->id, 422, 'Use Take Case to work this ticket yourself.');
        // Anti case-pumping: a case can never be handled by the person who filed it.
        abort_if(
            $staff->employee_id !== null && $staff->employee_id === $ticket->requester_id,
            422,
            'A case cannot be assigned to the person who filed it.'
        );
        $this->assertCanReceive($staff, $ticket);
        $ticket = $this->service->assign($ticket, $staff, isset($data['priority']) ? TicketPriority::from($data['priority']) : null, $request->user());
        AuditLog::record('Assigned ticket', "{$ticket->ticket_no} → {$staff->name}");

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }

    /**
     * Hand an in-progress case to another IT staff — by its current assignee (I'm
     * stuck / unavailable) or anyone holding tickets.assign (dispatcher moving a
     * stalled case). Clocks and priority stay put; the receiver gets a bell.
     */
    public function forward(Request $request, Ticket $ticket): JsonResponse
    {
        $user = $request->user();
        // Forwarding has its own gate; the actor must also be the case's assignee
        // or a dispatcher (tickets.assign) — a bystander with the gate can't move it.
        abort_unless((bool) $user?->hasPermission('tickets.forward'), 403);
        abort_unless($ticket->assignee_id === $user?->id || (bool) $user?->hasPermission('tickets.assign'), 403);
        // A dispatcher who filed this one is out too — see assertNotTheRequester. The
        // assignee branch above cannot reach here: a case never lands with its requester.
        $this->assertNotTheRequester($request, $ticket);
        abort_unless(in_array($ticket->status, TicketStatus::working(), true), 422, 'Only a case in progress can be forwarded.');

        $data = $request->validate([
            'assignee_id' => ['required', Rule::exists('users', 'id'), Rule::notIn([$ticket->assignee_id])],
        ]);

        $staff = User::findOrFail($data['assignee_id']);
        // Anti case-pumping: a case can never be handled by the person who filed it.
        abort_if(
            $staff->employee_id !== null && $staff->employee_id === $ticket->requester_id,
            422,
            'A case cannot be forwarded to the person who filed it.'
        );
        $this->assertCanReceive($staff, $ticket);

        $ticket = $this->service->forward($ticket, $staff);
        AuditLog::record('Forwarded ticket', "{$ticket->ticket_no} → {$staff->name}");

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }

    /**
     * Whoever filed a case does not decide who works it, tickets.assign or not.
     *
     * The anti case-pumping rule already says a case can never land with its requester;
     * this is the other half of it. Reading their own ticket that person is the one waiting
     * on IT, and routing it is a decision for somebody who is not also the customer. Their
     * case still moves: any IT staff can take it, and any other dispatcher can route it.
     */
    private function assertNotTheRequester(Request $request, Ticket $ticket): void
    {
        $employeeId = $request->user()?->employee_id;

        abort_if(
            $employeeId !== null && $employeeId === $ticket->requester_id,
            403,
            'You filed this case - somebody else decides who works it.'
        );
    }

    /**
     * A case can only land with someone able to work it: the target must hold
     * tickets.resolve AND the Level matching the case's category.
     */
    private function assertCanReceive(User $staff, Ticket $ticket): void
    {
        abort_unless($staff->hasPermission('tickets.resolve'), 422, 'The chosen staff cannot work cases (tickets.resolve).');
        abort_unless(
            $staff->hasPermission("tickets.level_{$ticket->category?->value}"),
            422,
            "The chosen staff's Ticket Level does not cover this category."
        );
    }

    /**
     * The assignee completes or cancels an in-progress case with a resolution note
     * (tickets.resolve). Only the assignee may close their own case.
     *
     * A case a request auto-opened settles that request too — see
     * RequestService::settleFromTicket. Closing the case is the delivery; making the
     * technician press Fulfil afterwards recorded one real event twice, and a request
     * whose work was long finished sat in the queue until somebody remembered it.
     */
    public function resolve(Request $request, Ticket $ticket, RequestService $requests): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.resolve'), 403);
        abort_unless($ticket->assignee_id === $request->user()?->id, 403, 'Only the assignee can resolve this ticket.');
        abort_unless(in_array($ticket->status, TicketStatus::working(), true), 422, 'Only a case in progress can be resolved.');

        $data = $request->validate([
            'mode' => ['required', 'in:complete,cancel'],
            'resolution' => ['required', 'string', 'min:10', 'max:5000'],
        ]);

        $completed = $data['mode'] === 'complete';
        $ticket = $this->service->resolve($ticket, $completed, $data['resolution']);
        AuditLog::record('Resolved ticket', "{$ticket->ticket_no} → {$ticket->status?->value}");

        $requests->settleFromTicket($ticket, $request->user(), $completed, $data['resolution']);

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }

    /**
     * The assignee writes a progress note on a case in flight (tickets.resolve). Same gate as
     * closing the case, and the same rule: only the person holding it can say what is
     * happening to it.
     */
    public function storeUpdate(Request $request, Ticket $ticket): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.resolve'), 403);
        abort_unless($ticket->assignee_id === $request->user()?->id, 403, 'Only the assignee can update this ticket.');
        abort_unless(in_array($ticket->status, TicketStatus::working(), true), 422, 'Only a case in progress can be updated.');

        // Kind of work is for a case somebody reported that then has to go to a technician.
        // A case opened from an approved request already carries a target of its own, decided
        // by what was asked for — classifying it would put a third rule on top of an answer it
        // already has. Refused rather than merely hidden, for the same reason priority is.
        $fromRequest = $ticket->serviceRequest()->exists();
        $data = $request->validate([
            'body' => ['required', 'string', 'min:5', 'max:5000'],
            'work_class' => [$fromRequest ? 'prohibited' : 'sometimes', new Enum(TicketWorkClass::class)],
        ]);

        // Handing the repair to an in-house or external technician is something that happens
        // mid-case, in the same breath as saying so — so it rides on the progress note rather
        // than on a second dialog and a second timeline entry. The note is the reason.
        $class = isset($data['work_class']) ? TicketWorkClass::from($data['work_class']) : null;
        $before = $ticket->work_class;
        $reclassifying = $class !== null && $class !== $before;

        if ($reclassifying) {
            // Writing a note needs tickets.resolve; moving the deadline needs its own key.
            abort_unless((bool) $request->user()?->hasPermission('tickets.set_work_class'), 403);
            $ticket = $this->service->setWorkClass($ticket, $request->user(), $class, $data['body']);
            AuditLog::record(
                'Classified ticket work',
                sprintf('%s - %s → %s', $ticket->ticket_no, $before?->value ?? 'standard', $ticket->work_class->value),
            );
        } else {
            $this->service->addUpdate($ticket, $request->user(), $data['body']);
            $ticket = $ticket->fresh();
            AuditLog::record('Updated ticket progress', "{$ticket->ticket_no} - {$ticket->subject}");
        }

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments', 'updates'])))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /**
     * Correct a ticket's descriptive fields. Who may edit (IT staff, or the
     * requester while still Open) is enforced by UpdateTicketRequest::authorize.
     */
    public function update(UpdateTicketRequest $request, Ticket $ticket): JsonResponse
    {
        $ticket = $this->service->update($ticket, $request->validated());
        AuditLog::record('Updated ticket', "{$ticket->ticket_no} - {$ticket->subject}");

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }
}
