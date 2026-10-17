<?php

namespace App\Http\Controllers\Api\Ticket;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketSource;
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
use App\Services\Report\TicketOverviewReportService;
use App\Services\Request\RequestService;
use App\Services\Sidebar\SidebarBadgeService;
use App\Services\Ticket\TicketService;
use App\Services\Ticket\TicketSummaryService;
use App\Support\Permissions;
use App\Support\SearchTerms;
use App\Support\TicketSla;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Enum;
use Illuminate\Validation\ValidationException;

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

        // SLA filter (?sla=over_sla): active tickets whose current deadline has passed.
        if ($canSeeInternals && $request->query('sla') === 'over_sla') {
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

        SearchTerms::apply($query, $request->query('search'), [
            'ticket_no', 'subject',
            SearchTerms::related('requester', SearchTerms::personName()),
        ]);
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
     * default 30), every ticket since the first (?days=all) or a custom inclusive ?from=&to= date pair (capped at 366 days):
     * inbound (created) and closed (resolved) flow each with a trend vs the previous
     * equal-length window, the current unresolved backlog (open + in progress), and
     * the window's SLA %, average response, and per-category mix.
     */
    public function summary(Request $request, TicketOverviewReportService $report, TicketSummaryService $summary): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.view_dashboard'), 403);

        // Nothing comes before the first ticket, so the whole history has no trend to show.
        $wholeHistory = ! $request->filled('from') && ! $request->filled('to') && $request->query('days') === 'all';

        if ($request->filled('from') || $request->filled('to')) {
            $request->validate([
                'from' => ['required', 'date_format:Y-m-d'],
                'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            ]);
            $curEnd = Carbon::parse($request->query('to'))->endOfDay();
            $curStart = Carbon::parse($request->query('from'))->startOfDay();
            // At most 365 days, counting both ends; longer is refused rather than quietly cut
            if (round($curStart->diffInDays($curEnd)) > 365) {
                throw ValidationException::withMessages(['to' => ['range_too_long']]);
            }
            $days = (int) round($curStart->diffInDays($curEnd));
        } elseif ($request->query('days') === 'year') {
            $curEnd = now();
            $curStart = $curEnd->copy()->startOfYear();
            $days = (int) round($curStart->diffInDays($curEnd));
        } elseif ($request->query('days') === 'all') {
            $curEnd = now();
            $first = Ticket::min('created_at');
            $curStart = $first === null ? $curEnd->copy()->startOfDay() : Carbon::parse($first)->startOfDay();
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

        // Every figure below is a window (current or previous) or a live backlog, so older closed tickets are never read
        $tickets = Ticket::with('serviceRequest:id,ticket_id,type')
            ->where(fn ($q) => $q
                ->where('created_at', '>=', $prevStart)
                ->orWhere('resolved_at', '>=', $prevStart)
                ->orWhere('responded_at', '>=', $prevStart)
                ->orWhereIn('status', TicketStatus::liveValues()))
            ->get();

        // Every window figure comes from one pass over those tickets
        $f = $summary->figures($tickets, $curStart, $curEnd, $prevStart);

        // 30/45 วันเป็น KPI คนละตัวกับ SLA อยู่แล้วในความเป็นจริงขององค์กร การเอาเป้าหมาย
        // 4 ชั่วโมงกับ 360 ชั่วโมงมาเฉลี่ยเป็นเปอร์เซ็นต์เดียวทำให้ตัวเลขอ่านยากขึ้น ไม่ใช่ง่ายขึ้น
        // เคสตกกลุ่มไหนตัดสินจากค่า work_class ปัจจุบัน — AuditLog เก็บประวัติไว้ให้แล้วถ้าต้องสาว

        // SLA % over the tickets resolved within each window, so the trend is comparable.
        $slaCur = $summary->resolveMetPct($f['standard_cur']);
        $slaPrev = $summary->resolveMetPct($f['standard_prev']);

        // Repair KPI — same math, over the repair-classed cases the SLA figure above excludes.
        $repairCur = $summary->resolveMetPct($f['repair_cur']);
        $repairPrev = $summary->resolveMetPct($f['repair_prev']);

        // Response SLA % over the tickets first-responded within each window. Open
        // tickets that are already past due are NOT counted here — they live in the
        // backlog KPI and the red per-ticket badge instead.
        $respSlaCur = $summary->responseMetPct($f['responded_cur']);
        $respSlaPrev = $summary->responseMetPct($f['responded_prev']);

        // Average time-to-take per window (minutes) — the delta reads negative = faster.
        $avgCur = $summary->averageResponseMinutes($f['responded_cur']);
        $avgPrev = $summary->averageResponseMinutes($f['responded_prev']);

        $byCategory = collect(TicketCategory::cases())->map(fn (TicketCategory $c) => [
            'category' => $c->value,
            'count' => $f['by_category'][$c->value],
        ]);

        // Cases currently past their active SLA deadline — the dashboard's red status row.
        $overSla = collect($f['over_sla']);

        return response()->json([
            'range_days' => $days,

            'created' => $f['created_cur'],
            // Absolute change in tickets vs the previous window (always computable,
            // unlike a % change which has no baseline when the prior window is empty).
            'created_delta_count' => $wholeHistory ? null : $f['created_cur'] - $f['created_prev'],

            'resolved' => $f['resolved_cur'],
            // Absolute change in tickets vs the previous window — same reading as `created`.
            'resolved_delta_count' => $wholeHistory ? null : $f['resolved_cur'] - $f['resolved_prev'],

            'backlog' => $f['open'] + $f['in_progress'],
            'backlog_open' => $f['open'],
            'backlog_in_progress' => $f['in_progress'],
            'over_sla_now' => $overSla->count(),
            'over_sla_oldest_days' => $overSla->isEmpty() ? null : (int) floor($overSla->max(fn (Ticket $t) => $t->created_at->diffInDays(now()))),
            'flow' => $f['flow'],
            'period_sla' => $this->periodSla($request->user(), $report, $curStart, $curEnd),

            'sla_met_pct' => $slaCur,
            'sla_delta_pts' => ($slaCur === null || $slaPrev === null) ? null : $slaCur - $slaPrev,

            'repair_kpi_met_pct' => $repairCur,
            'repair_kpi_delta_pts' => ($repairCur === null || $repairPrev === null) ? null : $repairCur - $repairPrev,
            // งานซ่อมที่ยังไม่ปิด — ทำให้อ่านออกว่า null แปลว่า "ไม่มีงาน" หรือ "ยังไม่มีอันไหนปิด"
            'repair_backlog' => $f['repair_backlog'],
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
            ->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'employee_id' => $u->employee_id]);

        return response()->json(['data' => $staff]);
    }

    /**
     * The window's SLA as the "ภาพรวม Ticket & SLA" report counts it, split by ticket source.
     *
     * @return array{from: string, to: string, goal: int, met: int, measured: int, rate: ?float, delta_pts: ?float, request_rate: ?float, manual_rate: ?float}
     */
    private function periodSla(User $viewer, TicketOverviewReportService $report, Carbon $start, Carbon $end): array
    {
        $from = CarbonImmutable::parse($start->toDateString());
        $to = CarbonImmutable::parse($end->toDateString());
        $days = (int) $from->diffInDays($to) + 1;
        $sources = $report->slaForSources($viewer, $from, $to);
        $all = $sources['all'];
        $previous = $report->slaFor($viewer, $from->subDays($days), $from->subDay())['sla_rate'];

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'goal' => TicketSla::goalPercent(),
            'met' => $all['sla_met'],
            'measured' => $all['sla_measured'],
            'rate' => $all['sla_rate'],
            'delta_pts' => $all['sla_rate'] === null || $previous === null ? null : round($all['sla_rate'] - $previous, 1),
            'request_rate' => $sources[TicketSource::AutoRequest->value]['sla_rate'] ?? null,
            'manual_rate' => $sources[TicketSource::Manual->value]['sla_rate'] ?? null,
        ];
    }

    /** Raise a new ticket; the requester is the current user's linked employee. */
    public function store(StoreTicketRequest $request): JsonResponse
    {
        $employee = $request->user()?->employee;
        abort_if($employee === null, 422, 'no_employee_link');

        $ticket = $this->service->create($request->validated(), $employee);
        AuditLog::record('Created ticket', "{$ticket->ticket_no} - {$ticket->subject}", subject: $ticket);

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
            'level_not_covered'
        );
        abort_unless($ticket->status === TicketStatus::Open && $ticket->isUnassigned(), 422, 'not_open_for_taking');
        // Anti case-pumping: a case can never be handled by the person who filed it.
        abort_if(
            $ticket->requester_id !== null && $ticket->requester_id === $request->user()?->employee_id,
            422,
            'own_case'
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
        AuditLog::record('Took ticket', "{$ticket->ticket_no} → {$request->user()?->name}", subject: $ticket);

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }

    /** A super admin assigns an open case to a chosen IT staff (tickets.assign). */
    public function assign(Request $request, Ticket $ticket): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.assign'), 403);
        $this->assertNotTheRequester($request, $ticket);
        abort_unless($ticket->status === TicketStatus::Open, 422, 'not_open');

        // Same rule as take(): a request-born case is never given a priority.
        $fromRequest = $ticket->serviceRequest()->exists();
        $data = $request->validate([
            'assignee_id' => ['required', Rule::exists('users', 'id')],
            'priority' => [$fromRequest ? 'prohibited' : 'required', new Enum(TicketPriority::class)],
        ]);

        $staff = User::findOrFail($data['assignee_id']);
        // Assign hands a case to someone ELSE — taking it yourself is what Take Case
        // is for (it records an initial note and skips the self-addressed bell).
        abort_if($staff->id === $request->user()?->id, 422, 'self_assign');
        // Anti case-pumping: a case can never be handled by the person who filed it.
        abort_if(
            $staff->employee_id !== null && $staff->employee_id === $ticket->requester_id,
            422,
            'target_is_requester'
        );
        $this->assertCanReceive($staff, $ticket);
        $ticket = $this->service->assign($ticket, $staff, isset($data['priority']) ? TicketPriority::from($data['priority']) : null, $request->user());
        AuditLog::record('Assigned ticket', "{$ticket->ticket_no} → {$staff->name}", subject: $ticket);

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
        abort_unless(in_array($ticket->status, TicketStatus::working(), true), 422, 'not_in_progress');

        $data = $request->validate([
            'assignee_id' => ['required', Rule::exists('users', 'id'), Rule::notIn([$ticket->assignee_id])],
        ]);

        $staff = User::findOrFail($data['assignee_id']);
        // Anti case-pumping: a case can never be handled by the person who filed it.
        abort_if(
            $staff->employee_id !== null && $staff->employee_id === $ticket->requester_id,
            422,
            'target_is_requester'
        );
        $this->assertCanReceive($staff, $ticket);

        $ticket = $this->service->forward($ticket, $staff, $user);
        AuditLog::record('Forwarded ticket', "{$ticket->ticket_no} → {$staff->name}", subject: $ticket);

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
            'requester_cannot_route'
        );
    }

    /**
     * A case can only land with someone able to work it: the target must hold
     * tickets.resolve AND the Level matching the case's category.
     */
    private function assertCanReceive(User $staff, Ticket $ticket): void
    {
        abort_unless($staff->hasPermission('tickets.resolve'), 422, 'target_cannot_work');
        abort_unless(
            $staff->hasPermission("tickets.level_{$ticket->category?->value}"),
            422,
            'target_level_not_covered'
        );
    }

    /**
     * The assignee completes or cancels an in-progress case with a resolution note
     * (tickets.resolve). Only the assignee may close their own case.
     *
     * A case a request auto-opened settles that request too — see
     * RequestService::settleFromTicket. Closing the case is the delivery; making the
     * technician press Complete afterwards recorded one real event twice, and a request
     * whose work was long finished sat in the queue until somebody remembered it.
     */
    public function resolve(Request $request, Ticket $ticket, RequestService $requests): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('tickets.resolve'), 403);
        abort_unless($ticket->assignee_id === $request->user()?->id, 403, 'not_assignee');
        abort_unless(in_array($ticket->status, TicketStatus::working(), true), 422, 'not_in_progress');

        $data = $request->validate([
            'mode' => ['required', 'in:complete,cancel'],
            'resolution' => ['required', 'string', 'min:10', 'max:5000'],
        ]);

        $completed = $data['mode'] === 'complete';
        $ticket = $this->service->resolve($ticket, $completed, $data['resolution']);
        AuditLog::record('Resolved ticket', "{$ticket->ticket_no} → {$ticket->status?->value}", subject: $ticket);

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
        abort_unless($ticket->assignee_id === $request->user()?->id, 403, 'not_assignee');
        abort_unless(in_array($ticket->status, TicketStatus::working(), true), 422, 'not_in_progress');

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

            // And only to something an administrator has priced for this kind of case. The
            // dialog already offers nothing else, but a class with no rule for this category
            // would fall back to the priority target — the short deadline these cases breach
            // on, which is the problem the feature was built to solve. Refused, not defaulted.
            abort_if(
                $class->isRepair()
                    && ($ticket->category === null
                        || ! isset(TicketSla::rules()[SlaScope::WorkClass->value][TicketSla::workClassKey($ticket->category->value, $class->value)])),
                422,
                'no_work_class_target',
            );
            $ticket = $this->service->setWorkClass($ticket, $request->user(), $class, $data['body']);
            AuditLog::record(
                'Classified ticket work',
                sprintf('%s - %s → %s', $ticket->ticket_no, $before?->value ?? 'standard', $ticket->work_class->value),
                subject: $ticket,
            );
        } else {
            $this->service->addUpdate($ticket, $request->user(), $data['body']);
            $ticket = $ticket->fresh();
            AuditLog::record('Updated ticket progress', "{$ticket->ticket_no} - {$ticket->subject}", subject: $ticket);
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
        AuditLog::record('Updated ticket', "{$ticket->ticket_no} - {$ticket->subject}", subject: $ticket);

        return (new TicketResource($ticket->load(['requester', 'assignee', 'relatedAsset', 'attachments'])))
            ->additional(['message' => 'success'])->response();
    }
}
