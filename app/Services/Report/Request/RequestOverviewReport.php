<?php

namespace App\Services\Report\Request;

use App\Enums\Request\RequestType;
use App\Models\Employee\Department;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\DateDisplay;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * "ภาพรวมคำขอ": every request submitted in a date range — what is asked for, who asks, and how many
 * whole days until it is delivered. The rows are the requests; breakdown() feeds the cards above them.
 */
class RequestOverviewReport extends TabularReport
{
    use RequestLabels;

    private const ORIGIN_KEYS = ['direct' => 'rep_rqo_origin_direct', 'onboarding' => 'rep_rqo_origin_onboarding'];

    private const ORIGIN_TH = ['direct' => 'ยื่นเอง', 'onboarding' => 'พนักงานใหม่'];

    private const CATEGORY_TH = [
        'hardware' => 'ฮาร์ดแวร์', 'software' => 'ซอฟต์แวร์', 'network' => 'เครือข่าย',
        'cctv' => 'กล้องวงจรปิด', 'telephone' => 'โทรศัพท์', 'other' => 'อื่น ๆ',
    ];

    /** Weeks the pending tile's line looks back over. */
    private const PENDING_WEEKS = 8;

    public function key(): string
    {
        return 'requests.overview';
    }

    public function title(): string
    {
        return 'ภาพรวมคำขอ';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfYear()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('type', Options::fromLabels(self::typeKeys())),
            ReportFilter::select('department_id', Options::departments()),
            ReportFilter::select('status', Options::fromLabels(self::STATUS_KEYS)),
        ];
    }

    /**
     * Requests of the chosen type, department (the requester's) and status, any submit date.
     *
     * @param  array<string, mixed>  $filters
     */
    private function scoped(array $filters): Builder
    {
        return ServiceRequest::query()
            ->when($filters['type'] ?? null, fn (Builder $q, string $type) => $q->where('type', $type))
            ->when($filters['department_id'] ?? null, fn (Builder $q, $id) => self::inDepartment($q, (int) $id))
            ->when($filters['status'] ?? null, fn (Builder $q, string $status) => $q->where('status', $status));
    }

    /** The requester's department; a request whose employee row is gone falls back to the name written on it. */
    private static function inDepartment(Builder $query, int $id): Builder
    {
        $department = Department::query()->find($id);

        return $query->where(fn (Builder $q) => $q
            ->whereHas('employee', fn (Builder $e) => $e->where('department_id', $id))
            ->orWhere(fn (Builder $gone) => $gone->whereDoesntHave('employee')
                ->whereIn('department_name', array_filter([$department?->name, $department?->name_th]))));
    }

    /**
     * The same requests with only the columns the tiles count, no relations.
     *
     * @param  array<string, mixed>  $filters
     */
    private function slim(array $filters): Builder
    {
        return $this->scoped($filters)->select([
            'id', 'reference', 'type', 'origin', 'status', 'employee_id', 'created_at', 'approved_at', 'rejected_at', 'completed_at', 'cancelled_at',
        ]);
    }

    public function query(User $viewer, array $filters): Builder
    {
        [$from, $to] = $this->dayRange($filters);

        return $this->scoped($filters)
            ->with(['employee.department', 'requestOption', 'software', 'fileShare', 'emailGroup', 'socialPlatform',
                'approvals' => fn ($q) => $q->where('kind', 'completion')])
            ->whereBetween('created_at', [$from, $to])
            ->orderByDesc('created_at')->orderByDesc('id');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('request_no', 'เลขที่คำขอ', fn (ServiceRequest $r) => $r->reference)->linkTo('/requests', fn (ServiceRequest $r) => $r->id),
            ReportColumn::date('submitted_at', 'วันที่ยื่น', fn (ServiceRequest $r) => $r->created_at),
            ReportColumn::enum('request_type', 'ประเภทคำขอ', fn (ServiceRequest $r) => $r->type, self::typeKeys(), self::typeTh()),
            // Drawn as a badge in the type cell on the page.
            ReportColumn::enum('origin', 'ที่มา', fn (ServiceRequest $r) => $r->origin, self::ORIGIN_KEYS, self::ORIGIN_TH)->hiddenByDefault(),
            ReportColumn::text('requester', 'ผู้ขอ', fn (ServiceRequest $r) => $r->requester_name),
            // Drawn under the name on the page.
            ReportColumn::text('employee_code', 'รหัสพนักงาน', fn (ServiceRequest $r) => $r->employee?->code)->hiddenByDefault(),
            ReportColumn::localized('department', 'แผนก', fn (ServiceRequest $r) => self::department($r))->hiddenByDefault(),
            ReportColumn::enum('status', 'สถานะ', fn (ServiceRequest $r) => $r->status, self::STATUS_KEYS, self::STATUS_TH),
            ReportColumn::date('approved_at', 'อนุมัติครบ', fn (ServiceRequest $r) => $r->approved_at)->labelKey('rep_c_rqo_approved_at'),
            ReportColumn::date('completed_at', 'เสร็จสิ้น', fn (ServiceRequest $r) => $r->completed_at)->labelKey('rep_c_rqo_completed_at'),
            ReportColumn::number('total_days', 'ยื่นจนเสร็จสิ้น (วัน)', fn (ServiceRequest $r) => $r->completed_at ? self::wholeDays($r->created_at, $r->completed_at) : null)
                ->labelKey('rep_c_rqo_total_days'),
            // Still open (pending or approved): whole days since it was submitted.
            ReportColumn::number('open_days', 'ผ่านมาแล้ว (วัน)', fn (ServiceRequest $r) => self::isOpen($r) ? self::wholeDays($r->created_at, now()) : null)
                ->labelKey('rep_c_rqo_open_days')->hiddenByDefault(),
            ReportColumn::text('item', 'รายการที่ขอ', fn (ServiceRequest $r) => self::itemLabel($r))->sheetOnly(),
            ReportColumn::number('approval_days', 'ขั้นอนุมัติ (วัน)', fn (ServiceRequest $r) => $r->approved_at ? self::wholeDays($r->created_at, $r->approved_at) : null)->sheetOnly(),
            ReportColumn::number('it_days', 'ขั้น IT (วัน)', fn (ServiceRequest $r) => $r->approved_at && $r->completed_at ? self::wholeDays($r->approved_at, $r->completed_at) : null)->sheetOnly(),
            ReportColumn::text('submitted_by', 'ยื่นในระบบโดย', fn (ServiceRequest $r) => $r->submitted_by_name)->sheetOnly(),
            ReportColumn::dateTime('rejected_at', 'ไม่อนุมัติเมื่อ', fn (ServiceRequest $r) => $r->rejected_at)->sheetOnly(),
            ReportColumn::dateTime('cancelled_at', 'ยกเลิกเมื่อ', fn (ServiceRequest $r) => $r->cancelled_at)->sheetOnly(),
            ReportColumn::text('cancelled_by', 'ผู้ยกเลิก', fn (ServiceRequest $r) => $r->cancelled_by_name ?? self::notDelivered($r)?->acted_by_name)->sheetOnly(),
            ReportColumn::text('cancel_reason', 'เหตุผลที่ยกเลิก', fn (ServiceRequest $r) => $r->cancel_reason ?? self::notDelivered($r)?->note)->sheetOnly(),
        ];
    }

    /** IT closed the case without delivering: the completion step names who and why (the request row does not). */
    private static function notDelivered(ServiceRequest $r): ?RequestApproval
    {
        if ($r->status?->value !== 'cancelled' || ! $r->relationLoaded('approvals')) {
            return null;
        }

        return $r->approvals->first(fn (RequestApproval $a) => $a->kind?->value === 'completion' && $a->acted_at !== null);
    }

    private static function isOpen(ServiceRequest $r): bool
    {
        return in_array($r->status?->value, ['pending', 'approved'], true);
    }

    /** @return array{name: string, name_th: ?string}|null */
    private static function department(ServiceRequest $r): ?array
    {
        $department = $r->employee?->department;
        if ($department) {
            return ['name' => $department->name, 'name_th' => $department->name_th];
        }

        return $r->department_name ? ['name' => $r->department_name, 'name_th' => null] : null;
    }

    /**
     * The item the request picked — a device option, software, file share, mail group or social platform.
     *
     * @return array{kind: string, id: int, name: string, name_th: ?string}|null
     */
    private static function item(ServiceRequest $r): ?array
    {
        return match (true) {
            $r->software !== null => ['kind' => 'software', 'id' => $r->software->id, 'name' => $r->software->name, 'name_th' => null],
            $r->fileShare !== null => ['kind' => 'file_share', 'id' => $r->fileShare->id, 'name' => $r->fileShare->name, 'name_th' => null],
            $r->emailGroup !== null => ['kind' => 'email_group', 'id' => $r->emailGroup->id, 'name' => $r->emailGroup->name, 'name_th' => null],
            $r->socialPlatform !== null => ['kind' => 'social_platform', 'id' => $r->socialPlatform->id, 'name' => $r->socialPlatform->name, 'name_th' => null],
            $r->requestOption !== null => ['kind' => 'option', 'id' => $r->requestOption->id, 'name' => $r->requestOption->label_en, 'name_th' => $r->requestOption->label_th],
            default => null,
        };
    }

    private static function itemLabel(ServiceRequest $r): ?string
    {
        $item = self::item($r);

        return $item === null ? null : ($item['name_th'] ?: $item['name']);
    }

    /** @param list<int|float> $values */
    private static function median(array $values): int|float|null
    {
        return collect($values)->median();
    }

    /**
     * Requests submitted between two moments under the filters, with what the cards read.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, ServiceRequest>
     */
    private function submitted(array $filters, CarbonInterface $from, CarbonInterface $to): Collection
    {
        return $this->scoped($filters)
            ->with(['employee.department', 'requestOption', 'software', 'fileShare', 'emailGroup', 'socialPlatform'])
            ->whereBetween('created_at', [$from, $to])
            ->get();
    }

    /** @param Collection<int, ServiceRequest> $requests */
    private static function leadMedian(Collection $requests): int|float|null
    {
        return self::median($requests->filter(fn (ServiceRequest $r) => $r->status?->value === 'completed' && $r->completed_at)
            ->map(fn (ServiceRequest $r) => self::wholeDays($r->created_at, $r->completed_at))->values()->all());
    }

    /**
     * How many requests were waiting for approval at a moment: submitted by then and not yet
     * approved, rejected or cancelled.
     *
     * @param  Collection<int, ServiceRequest>  $requests
     */
    private static function pendingAt(Collection $requests, CarbonInterface $at): int
    {
        return $requests->filter(function (ServiceRequest $r) use ($at) {
            $decided = collect([$r->approved_at, $r->rejected_at, $r->cancelled_at])->filter()->min();

            return $r->created_at->lte($at) && ($decided === null || $decided->gt($at));
        })->count();
    }

    public function summary(Builder $query, array $filters): array
    {
        [$from, $to] = $this->dayRange($filters);
        $rows = $this->slim($filters)->whereBetween('created_at', [$from, $to])->get();
        $count = $rows->countBy(fn (ServiceRequest $r) => $r->status->value);
        $total = $rows->count();
        $completed = (int) $count->get('completed', 0);
        $rejected = (int) $count->get('rejected', 0);
        $is = fn (string $status) => fn (ServiceRequest $r) => $r->status->value === $status;

        $previous = self::previousPeriod($from, $to);
        $before = $previous['comparable'] ? $this->slim($filters)->whereBetween('created_at', [$previous['from'], $previous['to']])->get() : null;
        $basis = $previous['comparable'] ? 'prev' : 'no_base';
        $perMonth = fn (callable $measure) => array_map(
            fn (Carbon $m) => $measure($rows->filter(fn (ServiceRequest $r) => $r->created_at->format('Y-m') === $m->format('Y-m'))),
            $this->monthStarts($from, $to),
        );

        [$waiting, $weekly] = $this->pendingNow($filters);
        $oldest = $waiting->sortBy('created_at')->first();
        $oldestDays = $oldest ? self::wholeDays($oldest->created_at, now()) : 0;
        // Trend tiles carry only their trend: the footer is Delta + Sparkline.
        $carry = fn (array $trend) => ['label_key' => $trend['label_key'], 'trend' => $trend];
        $pendingTile = ReportSummary::make('rqo_pending', 'รออนุมัติ', $waiting->count())
            ->withNote($carry(self::trend($waiting->count(), $weekly[self::PENDING_WEEKS - 2], 'since_7d', $weekly, false)));
        $lead = self::leadMedian($rows);

        return [
            ReportSummary::make('rqo_total', 'คำขอทั้งหมด', $total)->withSplit([
                ['key' => 'completed', 'label_key' => 'rep_rqo_part_completed', 'tone' => 'soft-green', 'value' => $completed],
                ['key' => 'open', 'label_key' => 'rep_rqo_part_open', 'tone' => 'soft-amber', 'value' => (int) $count->get('pending', 0) + (int) $count->get('approved', 0)],
                ['key' => 'closed', 'label_key' => 'rep_rqo_part_closed', 'tone' => 'gray', 'value' => $rejected + (int) $count->get('cancelled', 0)],
            ]),
            $oldest && self::ageBand($oldestDays) === 'over_7' ? $pendingTile->withAttention('amber') : $pendingTile,
            ReportSummary::make('rqo_completed', 'เสร็จสิ้น', $completed)->withShareOf($total)->withNote([
                'label_key' => 'rep_n_rqo_waiting_it',
                'values' => ['n' => (int) $count->get('approved', 0)],
            ]),
            ReportSummary::make('rqo_rejected', 'ไม่อนุมัติ', $rejected)
                ->withNote($carry(self::trend($rejected, $before?->filter($is('rejected'))->count(), $basis, $perMonth(fn (Collection $c) => $c->filter($is('rejected'))->count()), false))),
            ReportSummary::make('rqo_lead', 'ยื่นจนเสร็จสิ้น (มัธยฐาน วัน)', $lead, null, 'days')
                ->withNote($carry(self::trend($lead, $before ? self::leadMedian($before) : null, $basis, $perMonth(fn (Collection $c) => self::leadMedian($c)), false))),
        ];
    }

    /**
     * The pending tile is a "now" figure: requests waiting for approval today, whatever their submit
     * date (type and department filters only), and how many were waiting at the end of each of the
     * last weeks, oldest first, today last. Nothing when the status filter rules pending out.
     *
     * @param  array<string, mixed>  $filters
     * @return array{0: Collection<int, ServiceRequest>, 1: list<int>}
     */
    private function pendingNow(array $filters): array
    {
        $status = $filters['status'] ?? null;
        if ($status !== null && $status !== 'pending') {
            return [collect(), array_fill(0, self::PENDING_WEEKS, 0)];
        }
        $start = now()->subDays((self::PENDING_WEEKS - 1) * 7);
        // Anything still undecided at the first week's end: never decided, or decided after it.
        $pool = $this->slim(['status' => null] + $filters)
            ->where('created_at', '<=', now())
            ->where(fn (Builder $q) => $q
                ->where(fn (Builder $open) => $open->whereNull('approved_at')->whereNull('rejected_at')->whereNull('cancelled_at'))
                ->orWhere('approved_at', '>', $start)->orWhere('rejected_at', '>', $start)->orWhere('cancelled_at', '>', $start))
            ->get();

        return [
            $pool->filter(fn (ServiceRequest $r) => $r->status->value === 'pending')->values(),
            array_map(fn (int $k) => self::pendingAt($pool, now()->subDays($k * 7)), range(self::PENDING_WEEKS - 1, 0)),
        ];
    }

    /** @return list<Carbon> */
    private function monthStarts(Carbon $from, Carbon $to): array
    {
        $months = [];
        for ($month = $from->copy()->startOfMonth(); $month->lte($to); $month->addMonth()) {
            $months[] = $month->copy();
        }

        return $months;
    }

    /**
     * The cards above the list: codes and numbers only, the page writes the words.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function breakdown(array $filters): array
    {
        [$from, $to] = $this->dayRange($filters);
        $rows = $this->submitted($filters, $from, $to);

        return [
            'months' => $this->months($rows, $filters, $from, $to),
            'types' => $this->types($rows),
            'delivery' => $this->delivery($rows),
            'items' => $this->items($rows),
            'departments' => $this->departments($rows),
        ];
    }

    /**
     * Every month of the range, oldest first: requests submitted in it, and requests completed in
     * it whatever their submit date (same type, department and status filters).
     *
     * @param  Collection<int, ServiceRequest>  $rows
     * @param  array<string, mixed>  $filters
     * @return list<array{month: string, submitted: int, completed: int}>
     */
    private function months(Collection $rows, array $filters, Carbon $from, Carbon $to): array
    {
        $submitted = $rows->countBy(fn (ServiceRequest $r) => $r->created_at->format('Y-m'));
        $completed = $this->scoped($filters)->whereBetween('completed_at', [$from, $to])->get(['id', 'completed_at'])
            ->countBy(fn (ServiceRequest $r) => $r->completed_at->format('Y-m'));

        return array_map(fn (Carbon $m) => [
            'month' => $m->format('Y-m'),
            'submitted' => (int) $submitted->get($m->format('Y-m'), 0),
            'completed' => (int) $completed->get($m->format('Y-m'), 0),
        ], $this->monthStarts($from, $to));
    }

    /**
     * One row per request type, most requests first: the count in each status, and how many got
     * through approval against how many were turned down (the approval rate's two halves).
     *
     * @param  Collection<int, ServiceRequest>  $rows
     * @return list<array{type: string, total: int, by_status: array<string, int>, approved: int, rejected: int}>
     */
    private function types(Collection $rows): array
    {
        $order = array_flip(array_map(fn (RequestType $t) => $t->value, RequestType::cases()));

        return $rows->groupBy(fn (ServiceRequest $r) => $r->type->value)
            ->map(fn (Collection $list, string $type) => [
                'type' => $type,
                'total' => $list->count(),
                'by_status' => self::byStatus($list),
                'approved' => $list->filter(fn (ServiceRequest $r) => $r->approved_at !== null)->count(),
                'rejected' => $list->filter(fn (ServiceRequest $r) => $r->status->value === 'rejected')->count(),
            ])
            ->sortBy([['total', 'desc'], fn (array $a, array $b) => $order[$a['type']] <=> $order[$b['type']]])
            ->values()->all();
    }

    /**
     * @param  Collection<int, ServiceRequest>  $list
     * @return array<string, int>
     */
    private static function byStatus(Collection $list): array
    {
        $count = $list->countBy(fn (ServiceRequest $r) => $r->status->value);

        return collect(array_keys(self::STATUS_KEYS))->mapWithKeys(fn (string $s) => [$s => (int) $count->get($s, 0)])->all();
    }

    /**
     * Completed requests per type, slowest first: median whole days of the approval part
     * (submitted → approved), the IT part (approved → completed) and the whole (submitted →
     * completed), plus the same over every type.
     *
     * @param  Collection<int, ServiceRequest>  $rows
     * @return array{types: list<array{type: string, count: int, approval: int|float|null, it: int|float|null, total: int|float|null}>, all: array{count: int, approval: int|float|null, it: int|float|null, total: int|float|null}}
     */
    private function delivery(Collection $rows): array
    {
        $done = $rows->filter(fn (ServiceRequest $r) => $r->status->value === 'completed' && $r->approved_at && $r->completed_at);
        $order = array_flip(array_map(fn (RequestType $t) => $t->value, RequestType::cases()));
        $medians = fn (Collection $list) => [
            'count' => $list->count(),
            'approval' => self::median($list->map(fn (ServiceRequest $r) => self::wholeDays($r->created_at, $r->approved_at))->values()->all()),
            'it' => self::median($list->map(fn (ServiceRequest $r) => self::wholeDays($r->approved_at, $r->completed_at))->values()->all()),
            'total' => self::median($list->map(fn (ServiceRequest $r) => self::wholeDays($r->created_at, $r->completed_at))->values()->all()),
        ];

        return [
            'types' => $done->groupBy(fn (ServiceRequest $r) => $r->type->value)
                ->map(fn (Collection $list, string $type) => ['type' => $type] + $medians($list))
                ->sortBy([['total', 'desc'], fn (array $a, array $b) => $order[$a['type']] <=> $order[$b['type']]])
                ->values()->all(),
            'all' => $medians($done),
        ];
    }

    /**
     * What the requests picked, most asked for first, per origin (the page's segments add them up
     * for "ทั้งหมด"); the request count of each origin, and how many new employees HR filed for.
     *
     * @param  Collection<int, ServiceRequest>  $rows
     * @return array{origins: array{all: int, direct: int, onboarding: int}, people: int, picked: array{all: int, direct: int, onboarding: int}, list: list<array{origin: string, type: string, kind: string, id: int, name: string, name_th: ?string, count: int}>}
     */
    private function items(Collection $rows): array
    {
        $origin = fn (string $o) => $rows->filter(fn (ServiceRequest $r) => $r->origin->value === $o);
        $list = $rows->map(fn (ServiceRequest $r) => ($item = self::item($r)) === null ? null : $item + ['origin' => $r->origin->value, 'type' => $r->type->value])
            ->filter()
            ->groupBy(fn (array $i) => "{$i['origin']}|{$i['type']}|{$i['kind']}|{$i['id']}")
            ->map(fn (Collection $group) => [
                'origin' => $group->first()['origin'], 'type' => $group->first()['type'], 'kind' => $group->first()['kind'],
                'id' => $group->first()['id'], 'name' => $group->first()['name'], 'name_th' => $group->first()['name_th'], 'count' => $group->count(),
            ])
            ->sortBy([['count', 'desc'], ['name', 'asc']])
            ->values();

        return [
            'origins' => ['all' => $rows->count(), 'direct' => $origin('direct')->count(), 'onboarding' => $origin('onboarding')->count()],
            'people' => $origin('onboarding')->pluck('employee_id')->filter()->unique()->count(),
            'picked' => [
                'all' => (int) $list->sum('count'),
                'direct' => (int) $list->where('origin', 'direct')->sum('count'),
                'onboarding' => (int) $list->where('origin', 'onboarding')->sum('count'),
            ],
            'list' => $list->all(),
        ];
    }

    /**
     * Requests by the requester's department, most first (null = no department): the count per
     * ticket category of the request type, the type asked for most (and how many types tie with
     * it), and how many HR filed for new employees.
     *
     * @param  Collection<int, ServiceRequest>  $rows
     * @return list<array{department_id: ?int, name: ?string, name_th: ?string, total: int, by_category: array<string, int>, top_type: array{type: string, count: int, ties: int}, onboarding: int}>
     */
    private function departments(Collection $rows): array
    {
        $order = array_flip(array_map(fn (RequestType $t) => $t->value, RequestType::cases()));
        // A request whose employee row is gone joins the department its written name matches.
        $byName = Department::query()->get(['id', 'name', 'name_th'])
            ->flatMap(fn (Department $d) => array_filter([$d->name => $d, $d->name_th => $d], fn ($v, $k) => $k !== '', ARRAY_FILTER_USE_BOTH));
        $group = function (ServiceRequest $r) use ($byName): string {
            $id = $r->employee?->department_id ?? $byName->get((string) $r->department_name)?->id;

            return $id ? "id:{$id}" : 'name:'.$r->department_name;
        };
        $departments = $byName->keyBy('id');

        return $rows->groupBy($group)
            ->map(function (Collection $list, string $group) use ($order, $departments) {
                $department = str_starts_with($group, 'id:') ? $departments->get((int) substr($group, 3)) : null;
                $named = $department ? ['name' => $department->name, 'name_th' => $department->name_th] : self::department($list->first());
                $byType = $list->countBy(fn (ServiceRequest $r) => $r->type->value)->all();
                uksort($byType, fn (string $a, string $b) => ($byType[$b] <=> $byType[$a]) ?: ($order[$a] <=> $order[$b]));
                $top = array_key_first($byType);
                $categories = $list->countBy(fn (ServiceRequest $r) => $r->type->ticketCategory()->value);

                return [
                    'department_id' => str_starts_with($group, 'id:') ? (int) substr($group, 3) : null,
                    'name' => $named['name'] ?? null,
                    'name_th' => $named['name_th'] ?? null,
                    'total' => $list->count(),
                    'by_category' => collect(array_keys(self::CATEGORY_TH))->mapWithKeys(fn (string $c) => [$c => (int) $categories->get($c, 0)])->all(),
                    'top_type' => ['type' => $top, 'count' => $byType[$top], 'ties' => count(array_filter($byType, fn (int $n) => $n === $byType[$top])) - 1],
                    'onboarding' => $list->filter(fn (ServiceRequest $r) => $r->origin->value === 'onboarding')->count(),
                ];
            })
            ->sortBy([['total', 'desc'], ['name', 'asc']])
            ->values()->all();
    }

    /**
     * The cards as sheets: by month, by type and status, days to delivery, items asked for, by department.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $b = $this->breakdown($filters);
        $types = self::typeTh();
        $statuses = array_values(self::STATUS_TH);
        $rate = fn (array $t) => $t['approved'] + $t['rejected'] > 0 ? (int) round($t['approved'] / ($t['approved'] + $t['rejected']) * 100) : null;

        return [
            [
                'title' => 'รายเดือน',
                'headings' => ['เดือน', 'ยื่นคำขอ', 'เสร็จสิ้น'],
                'rows' => array_map(fn (array $m) => [DateDisplay::monthYear($m['month']), $m['submitted'], $m['completed']], $b['months']),
            ],
            [
                'title' => 'คำขอตามประเภทและสถานะ',
                'headings' => ['ประเภทคำขอ', 'คำขอ', ...$statuses, 'อัตราอนุมัติ (%)'],
                'rows' => array_map(fn (array $t) => [$types[$t['type']], $t['total'], ...array_values($t['by_status']), $rate($t)], $b['types']),
            ],
            [
                'title' => 'ระยะเวลาดำเนินการจนเสร็จสิ้น',
                'headings' => ['ประเภทคำขอ', 'คำขอที่เสร็จสิ้น', 'ขั้นอนุมัติ (มัธยฐาน วัน)', 'ขั้น IT (มัธยฐาน วัน)', 'ยื่นจนเสร็จสิ้น (มัธยฐาน วัน)'],
                'rows' => [
                    ...array_map(fn (array $d) => [$types[$d['type']], $d['count'], $d['approval'], $d['it'], $d['total']], $b['delivery']['types']),
                    ['ทุกประเภท', $b['delivery']['all']['count'], $b['delivery']['all']['approval'], $b['delivery']['all']['it'], $b['delivery']['all']['total']],
                ],
            ],
            [
                'title' => 'รายการที่ขอบ่อย',
                'headings' => ['รายการ', 'ประเภทคำขอ', 'ที่มา', 'คำขอ'],
                'rows' => array_map(fn (array $i) => [$i['name_th'] ?: $i['name'], $types[$i['type']], self::ORIGIN_TH[$i['origin']], $i['count']], $b['items']['list']),
            ],
            [
                'title' => 'ตามแผนก',
                'headings' => ['แผนก', 'คำขอ', ...array_values(self::CATEGORY_TH), 'ขอมากสุด', 'พนักงานใหม่'],
                'rows' => array_map(fn (array $d) => [
                    $d['name'] === null ? 'ไม่ระบุแผนก' : ($d['name_th'] ?: $d['name']), $d['total'], ...array_values($d['by_category']),
                    $types[$d['top_type']['type']], $d['onboarding'],
                ], $b['departments']),
            ],
        ];
    }
}
