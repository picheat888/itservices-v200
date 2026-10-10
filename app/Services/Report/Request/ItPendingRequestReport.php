<?php

namespace App\Services\Report\Request;

use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Services\Report\TicketLabels;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "คำขอที่รอ IT ส่งมอบ": every approved request still waiting on IT (status `approved`), longest wait
 * first, with its ticket and who holds it; breakdown() feeds the cards (age groups, owners, types,
 * new joiners). Ages are whole days since the approval date.
 */
class ItPendingRequestReport extends TabularReport
{
    use RequestLabels;

    /** Assignee filter / owner keys for a ticket nobody holds and a request without a ticket. */
    public const NONE = 'none';

    public const NO_TICKET = 'no_ticket';

    /** The finished requests the flow row counts: completed in the last 30 days, today included. */
    public const DELIVERED_DAYS = 30;

    private const TICKET_STATUS_KEYS = [
        'open' => 'ticket_open', 'in_progress' => 'ticket_in_progress',
        'completed' => 'ticket_completed', 'canceled' => 'ticket_canceled',
    ];

    private const ORIGIN_KEYS = ['direct' => 'rep_rqi_origin_direct', 'onboarding' => 'req_origin_onboarding'];

    private const ORIGIN_TH = ['direct' => 'ยื่นเอง', 'onboarding' => 'พนักงานใหม่'];

    /** The age groups' chart tones: the approvals page's red / amber / gray. */
    private const AGE_BAND_TONES = ['over_7' => 'soft-red', 'days_4_7' => 'soft-amber', 'upto_3' => 'gray'];

    /** The waiting tile's key: the shortest label for the last group, so three fit one line. */
    private const TILE_BAND_KEYS = ['over_7' => 'rep_age_over_7', 'days_4_7' => 'rep_age_days_4_7', 'upto_3' => 'rep_rqi_tile_upto_3'];

    private const BY_KEYS = ['owner' => 'rep_rqi_by_owner', 'type' => 'rep_rqi_by_type'];

    public function __construct(private readonly NewJoinerReadiness $joiners) {}

    public function key(): string
    {
        return 'requests.it_pending';
    }

    public function title(): string
    {
        return 'คำขอที่รอ IT ส่งมอบ';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('type', Options::fromLabels(self::typeKeys()))->labelKey('rep_fl_request_type'),
            ReportFilter::select('department_id', Options::departments()),
            ReportFilter::select('assignee', self::assigneeOptions()),
            ReportFilter::search(),
            ReportFilter::select('by', Options::fromLabels(self::BY_KEYS), 'owner')->viewOnly(),
        ];
    }

    /**
     * Approved requests the filters keep, unordered.
     *
     * @param  array<string, mixed>  $filters
     */
    private function waitingQuery(array $filters): Builder
    {
        return $this->scoped(ServiceRequest::query()->where('status', 'approved'), $filters)
            ->when($filters['search'] ?? null, function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(fn (Builder $w) => $w->where('reference', 'like', $like)
                    ->orWhere('title', 'like', $like)
                    ->orWhere('requester_name', 'like', $like));
            });
    }

    /**
     * The type, department and assignee filters on any request query.
     *
     * @param  array<string, mixed>  $filters
     */
    private function scoped(Builder $query, array $filters): Builder
    {
        $assignee = $filters['assignee'] ?? null;

        return $query
            ->when($filters['type'] ?? null, fn (Builder $q, string $type) => $q->where('type', $type))
            ->when($filters['department_id'] ?? null, fn (Builder $q, $id) => $q->whereHas('employee', fn (Builder $e) => $e->where('department_id', (int) $id)))
            ->when($assignee === self::NO_TICKET, fn (Builder $q) => $q->whereNull('ticket_id'))
            ->when($assignee === self::NONE, fn (Builder $q) => $q->whereHas('ticket', fn (Builder $t) => $t->whereNull('assignee_id')))
            ->when($assignee !== null && ! in_array($assignee, [self::NONE, self::NO_TICKET], true),
                fn (Builder $q) => $q->whereHas('ticket', fn (Builder $t) => $t->where('assignee_id', (int) $assignee)));
    }

    public function query(User $viewer, array $filters): Builder
    {
        return $this->waitingQuery($filters)
            ->with(['ticket:id,ticket_no,status,assignee_id', 'ticket.assignee:id,name', 'employee:id,code,department_id', 'employee.department'])
            ->orderBy('approved_at')
            ->orderBy('id');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('request_no', 'เลขที่คำขอ', fn (ServiceRequest $r) => $r->reference)->linkTo('/requests', fn (ServiceRequest $r) => $r->id),
            ReportColumn::enum('request_type', 'ประเภทคำขอ', fn (ServiceRequest $r) => $r->type, self::typeKeys(), self::typeTh()),
            // Drawn as the "พนักงานใหม่" tag under the type on the page.
            ReportColumn::enum('origin', 'ที่มา', fn (ServiceRequest $r) => $r->origin, self::ORIGIN_KEYS, self::ORIGIN_TH)
                ->labelKey('rep_c_rqi_origin')->hiddenByDefault(),
            ReportColumn::text('title', 'เรื่อง', fn (ServiceRequest $r) => $r->title)->hiddenByDefault(),
            ReportColumn::text('requester', 'ผู้ขอ', fn (ServiceRequest $r) => $r->requester_name),
            // Drawn under the requester's name on the page.
            ReportColumn::text('requester_code', 'รหัสพนักงาน', fn (ServiceRequest $r) => $r->employee?->code)->labelKey('rep_c_rqi_requester_code')->hiddenByDefault(),
            ReportColumn::localized('department', 'แผนก', fn (ServiceRequest $r) => $this->department($r))->hiddenByDefault(),
            ReportColumn::date('approved_at', 'อนุมัติเมื่อ', fn (ServiceRequest $r) => $r->approved_at),
            ReportColumn::number('waiting_days', 'รอมาแล้ว (วัน)', fn (ServiceRequest $r) => $this->waitingDays($r)),
            ReportColumn::enum('age_band', 'ช่วงเวลารอ', fn (ServiceRequest $r) => self::ageBand($this->waitingDays($r)), self::AGE_BAND_KEYS, self::AGE_BAND_TH)
                ->labelKey('rep_c_rqi_age_band')->sheetOnly(),
            // The status is drawn under the ticket number on the page.
            ReportColumn::text('ticket_no', 'Ticket', fn (ServiceRequest $r) => $r->ticket?->ticket_no)->labelKey('rep_c_rqi_ticket')
                ->linkTo('/tickets', fn (ServiceRequest $r) => $r->ticket?->id),
            ReportColumn::enum('ticket_status', 'สถานะ Ticket', fn (ServiceRequest $r) => $r->ticket?->status, self::TICKET_STATUS_KEYS, self::ticketStatusTh()),
            ReportColumn::text('assignee', 'ผู้รับผิดชอบ', fn (ServiceRequest $r) => $r->ticket?->assignee?->name),
        ];
    }

    /** @return array{name: string, name_th: ?string}|null */
    private function department(ServiceRequest $request): ?array
    {
        $department = $request->employee?->department;
        if ($department) {
            return ['name' => $department->name, 'name_th' => $department->name_th];
        }

        return $request->department_name ? ['name' => $request->department_name, 'name_th' => null] : null;
    }

    public function summary(Builder $query, array $filters): array
    {
        $waiting = $this->waiting($filters);
        $total = $waiting->count();
        $bands = $waiting->countBy('band');
        $over3 = $waiting->filter(fn (array $r) => $r['days'] > 3)->count();
        $over7 = (int) $bands->get('over_7', 0);
        $oldest = $waiting->sortByDesc('days')->first();
        $readiness = $this->joiners->build($this->departmentId($filters));
        $notReady = $readiness['counts']['open'];
        $pastStart = $readiness['counts']['past_start'];

        return [
            ReportSummary::make('rqi_waiting', 'รอ IT ส่งมอบตอนนี้', $total)->withSplit(array_map(fn (string $band) => [
                'key' => $band, 'label_key' => self::TILE_BAND_KEYS[$band], 'tone' => self::AGE_BAND_TONES[$band], 'value' => (int) $bands->get($band, 0),
            ], self::AGE_BANDS)),
            ReportSummary::make('rqi_over_3', 'รอเกิน 3 วัน', $over3, 'amber')->withShareOf($total),
            ReportSummary::make('rqi_over_7', 'รอเกิน 7 วัน', $over7, 'red')->withShareOf($total)
                ->withNote($oldest ? ['label_key' => 'rep_n_rqi_oldest', 'values' => ['days' => $oldest['days']], 'texts' => ['reference' => $oldest['reference']]] : null),
            ReportSummary::make('rqi_no_ticket', 'ยังไม่มี Ticket', $waiting->where('owner', self::NO_TICKET)->count())
                ->withNote(['label_key' => 'rep_n_rqi_unassigned', 'values' => ['n' => $waiting->where('owner', self::NONE)->count()]]),
            $this->joinersTile($notReady, $pastStart)
                ->withNote($notReady ? ['label_key' => 'rep_n_rqi_past_start', 'values' => ['n' => $pastStart]] : ['label_key' => $readiness['rows'] === [] ? 'rep_n_rqi_no_joiners' : 'rep_n_rqi_all_ready']),
        ];
    }

    /**
     * The cards above the list: codes and numbers only, the page writes the words.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function breakdown(User $viewer, array $filters): array
    {
        $waiting = $this->waiting($filters);

        return [
            'waiting' => [
                'total' => $waiting->count(),
                'avg_days' => $this->average($waiting),
                'bands' => $this->bandsWithOwners($waiting),
            ],
            'delivered' => $this->delivered($filters),
            'by_assignee' => $this->byAssignee($waiting),
            'by_type' => $this->byType($waiting),
            'joiners' => $this->joiners->build($this->departmentId($filters)),
        ];
    }

    /**
     * Every waiting request the filters keep, as the facts the tiles and cards count.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array{id: int, reference: string, type: string, days: int, band: string, owner: string, owner_name: ?string, ticket_status: ?string}>
     */
    private function waiting(array $filters): Collection
    {
        return $this->waitingQuery($filters)
            ->with(['ticket:id,status,assignee_id', 'ticket.assignee:id,name'])
            ->get()
            ->map(function (ServiceRequest $r) {
                $days = $this->waitingDays($r);

                return [
                    'id' => (int) $r->id,
                    'reference' => $r->reference,
                    'type' => $r->type->value,
                    'days' => $days,
                    'band' => self::ageBand($days),
                    'owner' => $this->owner($r),
                    'owner_name' => $r->ticket?->assignee?->name,
                    'ticket_status' => $r->ticket?->status?->value,
                ];
            });
    }

    private function owner(ServiceRequest $request): string
    {
        if ($request->ticket_id === null) {
            return self::NO_TICKET;
        }

        return $request->ticket?->assignee_id === null ? self::NONE : (string) $request->ticket->assignee_id;
    }

    /**
     * Each age group with who has its requests — the bucket popovers.
     *
     * @param  Collection<int, array<string, mixed>>  $waiting
     * @return array<string, array{total: int, unassigned: int, no_ticket: int, assigned: int}>
     */
    private function bandsWithOwners(Collection $waiting): array
    {
        $bands = [];
        foreach (self::AGE_BANDS as $band) {
            $in = $waiting->where('band', $band);
            $unassigned = $in->where('owner', self::NONE)->count();
            $noTicket = $in->where('owner', self::NO_TICKET)->count();
            $bands[$band] = ['total' => $in->count(), 'unassigned' => $unassigned, 'no_ticket' => $noTicket, 'assigned' => $in->count() - $unassigned - $noTicket];
        }

        return $bands;
    }

    /**
     * Requests IT finished in the last 30 days and how many whole days each took from approval
     * (type, department and assignee filters; not the search).
     *
     * @param  array<string, mixed>  $filters
     * @return array{from: string, to: string, total: int, avg_days: ?float, bands: array<string, int>}
     */
    private function delivered(array $filters): array
    {
        $from = today()->subDays(self::DELIVERED_DAYS - 1);
        $days = $this->scoped(ServiceRequest::query()->where('status', 'completed'), $filters)
            ->whereNotNull('approved_at')
            ->where('completed_at', '>=', $from)
            ->get(['id', 'approved_at', 'completed_at'])
            ->map(fn (ServiceRequest $r) => self::wholeDays($r->approved_at, $r->completed_at));

        return [
            'from' => $from->toDateString(),
            'to' => today()->toDateString(),
            'total' => $days->count(),
            'avg_days' => $days->isEmpty() ? null : round($days->avg(), 1),
            'bands' => collect(self::AGE_BANDS)->mapWithKeys(fn (string $band) => [$band => $days->filter(fn (int $d) => self::ageBand($d) === $band)->count()])->all(),
        ];
    }

    /**
     * Who holds the waiting requests: named staff by most waiting, then nobody yet and no ticket (always listed).
     *
     * @param  Collection<int, array<string, mixed>>  $waiting
     * @return list<array{key: string, name: ?string, total: int, in_progress: int, open: int, bands: array<string, int>, oldest_days: ?int}>
     */
    private function byAssignee(Collection $waiting): array
    {
        $groups = $waiting->groupBy('owner');
        $line = fn (string $key, Collection $rows) => [
            'key' => $key,
            'name' => $rows->first()['owner_name'] ?? null,
            'total' => $rows->count(),
            'in_progress' => $rows->where('ticket_status', 'in_progress')->count(),
            'open' => $rows->where('ticket_status', 'open')->count(),
            'bands' => $this->bandCounts($rows),
            'oldest_days' => $rows->isEmpty() ? null : (int) $rows->max('days'),
        ];

        $named = $groups->except([self::NONE, self::NO_TICKET])
            ->map(fn (Collection $rows, string $key) => $line($key, $rows))
            ->sortBy([['total', 'desc'], ['name', 'asc']])
            ->values()
            ->all();

        return [
            ...$named,
            $line(self::NONE, $groups->get(self::NONE, collect())),
            $line(self::NO_TICKET, $groups->get(self::NO_TICKET, collect())),
        ];
    }

    /**
     * The waiting requests by type, most first, then the one waiting longest.
     *
     * @param  Collection<int, array<string, mixed>>  $waiting
     * @return list<array{type: string, total: int, bands: array<string, int>, oldest_days: int}>
     */
    private function byType(Collection $waiting): array
    {
        return $waiting->groupBy('type')
            ->map(fn (Collection $rows, string $type) => [
                'type' => $type,
                'total' => $rows->count(),
                'bands' => $this->bandCounts($rows),
                'oldest_days' => (int) $rows->max('days'),
            ])
            ->sortBy([['total', 'desc'], ['oldest_days', 'desc']])
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array<string, int>
     */
    private function bandCounts(Collection $rows): array
    {
        return collect(self::AGE_BANDS)->mapWithKeys(fn (string $band) => [$band => $rows->where('band', $band)->count()])->all();
    }

    /** @param Collection<int, array<string, mixed>> $rows */
    private function average(Collection $rows): ?float
    {
        return $rows->isEmpty() ? null : round($rows->avg('days'), 1);
    }

    /** @param array<string, mixed> $filters */
    private function departmentId(array $filters): ?int
    {
        return ($filters['department_id'] ?? null) ? (int) $filters['department_id'] : null;
    }

    /**
     * The cards as sheets: age groups, the flow, by assignee, by type, new joiners.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $b = $this->breakdown($viewer, $filters);
        $bandHeads = array_map(fn (string $band) => self::AGE_BAND_TH[$band], self::AGE_BANDS);
        $ownerName = fn (array $line) => match ($line['key']) {
            self::NONE => 'ยังไม่มีผู้รับผิดชอบ',
            self::NO_TICKET => 'ยังไม่มี Ticket',
            default => $line['name'],
        };
        $typeTh = self::typeTh();

        return [
            [
                'title' => 'ตามระยะเวลารอ',
                'headings' => ['ช่วงเวลารอ', 'คำขอที่รอ', 'ยังไม่มีผู้รับผิดชอบ', 'ยังไม่มี Ticket', 'มีผู้รับผิดชอบแล้ว', 'ส่งมอบแล้วใน 30 วันล่าสุด'],
                'rows' => array_map(fn (string $band) => [
                    self::AGE_BAND_TH[$band], $b['waiting']['bands'][$band]['total'], $b['waiting']['bands'][$band]['unassigned'],
                    $b['waiting']['bands'][$band]['no_ticket'], $b['waiting']['bands'][$band]['assigned'], $b['delivered']['bands'][$band],
                ], self::AGE_BANDS),
            ],
            [
                'title' => 'ตามผู้รับผิดชอบ',
                'headings' => ['ผู้รับผิดชอบ', 'คำขอที่รอ', ...$bandHeads, 'กำลังดำเนินการ', 'เปิด', 'นานสุด (วัน)'],
                'rows' => array_map(fn (array $line) => [
                    $ownerName($line), $line['total'], ...array_values($line['bands']), $line['in_progress'], $line['open'], $line['oldest_days'],
                ], $b['by_assignee']),
            ],
            [
                'title' => 'ตามประเภทคำขอ',
                'headings' => ['ประเภทคำขอ', 'คำขอที่รอ', ...$bandHeads, 'นานสุด (วัน)'],
                'rows' => array_map(fn (array $line) => [$typeTh[$line['type']], $line['total'], ...array_values($line['bands']), $line['oldest_days']], $b['by_type']),
            ],
            $this->joinersSheet($b['joiners']),
        ];
    }

    /**
     * @param  array<string, mixed>  $readiness
     * @return array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}
     */
    private function joinersSheet(array $readiness): array
    {
        $typeTh = self::typeTh();
        $verdictTh = ['on_time' => 'พร้อมก่อนวันเริ่มงาน', 'late' => 'พร้อมช้า', 'open' => 'ยังไม่พร้อม'];
        $cell = function (array $row, string $type) {
            $request = collect($row['requests'])->firstWhere('type', $type);
            if ($request === null) {
                return null;
            }
            $status = self::STATUS_TH[$request['status']] ?? $request['status'];

            return $request['completed_on'] ? "{$request['reference']} {$status} {$request['completed_on']}" : "{$request['reference']} {$status}";
        };
        $line = fn (array $row, string $result) => [
            $row['code'], $row['name'], $row['department'] ? ($row['department']['name_th'] ?: $row['department']['name']) : null,
            $row['joined_at'], $result, ...array_map(fn (string $t) => $cell($row, $t), $readiness['types']),
        ];

        return [
            'title' => 'พนักงานใหม่',
            'headings' => ['รหัสพนักงาน', 'ชื่อ', 'แผนก', 'วันเริ่มงาน', 'ผล', ...array_map(fn (string $t) => $typeTh[$t], $readiness['types'])],
            'rows' => [
                ...array_map(fn (array $row) => $line($row, $verdictTh[$row['verdict']].($row['verdict'] === 'late' ? " {$row['late_days']} วัน" : '')), $readiness['rows']),
                ...array_map(fn (array $row) => $line($row, "ลาออกแล้ว ({$row['last_day']}) คำขอค้าง {$row['open']}"), $readiness['left_early']),
            ],
        ];
    }

    /**
     * "Nobody yet" and "no ticket", then anyone holding a ticket opened from a request.
     *
     * @return list<array<string, mixed>>
     */
    private static function assigneeOptions(): array
    {
        $ids = ServiceRequest::query()->join('tickets', 'tickets.id', '=', 'service_requests.ticket_id')
            ->whereNotNull('tickets.assignee_id')->distinct()->pluck('tickets.assignee_id');

        return [
            ['value' => self::NONE, 'label_key' => 'rep_rqi_unassigned'],
            ['value' => self::NO_TICKET, 'label_key' => 'rep_rqi_opt_no_ticket'],
            ...User::query()->whereIn('id', $ids)->orderBy('name')->get(['id', 'name'])
                ->map(fn (User $u) => ['value' => $u->id, 'label' => $u->name, 'label_th' => null])->all(),
        ];
    }

    /** @return array<string, string> ticket status → Thai label, the same wording as the Ticket & SLA report */
    private static function ticketStatusTh(): array
    {
        $labels = [];
        foreach (array_keys(self::TICKET_STATUS_KEYS) as $status) {
            $labels[$status] = (string) TicketLabels::status($status);
        }

        return $labels;
    }

    /** Whole days since the approval date. */
    private function waitingDays(ServiceRequest $request): int
    {
        return $request->approved_at === null ? 0 : self::wholeDays($request->approved_at, today());
    }

    /** Flagged only while someone is not ready: red once a start day has passed, amber before. */
    private function joinersTile(int $notReady, int $pastStart): ReportSummary
    {
        $tile = ReportSummary::make('rqi_joiners', 'พนักงานใหม่ยังไม่พร้อม', $notReady);

        return $notReady > 0 ? $tile->withAttention($pastStart > 0 ? 'red' : 'amber') : $tile;
    }
}
