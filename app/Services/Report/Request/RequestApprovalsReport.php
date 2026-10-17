<?php

namespace App\Services\Report\Request;

use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\DateDisplay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

/**
 * "การอนุมัติคำขอ" (requests.approvals): one row per approval step, the tiles, and breakdown() for the cards.
 */
class RequestApprovalsReport extends TabularReport
{
    use RequestLabels;

    private const ROW_STATUS_KEYS = [
        'approved' => 'req_trail_approved', 'rejected' => 'req_trail_rejected', 'current' => 'req_trail_waiting',
        'skipped' => 'req_trail_skipped', 'withdrawn' => 'req_status_cancelled',
    ];

    private const ROW_STATUS_TH = ['approved' => 'อนุมัติแล้ว', 'rejected' => 'ไม่อนุมัติ', 'current' => 'รออนุมัติ', 'skipped' => 'ข้ามขั้นนี้', 'withdrawn' => 'ยกเลิก'];

    private const SKIP_REASONS = ['no_matching_position', 'no_resource_owner', 'no_manager', 'no_department_approver', 'requester_is_owner'];

    private const SKIP_KEYS = [
        'no_manager' => 'req_skip_no_manager', 'no_matching_position' => 'req_skip_no_matching_position',
        'no_department_approver' => 'req_skip_no_department_approver', 'no_resource_owner' => 'req_skip_no_resource_owner',
        'requester_is_owner' => 'req_skip_requester_is_owner',
    ];

    private const SKIP_TH = [
        'no_manager' => 'ข้ามเพราะผู้ขอไม่มีหัวหน้า', 'no_matching_position' => 'ข้ามเพราะในสายของผู้ขอไม่มีใครอยู่ตำแหน่งนี้',
        'no_department_approver' => 'ข้ามเพราะฝ่ายนี้ไม่มีคนในตำแหน่งที่กำหนด', 'no_resource_owner' => 'ข้ามเพราะรายการนี้ไม่มีเจ้าของ',
        'requester_is_owner' => 'ข้ามเพราะผู้ขอเป็นเจ้าของรายการนี้เอง',
    ];

    private const OUTCOME_TH = ['rejected' => 'ไม่อนุมัติ', 'withdrawn' => 'ผู้ขอยกเลิก', 'not_delivered' => 'IT ส่งมอบไม่ได้'];

    /** @var list<array{value: string, label: string, label_th: null}>|null */
    private ?array $approverOptions = null;

    /** @var array<string, Collection<int, RequestApproval>> steps per filter set, for this request only */
    private array $loaded = [];

    public function key(): string
    {
        return 'requests.approvals';
    }

    public function title(): string
    {
        return 'การอนุมัติคำขอ';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfYear()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('type', Options::fromLabels(self::typeKeys()))->labelKey('rep_fl_request_type'),
            ReportFilter::select('department_id', Options::departments()),
            ReportFilter::select('approver', $this->approverOptions())->labelKey('rep_fl_rqa_approver'),
        ];
    }

    /** Approver names may hold commas, which the generic "in:" rule would split. */
    public function rules(): array
    {
        return [...parent::rules(), 'approver' => ['nullable', Rule::in(array_column($this->approverOptions(), 'value'))]];
    }

    /**
     * Everybody a step has reached: people first, then department steps and accounts with no employee.
     *
     * @return list<array{value: string, label: string, label_th: null}>
     */
    private function approverOptions(): array
    {
        return $this->approverOptions ??= RequestApproval::query()->where('kind', 'approval')->whereNotNull('became_current_at')
            ->selectRaw('COALESCE(acted_by_name, approver_name, label) as approver_key')
            ->selectRaw('MAX(CASE WHEN approver_employee_id IS NOT NULL OR acted_by_user_id IS NOT NULL THEN 1 ELSE 0 END) as named')
            ->groupByRaw('COALESCE(acted_by_name, approver_name, label)')
            ->get()
            ->sortBy([fn ($a, $b) => (int) $b->named <=> (int) $a->named, fn ($a, $b) => strcmp($a->approver_key, $b->approver_key)])
            ->map(fn ($r) => ['value' => (string) $r->approver_key, 'label' => (string) $r->approver_key, 'label_th' => null])->values()->all();
    }

    /**
     * The steps the tiles and cards read, loaded once per filter set.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, RequestApproval>
     */
    private function steps(array $filters, Carbon $since, Carbon $to): Collection
    {
        $key = json_encode([$filters, $since->toDateTimeString(), $to->toDateTimeString()]);

        return $this->loaded[$key] ??= ApprovalFacts::steps($filters, $since, $to);
    }

    // ── rows ────────────────────────────────────────────────────────────────────────

    /** Steps that reached somebody in the range (decided, waiting, or left by a withdrawal) and steps skipped on requests filed in it; newest first. */
    public function query(User $viewer, array $filters): Builder
    {
        [$from, $to] = $this->dayRange($filters);
        $approver = $filters['approver'] ?? null;
        $key = 'COALESCE(request_approvals.acted_by_name, request_approvals.approver_name, request_approvals.label)';

        return RequestApproval::query()
            ->select('request_approvals.*')
            ->join('service_requests', 'service_requests.id', '=', 'request_approvals.service_request_id')
            ->with(['request.employee.department', 'approver.department', 'approver.user:id,employee_id', 'actedBy:id,employee_id', 'actedBy.employee.department'])
            ->where('request_approvals.kind', 'approval')
            ->whereHas('request', fn (Builder $r) => ApprovalFacts::scopeRequests($r, $filters))
            ->where(function (Builder $q) use ($from, $to, $approver, $key) {
                $q->where(function (Builder $reached) use ($from, $to, $approver, $key) {
                    $reached->whereBetween('request_approvals.became_current_at', [$from, $to])
                        ->where(fn (Builder $s) => $s->whereIn('request_approvals.status', ['approved', 'rejected'])
                            ->orWhere(fn (Builder $c) => $c->where('request_approvals.status', 'current')->where('service_requests.status', 'pending'))
                            ->orWhere(fn (Builder $w) => $w->where('request_approvals.status', 'waiting')->where('service_requests.status', 'cancelled')))
                        ->when($approver, fn (Builder $a, string $name) => $a->whereRaw("{$key} = ?", [$name]));
                });
                if ($approver === null) {
                    $q->orWhere(fn (Builder $skip) => $skip->where('request_approvals.status', 'skipped')
                        ->whereBetween('service_requests.created_at', [$from, $to]));
                }
            })
            ->orderByRaw('COALESCE(request_approvals.became_current_at, service_requests.created_at) DESC')
            ->orderByDesc('service_requests.id')
            ->orderBy('request_approvals.position');
    }

    public function columns(): array
    {
        $notSkipped = fn (RequestApproval $s) => $s->status->value !== 'skipped';

        return [
            ReportColumn::text('request_no', 'เลขที่คำขอ', fn (RequestApproval $s) => $s->request?->reference)
                ->linkTo('/requests', fn (RequestApproval $s) => $s->service_request_id),
            ReportColumn::enum('request_type', 'ประเภทคำขอ', fn (RequestApproval $s) => $s->request?->type, self::typeKeys(), self::typeTh()),
            ReportColumn::text('step', 'ขั้น', fn (RequestApproval $s) => $s->label)->labelKey('rep_c_rqa_step'),
            ReportColumn::number('position', 'ขั้นที่', fn (RequestApproval $s) => $s->position)->labelKey('rep_c_rqa_position')->hiddenByDefault(),
            ReportColumn::text('approver', 'ผู้อนุมัติ', fn (RequestApproval $s) => $notSkipped($s) ? ApprovalFacts::key($s) : null),
            // Drawn under the approver's name on the page.
            ReportColumn::text('approver_code', 'รหัสผู้อนุมัติ', fn (RequestApproval $s) => $notSkipped($s) ? ApprovalFacts::person($s)['code'] : null)
                ->labelKey('rep_c_rqa_approver_code')->hiddenByDefault(),
            ReportColumn::localized('approver_department', 'แผนกผู้อนุมัติ', fn (RequestApproval $s) => $notSkipped($s) ? ApprovalFacts::person($s)['department'] : null)
                ->labelKey('rep_c_rqa_approver_department')->hiddenByDefault(),
            ReportColumn::text('approver_kind', 'ชนิดผู้อนุมัติ', fn (RequestApproval $s) => $notSkipped($s) ? ApprovalFacts::person($s)['kind'] : null)
                ->labelKey('rep_c_rqa_approver_kind')->hiddenByDefault(),
            ReportColumn::text('approver_flag', 'สถานะผู้อนุมัติ', fn (RequestApproval $s) => ApprovalFacts::isWaiting($s) ? ApprovalFacts::blockedBecause($s) : null)
                ->labelKey('rep_c_rqa_approver_flag')->hiddenByDefault(),
            ReportColumn::dateTime('became_current_at', 'ถึงคิว', fn (RequestApproval $s) => $s->became_current_at)->labelKey('rep_c_rqa_became_current'),
            ReportColumn::dateTime('acted_at', 'ตัดสิน', fn (RequestApproval $s) => $s->acted_at)->labelKey('rep_c_rqa_acted_at'),
            ReportColumn::number('days', 'วัน', fn (RequestApproval $s) => ApprovalFacts::days($s))->labelKey('rep_c_rqa_days'),
            ReportColumn::enum('status', 'สถานะ', fn (RequestApproval $s) => $s->status->value === 'waiting' ? 'withdrawn' : $s->status->value, self::ROW_STATUS_KEYS, self::ROW_STATUS_TH),
            ReportColumn::text('note', 'หมายเหตุ', fn (RequestApproval $s) => $s->note)->labelKey('rep_c_rqa_note'),
            ReportColumn::enum('skip_reason', 'เหตุผลที่ข้าม', fn (RequestApproval $s) => $s->skip_reason?->value, self::SKIP_KEYS, self::SKIP_TH)
                ->labelKey('rep_c_rqa_skip_reason')->hiddenByDefault(),
            ReportColumn::text('requester', 'ผู้ขอ', fn (RequestApproval $s) => $s->request?->requester_name)->sheetOnly(),
            ReportColumn::localized('department', 'แผนกผู้ขอ', fn (RequestApproval $s) => $this->requesterDepartment($s->request))->sheetOnly(),
            ReportColumn::enum('request_status', 'สถานะคำขอ', fn (RequestApproval $s) => $s->request?->status, self::STATUS_KEYS, self::STATUS_TH)->sheetOnly(),
        ];
    }

    /** @return array{name: string, name_th: ?string}|null the requester's department, else the one written on the request */
    private function requesterDepartment(?ServiceRequest $request): ?array
    {
        $department = $request?->employee?->department;
        if ($department) {
            return ['name' => $department->name, 'name_th' => $department->name_th];
        }

        return $request?->department_name ? ['name' => $request->department_name, 'name_th' => null] : null;
    }

    // ── tiles ───────────────────────────────────────────────────────────────────────

    public function summary(Builder $query, array $filters): array
    {
        [$from, $to] = $this->dayRange($filters);
        $previous = self::previousPeriod($from, $to);
        $approver = $filters['approver'] ?? null;
        $steps = $this->steps($filters, $previous['from'], $to);
        $reached = ApprovalFacts::reached($steps, $from, $to, $approver);
        $waiting = ApprovalFacts::waitingNow($steps, $approver);
        $bands = $waiting->countBy(fn (RequestApproval $s) => self::ageBand(ApprovalFacts::days($s)));
        $endings = collect(ApprovalFacts::endings($steps, $from, $to, $approver));
        $blocked = $waiting->map(fn (RequestApproval $s) => ApprovalFacts::blockedBecause($s))->filter();
        $trend = $this->trends($steps, $filters, $previous);

        $waitTile = ReportSummary::make('rqa_waiting', 'รออนุมัติตอนนี้', $waiting->count())
            ->withSplit(array_map(fn (string $band) => [
                'key' => $band, 'label_key' => self::AGE_BAND_KEYS[$band], 'tone' => ['over_7' => 'red', 'days_4_7' => 'amber', 'upto_3' => 'gray'][$band], 'value' => (int) $bands->get($band, 0),
            ], self::AGE_BANDS));
        $blockedTile = ReportSummary::make('rqa_blocked', 'คำขอที่ติดค้าง', $blocked->count())->withSplit([
            ['key' => 'left', 'label_key' => 'rep_rqa_blocked_left', 'tone' => 'red', 'value' => $blocked->filter(fn (string $b) => $b === 'left')->count()],
            ['key' => 'no_account', 'label_key' => 'rep_rqa_blocked_no_account', 'tone' => 'amber', 'value' => $blocked->filter(fn (string $b) => $b === 'no_account')->count()],
        ]);

        return [
            $bands->get('over_7', 0) > 0 ? $waitTile->withAttention('amber') : $waitTile,
            // Trend tiles carry only their trend: the footer is Delta + Sparkline.
            ReportSummary::make('rqa_avg_days', 'เวลาพิจารณาเฉลี่ย', ApprovalFacts::average($reached), null, 'days')
                ->withNote(['label_key' => $trend['avg_days']['label_key'], 'trend' => $trend['avg_days']]),
            ReportSummary::make('rqa_rejected', 'ไม่อนุมัติ', $endings->where('outcome', 'rejected')->count())
                ->withNote(['label_key' => $trend['rejected']['label_key'], 'trend' => $trend['rejected']]),
            ReportSummary::make('rqa_skipped', 'ระบบข้าม', ApprovalFacts::skipped($steps, $from, $to)->count())
                ->withNote(['label_key' => $trend['skipped']['label_key'], 'trend' => $trend['skipped']]),
            $blocked->isNotEmpty() ? $blockedTile->withAttention('red') : $blockedTile,
        ];
    }

    /**
     * Monthly points in the range and the change from the previous period, for the tiles without a bar.
     *
     * @param  Collection<int, RequestApproval>  $steps
     * @param  array<string, mixed>  $filters
     * @param  array{from: Carbon, to: Carbon, comparable: bool}  $previous
     * @return array<string, array<string, mixed>>
     */
    private function trends(Collection $steps, array $filters, array $previous): array
    {
        [$from, $to] = $this->dayRange($filters);
        $approver = $filters['approver'] ?? null;
        $basis = $previous['comparable'] ? 'prev' : 'no_base';
        $months = $this->months($from, $to);
        $inMonth = fn (?Carbon $at, string $month) => $at?->format('Y-m') === $month;

        $reached = ApprovalFacts::reached($steps, $from, $to, $approver);
        $rejected = collect(ApprovalFacts::endings($steps, $from, $to, $approver))->where('outcome', 'rejected');
        $skipped = ApprovalFacts::skipped($steps, $from, $to);
        $before = [
            'reached' => ApprovalFacts::reached($steps, $previous['from'], $previous['to'], $approver),
            'rejected' => collect(ApprovalFacts::endings($steps, $previous['from'], $previous['to'], $approver))->where('outcome', 'rejected'),
            'skipped' => ApprovalFacts::skipped($steps, $previous['from'], $previous['to']),
        ];

        return [
            'avg_days' => self::trend(ApprovalFacts::average($reached), ApprovalFacts::average($before['reached']), $basis,
                array_map(fn (string $m) => ApprovalFacts::average($reached->filter(fn (RequestApproval $s) => $inMonth($s->became_current_at, $m))), $months), false),
            'rejected' => self::trend($rejected->count(), $before['rejected']->count(), $basis,
                array_map(fn (string $m) => $rejected->filter(fn (array $e) => $inMonth($e['at'], $m))->count(), $months), false),
            'skipped' => self::trend($skipped->count(), $before['skipped']->count(), $basis,
                array_map(fn (string $m) => $skipped->filter(fn (RequestApproval $s) => $inMonth($s->request->created_at, $m))->count(), $months), null),
        ];
    }

    /** @return list<string> "Y-m" of every month the range touches, oldest first */
    private function months(Carbon $from, Carbon $to): array
    {
        $months = [];
        for ($m = $from->copy()->startOfMonth(); $m->lte($to); $m->addMonth()) {
            $months[] = $m->format('Y-m');
        }

        return $months;
    }

    // ── cards ───────────────────────────────────────────────────────────────────────

    /**
     * The cards above the list: codes, names and numbers only, the page writes the words.
     *
     * @param  array<string, mixed>  $filters
     * @return array{stuck: array<string, list<array<string, mixed>>>, approvers: array<string, mixed>, endings: array<string, mixed>, skips: list<array<string, mixed>>}
     */
    public function breakdown(User $viewer, array $filters): array
    {
        [$from, $to] = $this->dayRange($filters);
        $approver = $filters['approver'] ?? null;
        // Each card loads only the steps it reads: waiting, ended requests, skipped steps, and plain rows for the approvers
        $reached = ApprovalFacts::reachedRows($filters, $from, $to, $approver);
        $skipped = ApprovalFacts::skippedSteps($filters, $from, $to);
        $departments = Department::query()
            ->whereIn('id', collect($reached)->pluck('approver_department_id')->merge($skipped->pluck('approver_department_id'))->filter()->unique()->values())
            ->get(['id', 'name', 'name_th'])->keyBy('id');

        return [
            'stuck' => $this->stuck(ApprovalFacts::waitingNow(ApprovalFacts::waitingSteps($filters, $from, $to), $approver)),
            'approvers' => $this->approvers($reached, $departments),
            'endings' => $this->endings(ApprovalFacts::endings(ApprovalFacts::endedSteps($filters, $from, $to), $from, $to, $approver)),
            'skips' => $this->skips($skipped, $departments, fn (array $ids) => count(array_diff_key(array_flip($ids), ApprovalFacts::decidedRequests($filters, $from, $to, $ids)))),
        ];
    }

    /**
     * Requests waiting now, longest first: approver left, approver has no login, over 7 days, 7 days or less.
     *
     * @param  Collection<int, RequestApproval>  $waiting
     * @return array{left: list<array<string, mixed>>, no_account: list<array<string, mixed>>, over7: list<array<string, mixed>>, upto7: list<array<string, mixed>>}
     */
    private function stuck(Collection $waiting): array
    {
        $groups = ['left' => [], 'no_account' => [], 'over7' => [], 'upto7' => []];
        $sorted = $waiting->sortBy([fn ($a, $b) => ApprovalFacts::days($b) <=> ApprovalFacts::days($a), fn ($a, $b) => $a->id <=> $b->id]);
        foreach ($sorted as $step) {
            $days = ApprovalFacts::days($step);
            $group = ApprovalFacts::blockedBecause($step) ?? ($days > 7 ? 'over7' : 'upto7');
            $person = ApprovalFacts::person($step);
            $groups[$group][] = [
                'request_id' => $step->service_request_id,
                'reference' => $step->request->reference,
                'type' => $step->request->type->value,
                'label' => $step->label,
                'position' => $step->position,
                'approver' => ['name' => $person['name'], 'code' => $person['code'], 'kind' => $person['kind']],
                'approver_left_on' => $group === 'left' ? $step->approver?->last_day?->format('Y-m-d') : null,
                'requester' => $step->request->requester_name,
                'became_current_at' => $step->became_current_at->format('Y-m-d H:i'),
                'days' => $days,
                'age_band' => self::ageBand($days),
            ];
        }

        return $groups;
    }

    /**
     * One row per approver over the steps reached in the range, slowest average first; group steps and unlinked accounts last.
     *
     * @param  list<array<string, mixed>>  $reached  ApprovalFacts::reachedRows()
     * @param  Collection<int, Department>  $departments
     * @return array{rows: list<array<string, mixed>>, total: array<string, mixed>}
     */
    private function approvers(array $reached, Collection $departments): array
    {
        $summarise = function (array $set): array {
            $days = array_column($set, 'days');
            $waitingDays = array_column(array_filter($set, fn (array $r) => $r['waiting']), 'days');
            $oldest = $waitingDays === [] ? null : max($waitingDays);

            return [
                'steps' => count($set),
                'approved' => count(array_filter($set, fn (array $r) => $r['status'] === 'approved')),
                'rejected' => count(array_filter($set, fn (array $r) => $r['status'] === 'rejected')),
                'waiting' => count($waitingDays),
                'avg_days' => $days === [] ? null : round(array_sum($days) / count($days), 1),
                'max_days' => $days === [] ? null : max($days),
                'oldest_waiting_days' => $oldest,
                'oldest_age_band' => $oldest === null ? null : self::ageBand($oldest),
            ];
        };

        // The people the steps name, read once
        $approverIds = array_values(array_unique(array_filter(array_column($reached, 'approver_employee_id'))));
        $userIds = array_values(array_unique(array_filter(array_column($reached, 'acted_by_user_id'))));
        $approvers = Employee::query()->select(['id', 'code', 'first_name', 'last_name', 'status', 'last_day', 'department_id'])
            ->with(['department:id,name,name_th', 'user:id,employee_id'])->whereIn('id', $approverIds)->get()->keyBy('id');
        $actors = User::query()->select(['id', 'employee_id'])
            ->with(['employee:id,code,department_id', 'employee.department:id,name,name_th'])->whereIn('id', $userIds)->get()->keyBy('id');
        $employeeOf = fn (array $r): ?Employee => $r['acted_by_user_id'] !== null ? $actors->get($r['acted_by_user_id'])?->employee : $approvers->get($r['approver_employee_id']);
        $personOf = fn (array $r): array => ApprovalFacts::personOf($employeeOf($r), $r['acted_by_user_id'] !== null || $r['acted_by_name'] !== null, $r['key']);

        $byKey = [];
        foreach ($reached as $row) {
            $byKey[$row['key']][] = $row;
        }

        $rows = collect($byKey)
            ->map(function (array $set, string|int $key) use ($summarise, $departments, $personOf, $approvers) {
                $named = null;
                foreach ($set as $candidate) {
                    if ($personOf($candidate)['kind'] === 'person') {
                        $named = $candidate;
                        break;
                    }
                }
                $named ??= $set[0];
                $person = $personOf($named);
                $flags = array_filter(array_map(fn (array $r) => $r['waiting'] ? ApprovalFacts::blockedOf($approvers->get($r['approver_employee_id'])) : null, $set));
                $group = $departments->get($named['approver_department_id']);

                return [
                    'key' => (string) $key,
                    'name' => $person['name'],
                    'code' => $person['code'],
                    'department' => $person['kind'] === 'group_step' ? ($group ? ['name' => $group->name, 'name_th' => $group->name_th] : null) : $person['department'],
                    'kind' => $person['kind'],
                    'apart' => $person['kind'] !== 'person',
                    'left' => ($approvers->get($named['approver_employee_id'])?->hasLeft() ?? false) || in_array('left', $flags, true),
                    // Only while they still hold a step nobody else can decide.
                    'no_account' => in_array('no_account', $flags, true),
                ] + $summarise($set);
            })
            ->sortBy([
                fn ($a, $b) => (int) $a['apart'] <=> (int) $b['apart'],
                fn ($a, $b) => ($b['avg_days'] ?? -1) <=> ($a['avg_days'] ?? -1),
                fn ($a, $b) => strcmp($a['key'], $b['key']),
            ])
            ->values()->all();

        return ['rows' => $rows, 'total' => ['approvers' => count($rows)] + $summarise($reached)];
    }

    /**
     * Ended requests newest first, and the counts the outcome segments show.
     *
     * @param  list<array{request: ServiceRequest, outcome: string, step: RequestApproval, by: ?string, reason: ?string, at: Carbon}>  $endings
     * @return array{counts: array<string, int>, rows: list<array<string, mixed>>}
     */
    private function endings(array $endings): array
    {
        $rows = array_map(fn (array $e) => [
            'request_id' => $e['request']->id,
            'reference' => $e['request']->reference,
            'type' => $e['request']->type->value,
            'outcome' => $e['outcome'],
            // Null for IT's closing step: the page says "ทีม IT".
            'stop_label' => $e['outcome'] === 'not_delivered' ? null : $e['step']->label,
            'stop_position' => $e['outcome'] === 'not_delivered' ? null : $e['step']->position,
            'decided_by' => $e['by'],
            'reason' => filled($e['reason']) ? trim((string) $e['reason']) : null,
            'at' => $e['at']->format('Y-m-d H:i'),
        ], $endings);
        $count = fn (string $o) => count(array_filter($rows, fn (array $r) => $r['outcome'] === $o));

        return [
            'counts' => ['all' => count($rows), 'rejected' => $count('rejected'), 'withdrawn' => $count('withdrawn'), 'not_delivered' => $count('not_delivered')],
            'rows' => $rows,
        ];
    }

    /**
     * Every skip reason, zeros included, with the names its "สิ่งที่ควรดู" sentence needs.
     *
     * @param  Collection<int, RequestApproval>  $skipped
     * @param  Collection<int, Department>  $departments
     * @param  callable(list<int>): int  $unapproved  how many of these requests had every approval step skipped
     * @return list<array<string, mixed>>
     */
    private function skips(Collection $skipped, Collection $departments, callable $unapproved): array
    {
        $requests = $skipped->pluck('request')->unique('id');
        $groups = EmailGroup::query()->whereIn('id', $requests->pluck('email_group_id')->filter()->unique()->values())->get(['id', 'code', 'name', 'owner_employee_id'])->keyBy('id');
        $shares = FileShare::query()->whereIn('id', $requests->pluck('file_share_id')->filter()->unique()->values())->get(['id', 'code', 'name', 'owner_employee_id'])->keyBy('id');
        $positions = Position::query()->whereIn('id', $skipped->flatMap(fn (RequestApproval $s) => $s->approver_position_ids ?? [])->unique()->values())->pluck('title', 'id');

        // The email group or file share the request asked for (RequestType::ownerSource), with today's owner.
        $resourceOf = function (ServiceRequest $request) use ($groups, $shares) {
            $model = match ($request->type->ownerSource()) {
                'email_group_id' => $groups->get($request->email_group_id),
                'file_share_id' => $shares->get($request->file_share_id),
                default => null,
            };

            return $model ? ['key' => $model::class.$model->id, 'name' => $model->name, 'code' => $model->code, 'owner_employee_id' => $model->owner_employee_id] : null;
        };
        $names = fn (Collection $list) => $list->map(fn (array $x) => ['name' => $x['name'], 'code' => $x['code']])->values()->all();

        $out = [];
        foreach (self::SKIP_REASONS as $reason) {
            $set = $skipped->filter(fn (RequestApproval $s) => ApprovalFacts::skipReason($s) === $reason)->values();
            $requestIds = $set->pluck('service_request_id')->unique()->values()->all();
            $own = $set->pluck('request')->unique('id');
            $resources = $own->map($resourceOf)->filter()->unique('key')->values();

            $out[] = [
                'reason' => $reason,
                'steps' => $set->count(),
                'requests' => count($requestIds),
                'labels' => $set->countBy('label')->sortDesc()->all(),
                'unapproved_requests' => $unapproved($requestIds),
                'top_requesters' => $set->countBy(fn (RequestApproval $s) => (string) $s->request->requester_name)
                    ->map(fn (int $n, string $name) => ['name' => $name, 'count' => $n])
                    ->sortBy([fn ($a, $b) => $b['count'] <=> $a['count'], fn ($a, $b) => strcmp($a['name'], $b['name'])])
                    ->take(3)->values()->all(),
                'ownerless_resources' => $reason === 'no_resource_owner' ? $names($resources->filter(fn (array $x) => $x['owner_employee_id'] === null)) : [],
                'managerless_requesters' => $reason === 'no_manager'
                    ? $this->requesters($own)->filter(fn ($e) => $e !== null && $e->status?->value === 'active' && $e->manager_id === null)
                        ->unique('id')->map(fn ($e) => ['name' => $e->name, 'code' => $e->code])->values()->all()
                    : [],
                'resources' => $reason === 'requester_is_owner' ? $names($resources) : [],
                'departments' => $reason === 'no_department_approver'
                    ? $set->groupBy(fn (RequestApproval $s) => (string) $s->approver_department_id)->map(function (Collection $steps) use ($departments, $positions) {
                        $department = $departments->get($steps->first()->approver_department_id);
                        $ids = $steps->flatMap(fn (RequestApproval $s) => $s->approver_position_ids ?? [])->unique()->sort()->values();

                        return [
                            'department' => $department ? ['name' => $department->name, 'name_th' => $department->name_th] : null,
                            'positions' => $ids->map(fn ($id) => $positions->get($id))->filter()->values()->all(),
                        ];
                    })->values()->all()
                    : [],
            ];
        }

        return $out;
    }

    /**
     * The employees behind these requests, in request order (null where the row is gone).
     *
     * @param  Collection<int, ServiceRequest>  $requests
     * @return Collection<int, Employee|null>
     */
    private function requesters(Collection $requests): Collection
    {
        $employees = Employee::query()->whereIn('id', $requests->pluck('employee_id')->filter()->unique()->values())
            ->get(['id', 'code', 'first_name', 'last_name', 'status', 'manager_id'])->keyBy('id');

        return $requests->map(fn (ServiceRequest $r) => $employees->get($r->employee_id));
    }

    // ── export ──────────────────────────────────────────────────────────────────────

    /**
     * The cards as sheets: waiting now, approvers, ended requests, skipped steps.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $b = $this->breakdown($viewer, $filters);
        $type = fn (string $t) => self::typeTh()[$t] ?? $t;
        $dept = fn (?array $d) => $d === null ? null : (($d['name_th'] ?? null) ?: $d['name']);
        $why = ['left' => 'ผู้อนุมัติลาออกแล้ว', 'no_account' => 'ผู้อนุมัติยังไม่มีบัญชี', 'over7' => 'รอเกิน 7 วัน', 'upto7' => 'รอไม่เกิน 7 วัน'];
        $stuck = [];
        foreach ($b['stuck'] as $group => $rows) {
            foreach ($rows as $r) {
                $stuck[] = [$why[$group], $r['reference'], $type($r['type']), $r['label'], $r['approver']['name'], $r['approver']['code'], $r['requester'], DateDisplay::cellDateTime($r['became_current_at']), $r['days'], self::AGE_BAND_TH[$r['age_band']]];
            }
        }

        return [
            [
                'title' => 'รออนุมัติตอนนี้',
                'headings' => ['สาเหตุ', 'เลขที่คำขอ', 'ประเภทคำขอ', 'ขั้น', 'รอใคร', 'รหัส', 'ผู้ขอ', 'ถึงคิว', 'รอมาแล้ว (วัน)', 'กลุ่ม'],
                'rows' => $stuck,
            ],
            [
                'title' => 'ผู้อนุมัติ',
                'headings' => ['ผู้อนุมัติ', 'รหัส', 'แผนก', 'ขั้นที่ถึงคิว', 'อนุมัติ', 'ไม่อนุมัติ', 'รออนุมัติ', 'เฉลี่ย (วัน)', 'นานสุด (วัน)', 'ค้างนานสุด (วัน)'],
                'rows' => array_map(fn (array $r) => [
                    $r['name'], $r['code'], $dept($r['department']), $r['steps'], $r['approved'], $r['rejected'], $r['waiting'], $r['avg_days'], $r['max_days'], $r['oldest_waiting_days'],
                ], $b['approvers']['rows']),
            ],
            [
                'title' => 'คำขอที่ไม่อนุมัติและยกเลิก',
                'headings' => ['เลขที่คำขอ', 'ประเภทคำขอ', 'ผล', 'หยุดที่', 'ใคร', 'เหตุผล', 'วันที่'],
                'rows' => array_map(fn (array $r) => [
                    $r['reference'], $type($r['type']), self::OUTCOME_TH[$r['outcome']], $r['stop_label'] ?? 'ทีม IT', $r['decided_by'],
                    $r['reason'] ?? 'ไม่ได้บันทึกเหตุผล', DateDisplay::cellDateTime($r['at']),
                ], $b['endings']['rows']),
            ],
            [
                'title' => 'ขั้นอนุมัติที่ระบบข้าม',
                'headings' => ['เหตุผลที่ข้าม', 'ขั้น', 'คำขอ', 'ไม่มีใครอนุมัติเลย', 'ขั้นที่ถูกข้าม'],
                'rows' => array_map(fn (array $s) => [
                    self::SKIP_TH[$s['reason']], $s['steps'], $s['requests'], $s['unapproved_requests'],
                    implode(', ', array_map(fn (string $label, int $n) => "{$label} {$n}", array_keys($s['labels']), $s['labels'])),
                ], $b['skips']),
            ],
        ];
    }
}
