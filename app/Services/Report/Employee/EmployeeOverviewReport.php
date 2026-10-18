<?php

namespace App\Services\Report\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\RequestStatus;
use App\Models\Access\AccessMembership;
use App\Models\Asset\Asset;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Section;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Services\Report\Access\AccessFacts;
use App\Services\Report\Tabular\CellDate;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\DateDisplay;
use App\Support\ReportCatalogue;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * "ภาพรวมพนักงาน" (employees.overview): joiners and leavers of the date range as a list (one row per
 * event), and breakdown() for the headcount chart, the department table and leavers still holding access.
 */
class EmployeeOverviewReport extends TabularReport
{
    private const KIND_KEYS = ['joined' => 'rep_kind_joined', 'left' => 'rep_kind_left'];

    private const KIND_TH = ['joined' => 'เข้าใหม่', 'left' => 'ลาออก'];

    private const PREP_KEYS = ['none' => 'rep_prep_none', 'preparing' => 'rep_prep_preparing', 'ready' => 'rep_prep_ready'];

    private const PREP_TH = ['none' => 'ไม่มีคำขอ', 'preparing' => 'กำลังเตรียม', 'ready' => 'พร้อม'];

    /** Days ahead of a start date that still make an unfinished preparation urgent. */
    private const URGENT_DAYS = 7;

    public function key(): string
    {
        return 'employees.overview';
    }

    public function title(): string
    {
        return 'ภาพรวมพนักงาน';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfYear()->toDateString()),
            ReportFilter::date('to', today()->endOfMonth()->toDateString()),
            ReportFilter::select('department_id', Options::departments()),
            ReportFilter::select('kind', Options::fromLabels(self::KIND_KEYS)),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        [$from, $to] = $this->dayRange($filters);
        $event = fn (string $kind) => Employee::query()
            ->select('employees.*')
            ->selectRaw($kind === 'left'
                ? "'left' as movement_kind, CASE WHEN COALESCE(last_day, ?) < joined_at THEN joined_at ELSE COALESCE(last_day, ?) END as movement_date"
                : "'joined' as movement_kind, joined_at as movement_date", $kind === 'left' ? array_fill(0, 2, today()->subDay()->toDateString()) : [])
            ->selectRaw($kind === 'left' ? 'id * 2 + 1 as row_id' : 'id * 2 as row_id')
            ->when($filters['department_id'] ?? null, fn (Builder $q, $id) => $q->where('department_id', (int) $id));
        $joined = $event('joined')->whereBetween('joined_at', [$from, $to]);
        $left = $this->whereLeftIn($event('left'), $from, $to);
        $events = match ($filters['kind'] ?? null) {
            'joined' => $joined,
            'left' => $left,
            default => $joined->unionAll($left),
        };
        $onboarding = fn (bool $open) => ServiceRequest::query()
            ->selectRaw('COUNT(*)')
            ->whereColumn('service_requests.employee_id', 'employees.id')
            ->where('origin', 'onboarding')
            ->where('status', '!=', RequestStatus::Cancelled->value)
            ->when($open, fn ($q) => $q->whereIn('status', self::openRequestStatuses()));

        return Employee::query()
            ->fromSub($events, 'employees')
            ->select('employees.*')
            ->selectSub($onboarding(false), 'onboarding_total')
            ->selectSub($onboarding(true), 'onboarding_open')
            ->selectSub(Asset::query()->selectRaw('COUNT(*)')->whereColumn('assets.owner_employee_id', 'employees.id'), 'assets_held')
            ->selectSub(AccessMembership::query()->selectRaw('COUNT(*)')->whereColumn('access_memberships.employee_id', 'employees.id')->whereNull('revoked_at'), 'open_grants')
            ->with(['department:id,code,name,name_th', 'section:id,name,name_th', 'position:id,title'])
            ->orderBy('movement_date')
            ->orderBy('code')
            ->orderBy('movement_kind');
    }

    /** Someone who joins and leaves in the range has two rows, so the row id is per event. */
    public function row(Model $model): array
    {
        return ['id' => (int) $model->getAttribute('row_id')] + parent::row($model);
    }

    /** @return array<string, string> */
    protected function meanings(): array
    {
        return [
            'movement_kind' => 'เข้าใหม่ = วันเริ่มงานอยู่ในช่วงวันที่ที่เลือก, ลาออก = สถานะลาออกและวันทำงานวันสุดท้ายอยู่ในช่วง (ไม่ได้บันทึกวันสุดท้ายถือเป็นเมื่อวาน) คนที่เข้าและออกในช่วงเดียวกันมี 2 แถว',
            'prep_status' => 'เฉพาะแถวเข้าใหม่ ดูจากคำขอเตรียมเครื่องของพนักงานใหม่ที่ไม่ถูกยกเลิก: ไม่มีคำขอ, กำลังเตรียม = ยังมีคำขอรออนุมัติ อนุมัติแล้วรอส่งมอบ หรือไม่อนุมัติ, พร้อม = เสร็จสิ้นทุกคำขอ ว่าง = แถวลาออก',
            'upcoming_days' => 'เฉพาะแถวเข้าใหม่ จำนวนวันจากวันที่ส่งออกถึงวันเริ่มงาน 0 = เริ่มวันนี้ ติดลบ = เริ่มงานมาแล้วกี่วัน',
            'assets_held' => 'เฉพาะแถวลาออก จำนวนทรัพย์สินที่ยังผูกอยู่กับพนักงานคนนี้ ณ วันที่ส่งออก',
            'open_grants' => 'เฉพาะแถวลาออก จำนวนสิทธิ์การเข้าถึงที่ยังไม่ถอน ณ วันที่ส่งออก',
        ];
    }

    public function columns(): array
    {
        $left = fn (Employee $e) => $e->getAttribute('movement_kind') === 'left';

        return [
            ReportColumn::enum('movement_kind', 'เข้าหรือออก', fn (Employee $e) => $e->getAttribute('movement_kind'), self::KIND_KEYS, self::KIND_TH),
            ReportColumn::date('joined_at', 'วันเริ่มงาน', fn (Employee $e) => $e->joined_at)->labelKey('rep_c_eo_joined_at'),
            ReportColumn::date('last_day', 'วันทำงานวันสุดท้าย', fn (Employee $e) => $left($e) ? $e->last_day : null)->labelKey('rep_c_eo_last_day'),
            ReportColumn::localized('employee', 'พนักงาน', fn (Employee $e) => ['name' => $e->name, 'name_th' => $e->name_th])
                ->labelKey('rep_c_eo_employee')->linkTo('/employees', fn (Employee $e) => $e->id),
            ReportColumn::text('employee_code', 'รหัสพนักงาน', fn (Employee $e) => $e->code),
            ReportColumn::localized('department', 'แผนก', fn (Employee $e) => $e->department ? ['name' => $e->department->name, 'name_th' => $e->department->name_th, 'code' => $e->department->code] : null)->withCode('รหัสแผนก', 'รหัสแผนกในระบบ ใช้เชื่อมกับตารางแผนกใน Power BI (ชื่อแผนกอาจเปลี่ยนได้ รหัสไม่เปลี่ยน)'),
            ReportColumn::localized('section', 'หน่วยงาน', fn (Employee $e) => $e->section ? ['name' => $e->section->name, 'name_th' => $e->section->name_th] : null)
                ->labelKey('rep_c_eo_section'),
            ReportColumn::text('position', 'ตำแหน่ง', fn (Employee $e) => $e->position?->title),
            ReportColumn::enum('prep_status', 'เตรียมเครื่อง', fn (Employee $e) => $this->prepStatus($e), self::PREP_KEYS, self::PREP_TH),
            ReportColumn::text('onboarding', 'คำขอเตรียมเครื่อง (เสร็จ/ทั้งหมด)', fn (Employee $e) => $this->onboardingProgress($e))->screenOnly(),
            ReportColumn::number('onboarding_done', 'คำขอเตรียมเครื่องที่เสร็จ', fn (Employee $e) => $this->onboardingCount($e, 'done'))->sheetOnly()
                ->describe('จำนวนคำขอเตรียมเครื่องของพนักงานใหม่ที่ส่งมอบแล้ว (ว่าง = ไม่ใช่พนักงานเข้าใหม่ หรือไม่มีคำขอ)'),
            ReportColumn::number('onboarding_total', 'คำขอเตรียมเครื่องทั้งหมด', fn (Employee $e) => $this->onboardingCount($e, 'total'))->sheetOnly()
                ->describe('จำนวนคำขอเตรียมเครื่องทั้งหมดของพนักงานใหม่ (ว่าง = ไม่ใช่พนักงานเข้าใหม่ หรือไม่มีคำขอ)'),
            ReportColumn::number('upcoming_days', 'เริ่มงานอีก (วัน)', fn (Employee $e) => $left($e) || ! $e->joined_at ? null : (int) today()->diffInDays($e->joined_at, false))
                ->labelKey('rep_c_eo_upcoming_days'),
            ReportColumn::number('assets_held', 'ทรัพย์สินที่ถือ', fn (Employee $e) => $left($e) ? (int) $e->getAttribute('assets_held') : null),
            ReportColumn::number('open_grants', 'สิทธิ์ที่ยังไม่ถอน', fn (Employee $e) => $left($e) ? (int) $e->getAttribute('open_grants') : null)
                ->labelKey('rep_c_eo_open_grants'),
            ReportColumn::text('resign_reason', 'เหตุผลที่ลาออก', fn (Employee $e) => $left($e) ? $e->resign_reason : null),
        ];
    }

    /** The tiles ignore the list's kind filter: the same counts as the cards. */
    public function summary(Builder $query, array $filters): array
    {
        $f = $this->facts($filters);
        [$start, $end] = [$f['headcount']['start'], $f['headcount']['end']];
        $change = $end - $start;
        $prep = $f['prep'];
        $holding = $f['holding'];
        $types = array_values(array_filter(AccessFacts::TYPES, fn (string $t) => $holding['by_type'][$t] > 0));
        // Amber only while someone has started, or starts within a week, unprepared.
        $preparing = ReportSummary::make('eo_preparing', 'ยังเตรียมเครื่องไม่เสร็จ', $prep['people'], 'green')
            ->withNote($this->prepNote($prep));
        if ($prep['people'] > 0) {
            $preparing = $preparing->withProgress($prep['done'], $prep['total']);
        }
        if ($prep['urgent']) {
            $preparing = $preparing->withAttention('amber');
        }

        return [
            ReportSummary::make('eo_working', 'ทำงานอยู่', $end)->withNote([
                'label_key' => 'rep_n_eo_from_start',
                'trend' => [
                    'direction' => $change > 0 ? 'up' : ($change < 0 ? 'down' : 'even'),
                    'label_key' => 'rep_n_eo_from_start',
                    'values' => ['delta' => abs($change)],
                    'points' => [$start, ...array_column($f['points'], 'headcount')],
                    'up_is_good' => true,
                ],
            ]),
            ReportSummary::make('eo_joined', 'เข้าใหม่', $f['joiners']['started'])->withNote(match (true) {
                $f['joiners']['upcoming'] > 0 => ['label_key' => 'rep_n_eo_upcoming', 'values' => ['n' => $f['joiners']['upcoming']]],
                $f['joiners']['started'] > 0 => ['label_key' => 'rep_n_eo_all_started'],
                default => ['label_key' => 'rep_n_eo_no_joiners'],
            }),
            ReportSummary::make('eo_left', 'ลาออก', $f['leavers']['count'])
                ->withNote([
                    'label_key' => 'rep_n_eo_rate',
                    'texts' => ['rate' => $f['leavers']['rate'] === null ? '—' : number_format($f['leavers']['rate'], 1).'%'],
                    'trend' => $this->rateTrend($f['leavers']['rate'], $f['leavers']['prev_rate']),
                ])
                ->withChart(['kind' => 'line', 'points' => $f['leavers']['per_bucket'], 'months' => $f['leavers']['bucket_months'], 'tone' => 'bad']),
            $preparing,
            ReportSummary::make('eo_holding', 'ผู้ลาออกที่ยังถือสิทธิ์', $holding['people'])->withAttention('red')
                ->withSplit(array_map(fn (string $t) => [
                    'key' => $t, 'label_key' => AccessFacts::TYPE_KEYS[$t], 'short_key' => AccessFacts::TYPE_SHORT_KEYS[$t],
                    'tone' => AccessFacts::TYPE_TONES[$t], 'value' => $holding['by_type'][$t],
                ], $types))
                ->withNote($types === [] ? ['label_key' => 'rep_n_eo_as_of_today'] : null),
        ];
    }

    /**
     * @param  array{people: int, started: int, next_in_days: ?int}  $prep
     * @return array{label_key: string, values?: array<string, int>}
     */
    private function prepNote(array $prep): array
    {
        return match (true) {
            $prep['people'] === 0 => ['label_key' => 'rep_n_eo_prep_none'],
            $prep['started'] > 0 && $prep['next_in_days'] !== null => ['label_key' => 'rep_n_eo_prep_started_next', 'values' => ['n' => $prep['started'], 'days' => $prep['next_in_days']]],
            $prep['next_in_days'] !== null => ['label_key' => 'rep_n_eo_prep_next', 'values' => ['days' => $prep['next_in_days']]],
            default => ['label_key' => 'rep_n_eo_prep_all_started'],
        };
    }

    /**
     * The cards above the list: codes and numbers only, the page writes the words.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function breakdown(User $viewer, array $filters): array
    {
        return [...$this->facts($filters, true), 'can_open_access' => ReportCatalogue::allows($viewer, ReportCatalogue::ACCESS_OVERVIEW)];
    }

    /**
     * The page's cards as tables: headcount with joiners and leavers per period, the department
     * table with its totals, and leavers still holding access.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<mixed>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $f = $this->facts($filters, true);
        $name = fn (?array $n, string $empty = '—') => $n === null ? $empty : ((($n['name_th'] ?? null) ?: ($n['name'] ?? null)) ?: $empty);

        $periods = array_map(fn (array $p) => [
            CellDate::date($p['start']), CellDate::date($p['end']), $p['base'], $p['joined'], $p['left'], $p['headcount'], $p['headcount'] - $p['base'],
        ], $f['points']);

        $endTotal = max(1, $f['total']['end']);
        $line = fn (string $label, array $s) => [$label, $s['start'], $s['joined'], $s['left'], $s['end'], $s['end'] - $s['start'], round($s['end'] / $endTotal * 100, 1)];
        $departments = array_map(fn (array $d) => $line($name($d, 'ไม่ระบุแผนก'), $d), $f['departments']);
        $departments[] = $line('รวม', $f['total']);

        $types = ['email_group' => 'Email Group', 'file_share' => 'File Share', 'social_platform' => 'Social / Internet', 'software' => 'Software'];
        $holding = array_map(fn (array $r) => [
            $r['employee']['code'], $name($r['employee']), $name($r['department']), CellDate::date($r['last_day']), $r['days_out'], count($r['grants']),
            implode(', ', array_map(fn (array $g) => ($types[$g['type']] ?? $g['type']).': '.$g['name'], $r['grants'])),
        ], $f['holding']['rows']);

        return [
            [
                'title' => 'จำนวนพนักงาน เข้าใหม่ และลาออก ตามช่วง',
                'headings' => ['ตั้งแต่', 'ถึง', 'ต้นช่วง (คน)', 'เข้าใหม่ (คน)', 'ลาออก (คน)', 'ปลายช่วง (คน)', 'เปลี่ยนไป (คน)'],
                'rows' => $periods,
            ],
            [
                'title' => 'ตามแผนก (ณ '.DateDisplay::date($f['as_of']).')',
                'headings' => ['แผนก', 'ต้นช่วง', 'เข้าใหม่', 'ลาออก', 'ปลายช่วง', 'เปลี่ยนไป', 'สัดส่วนของพนักงานทั้งหมด (%)'],
                'rows' => $departments,
            ],
            [
                'title' => 'ผู้ลาออกที่ยังถือสิทธิ์ ('.$f['holding']['people'].' คน '.$f['holding']['grants'].' สิทธิ์ ไม่ขึ้นกับช่วงวันที่)',
                'headings' => ['รหัสพนักงาน', 'พนักงาน', 'แผนก', 'วันทำงานวันสุดท้าย', 'ออกมาแล้ว (วัน)', 'จำนวนสิทธิ์', 'สิทธิ์ที่ยังถือ'],
                'rows' => $holding,
            ],
        ];
    }

    /**
     * Every count of the page from one load of the department's people; the department table only
     * when the cards ask ($withDepartments), since the tiles of every rows page do not need it.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    private function facts(array $filters, bool $withDepartments = false): array
    {
        [$from, $to] = $this->dayRange($filters);
        $to = $to->copy()->startOfDay();
        $today = today();
        // The headcount day: the range end, or today while the end is still ahead.
        $asOf = $to->gt($today) ? ($from->gt($today) ? $from->copy() : $today->copy()) : $to->copy();
        $departmentId = ($filters['department_id'] ?? null) ? (int) $filters['department_id'] : null;

        $people = Employee::query()
            ->select(['id', 'code', 'first_name', 'last_name', 'first_name_th', 'last_name_th', 'department_id', 'section_id', 'joined_at', 'status', 'last_day'])
            ->when($departmentId, fn (Builder $q, int $id) => $q->where('department_id', $id))
            ->orderBy('code')
            ->get();

        $joiners = $people->filter(fn (Employee $e) => $e->joined_at?->between($from, $to));
        $leavers = $people->filter(fn (Employee $e) => $this->leftIn($e, $from, $to));
        $start = $people->filter(fn (Employee $e) => $this->workingBefore($e, $from))->count();
        $end = $people->filter(fn (Employee $e) => $this->working($e, $asOf))->count();
        $average = ($start + $end) / 2;
        $chart = $this->chart($joiners, $leavers, $people, $from, $to, $today);

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'as_of' => $asOf->toDateString(),
            'headcount' => ['start' => $start, 'end' => $end],
            'joiners' => [
                'started' => $joiners->filter(fn (Employee $e) => $e->joined_at->lte($asOf))->count(),
                'upcoming' => $joiners->filter(fn (Employee $e) => $e->joined_at->gt($asOf))->count(),
            ],
            'leavers' => [
                'count' => $leavers->count(),
                'rate' => $average > 0 ? round($leavers->count() / $average * 100, 1) : null,
                'prev_rate' => $this->previousRate($people, $from, $to),
                'still_working' => $leavers->filter(fn (Employee $e) => $this->lastDay($e)->gte($asOf))->count(),
                ...$this->leaversByBucket($leavers, $from, $to),
            ],
            'prep' => $this->prep($joiners, $today),
            'holding' => $this->holding($departmentId),
            'bucket' => $chart['bucket'],
            'points' => $chart['points'],
            ...($withDepartments ? $this->departments($people, $departmentId, $from, $to, $asOf) : []),
        ];
    }

    /**
     * Turnover of the period just before, as long as this one: null when nobody worked then.
     *
     * @param  Collection<int, Employee>  $people
     */
    private function previousRate(Collection $people, Carbon $from, Carbon $to): ?float
    {
        $days = (int) $from->diffInDays($to) + 1;
        $prevTo = $from->copy()->subDay();
        $prevFrom = $prevTo->copy()->subDays($days - 1);
        $start = $people->filter(fn (Employee $e) => $this->workingBefore($e, $prevFrom))->count();
        $end = $people->filter(fn (Employee $e) => $this->working($e, $prevTo))->count();
        $average = ($start + $end) / 2;
        $left = $people->filter(fn (Employee $e) => $this->leftIn($e, $prevFrom, $prevTo))->count();

        return $average > 0 ? round($left / $average * 100, 1) : null;
    }

    /**
     * The turnover against the period before, in points: rising is bad.
     *
     * @return array{direction: string, label_key: string, values: array<string, float>, up_is_good: bool, decimals: int}
     */
    private function rateTrend(?float $rate, ?float $before): array
    {
        $delta = $rate === null || $before === null ? null : round($rate - $before, 1);

        return [
            'direction' => match (true) {
                $delta === null, abs($delta) < 0.05 => 'even',
                $delta > 0 => 'up',
                default => 'down',
            },
            'label_key' => $delta === null ? 'rep_req_trend_no_base' : 'rep_req_trend_prev',
            'values' => $delta === null ? [] : ['delta' => abs($delta)],
            'up_is_good' => false,
            'decimals' => 1,
        ];
    }

    /** Working on day X: started by X, and lastDay() not before X. */
    private function working(Employee $e, Carbon $day): bool
    {
        return $e->joined_at !== null && $e->joined_at->lte($day) && ! $this->goneBy($e, $day);
    }

    /** Working the day before X (the range's start headcount). */
    private function workingBefore(Employee $e, Carbon $day): bool
    {
        return $e->joined_at !== null && $e->joined_at->lt($day) && ! $this->goneBy($e, $day);
    }

    /**
     * working() / workingBefore() counted over everyone at once, each person's dates read once as
     * 'Y-m-d' strings, so the chart can count every point without a date object per person.
     *
     * @param  Collection<int, Employee>  $people
     * @return Closure(string, bool=): int
     */
    private function headcounter(Collection $people): Closure
    {
        $spans = $people->map(fn (Employee $e) => [
            $e->joined_at?->toDateString(),
            $this->lastDay($e)?->toDateString(),
        ])->all();

        return function (string $day, bool $before = false) use ($spans): int {
            $count = 0;
            foreach ($spans as [$joined, $last]) {
                if ($joined === null || ($before ? $joined >= $day : $joined > $day)) {
                    continue;
                }
                if ($last !== null && $last < $day) {
                    continue;
                }
                $count++;
            }

            return $count;
        };
    }

    /**
     * The last working day every count uses: none recorded = yesterday (gone today, like Employee::hasLeft()),
     * never before the start day; null while not resigned or without a start day (never counted as working).
     */
    private function lastDay(Employee $e): ?Carbon
    {
        if ($e->status !== EmployeeStatus::Resigned || $e->joined_at === null) {
            return null;
        }
        $last = $e->last_day ?? today()->subDay();

        return $last->lt($e->joined_at) ? $e->joined_at : $last;
    }

    private function goneBy(Employee $e, Carbon $day): bool
    {
        return $this->lastDay($e)?->lt($day) ?? false;
    }

    private function leftIn(Employee $e, Carbon $from, Carbon $to): bool
    {
        return $this->lastDay($e)?->between($from, $to) ?? false;
    }

    /** leftIn() in SQL, for the list's leaver rows. */
    private function whereLeftIn(Builder $query, Carbon $from, Carbon $to): Builder
    {
        $yesterday = today()->subDay();

        return $query->where('status', EmployeeStatus::Resigned->value)->whereNotNull('joined_at')->where(fn (Builder $w) => $w
            ->where(fn (Builder $q) => $q->whereColumn('last_day', '>=', 'joined_at')->whereBetween('last_day', [$from, $to]))
            ->orWhere(fn (Builder $q) => $q->whereColumn('last_day', '<', 'joined_at')->whereBetween('joined_at', [$from, $to]))
            ->orWhere(fn (Builder $q) => $q->whereNull('last_day')->where('joined_at', '>', $yesterday)->whereBetween('joined_at', [$from, $to]))
            ->when($yesterday->between($from, $to), fn (Builder $any) => $any
                ->orWhere(fn (Builder $q) => $q->whereNull('last_day')->where('joined_at', '<=', $yesterday))));
    }

    /**
     * Months of the range; quarters past 24 months, years past 72. Each bucket's first month and the month after its last.
     *
     * @return array{0: string, 1: list<array{first: Carbon, next: Carbon}>}
     */
    private function buckets(Carbon $from, Carbon $until): array
    {
        $months = [];
        for ($m = $from->copy()->startOfMonth(); $m->lte($until); $m->addMonth()) {
            $months[] = $m->copy();
        }
        $span = count($months) <= 24 ? 1 : (count($months) <= 72 ? 3 : 12);
        $buckets = [];
        foreach ($months as $m) {
            if ($span === 1 || ($m->month - 1) % $span === 0 || $buckets === []) {
                $buckets[] = ['first' => $m, 'next' => null];
            }
            $buckets[array_key_last($buckets)]['next'] = $m->copy()->addMonth();
        }

        return [match ($span) {
            1 => 'month',
            3 => 'quarter',
            default => 'year',
        }, $buckets];
    }

    /**
     * The headcount line: one point per bucket at its end (today for the current one), with who
     * joined and who left in it. A leaver counts on the day after the last day, where the line drops.
     *
     * @param  Collection<int, Employee>  $joiners
     * @param  Collection<int, Employee>  $leavers
     * @param  Collection<int, Employee>  $people
     * @return array{bucket: string, points: list<array<string, mixed>>}
     */
    private function chart(Collection $joiners, Collection $leavers, Collection $people, Carbon $from, Carbon $to, Carbon $today): array
    {
        $clip = $to->gt($today);
        $last = $clip ? $today : $to;
        if ($from->gt($last)) {
            return ['bucket' => 'month', 'points' => []];
        }
        [$bucket, $buckets] = $this->buckets($from, $last);
        // Day index from the range start; a leaver's event is the day after the last day.
        $index = fn (Carbon $day) => (int) $from->diffInDays($day, false);
        $lastIndex = $index($last);
        $events = collect([
            ...$joiners->map(fn (Employee $e) => ['kind' => 'joined', 'e' => $e, 'date' => $e->joined_at, 'at' => $index($e->joined_at)]),
            ...$leavers->map(fn (Employee $e) => ['kind' => 'left', 'e' => $e, 'date' => $e->last_day ?? $this->lastDay($e), 'at' => $index($this->lastDay($e)) + 1]),
        ])
            // A leaver still counted on the chart's last day drops after it, so they are left off.
            ->filter(fn (array $v) => $v['at'] <= $lastIndex)
            ->sortBy([['at', 'asc'], ['kind', 'asc'], [fn (array $a, array $b) => strcmp($a['e']->code, $b['e']->code)]])
            ->values();

        $headcount = $this->headcounter($people);
        $points = [];
        foreach ($buckets as $k => $b) {
            $firstIndex = max(0, $index($b['first']));
            $endIndex = min($lastIndex, $index($b['next']) - 1);
            $endDay = $from->copy()->addDays($endIndex);
            $baseDay = $firstIndex > 0 ? $from->copy()->addDays($firstIndex - 1) : $from;
            $in = $events->filter(fn (array $v) => $v['at'] >= $firstIndex && $v['at'] <= $endIndex);
            $points[] = [
                'start' => $b['first']->toDateString(),
                'end' => $endDay->toDateString(),
                'headcount' => $headcount($endDay->toDateString()),
                'base' => $firstIndex > 0 ? $headcount($baseDay->toDateString()) : $headcount($from->toDateString(), true),
                'joined' => $in->where('kind', 'joined')->count(),
                'left' => $in->where('kind', 'left')->count(),
                'current' => $clip && $k === array_key_last($buckets),
                'events' => $in->map(fn (array $v) => [
                    'kind' => $v['kind'],
                    'id' => (int) $v['e']->id,
                    'code' => (string) $v['e']->code,
                    'name' => $v['e']->name,
                    'name_th' => $v['e']->name_th,
                    'date' => $v['date']->toDateString(),
                    'before_start' => $v['kind'] === 'left' && $v['e']->last_day !== null && $v['e']->last_day->lt($v['e']->joined_at),
                ])->values()->all(),
            ];
        }

        return ['bucket' => $bucket, 'points' => $points];
    }

    /**
     * Leavers by the month (or chart bucket) of their last day, over the whole range: the tile's line.
     *
     * @param  Collection<int, Employee>  $leavers
     * @return array{per_bucket: list<int>, bucket_months: list<string>}
     */
    private function leaversByBucket(Collection $leavers, Carbon $from, Carbon $to): array
    {
        [, $buckets] = $this->buckets($from, $to);

        return [
            'per_bucket' => array_map(fn (array $b) => $leavers->filter(fn (Employee $e) => $this->lastDay($e)->gte($b['first']) && $this->lastDay($e)->lt($b['next']))->count(), $buckets),
            'bucket_months' => array_map(fn (array $b) => $b['first']->format('Y-m'), $buckets),
        ];
    }

    /**
     * Joiners of the list still being prepared: requests done against all of theirs, and how soon they start.
     *
     * @param  Collection<int, Employee>  $joiners
     * @return array{people: int, done: int, total: int, urgent: bool, started: int, next_in_days: ?int}
     */
    private function prep(Collection $joiners, Carbon $today): array
    {
        $openStatuses = self::openRequestStatuses();
        $requests = ServiceRequest::query()
            ->where('origin', 'onboarding')
            ->where('status', '!=', RequestStatus::Cancelled->value)
            ->whereIn('employee_id', $joiners->pluck('id'))
            ->selectRaw('employee_id, COUNT(*) as total, SUM(CASE WHEN status IN ('.implode(', ', array_fill(0, count($openStatuses), '?')).') THEN 1 ELSE 0 END) as open', $openStatuses)
            ->groupBy('employee_id')
            ->get()
            ->keyBy('employee_id');
        $preparing = $joiners->filter(fn (Employee $e) => (int) ($requests->get($e->id)?->getAttribute('open') ?? 0) > 0);
        $days = $preparing->map(fn (Employee $e) => (int) $today->diffInDays($e->joined_at, false));
        $ahead = $days->filter(fn (int $d) => $d > 0);
        $total = $preparing->sum(fn (Employee $e) => (int) $requests->get($e->id)->getAttribute('total'));
        $open = $preparing->sum(fn (Employee $e) => (int) $requests->get($e->id)->getAttribute('open'));

        return [
            'people' => $preparing->count(),
            'done' => $total - $open,
            'total' => $total,
            'urgent' => $days->contains(fn (int $d) => $d <= self::URGENT_DAYS),
            'started' => $days->filter(fn (int $d) => $d <= 0)->count(),
            'next_in_days' => $ahead->isEmpty() ? null : $ahead->min(),
        ];
    }

    /**
     * People who have left (Employee::hasLeft) and still hold access, as of today whatever the range:
     * the open-items report's access group, same people in the same order.
     *
     * @return array<string, mixed>
     */
    private function holding(?int $departmentId): array
    {
        $access = OpenItems::access($departmentId);
        $rows = array_map(fn (array $p) => [
            'employee' => ['id' => $p['id'], 'code' => $p['code'], 'name' => $p['name'], 'name_th' => $p['name_th']],
            'department' => $p['department'],
            'last_day' => $p['last_day'],
            'days_out' => $p['days_out'],
            'grants' => $p['grants'],
        ], $access['rows']);
        $types = array_count_values(array_merge(...array_map(fn (array $r) => array_column($r['grants'], 'type'), $rows)));

        return [
            'people' => $access['people'],
            'grants' => $access['grants'],
            'by_type' => collect(AccessFacts::TYPES)->mapWithKeys(fn (string $t) => [$t => $types[$t] ?? 0])->all(),
            'rows' => $rows,
        ];
    }

    /**
     * Headcount by department and its sections; departments nobody worked in at either end set apart.
     *
     * @param  Collection<int, Employee>  $people
     * @return array{departments: list<array<string, mixed>>, empty_departments: list<array{id: int, name: string, name_th: ?string}>, total: array{start: int, joined: int, left: int, end: int}}
     */
    private function departments(Collection $people, ?int $departmentId, Carbon $from, Carbon $to, Carbon $asOf): array
    {
        $stats = fn (Collection $list) => [
            'start' => $list->filter(fn (Employee $e) => $this->workingBefore($e, $from))->count(),
            'joined' => $list->filter(fn (Employee $e) => $e->joined_at?->between($from, $asOf) ?? false)->count(),
            // Gone by the end day only, like joined: start + joined − left = end.
            'left' => $list->filter(fn (Employee $e) => $this->leftIn($e, $from, $to) && $this->lastDay($e)->lt($asOf))->count(),
            'end' => $list->filter(fn (Employee $e) => $this->working($e, $asOf))->count(),
        ];
        $isEmpty = fn (array $s) => $s['start'] + $s['joined'] + $s['left'] + $s['end'] === 0;
        $label = fn (?Model $m) => ['id' => $m ? (int) $m->getKey() : null, 'name' => $m?->getAttribute('name'), 'name_th' => $m?->getAttribute('name_th')];
        // Most people at the end first, then by name; the unnamed row last.
        $rank = fn (array $r) => [$r['id'] === null ? 1 : 0, -$r['end'], ($r['name_th'] ?? null) ?: ($r['name'] ?? '')];
        $byName = fn (array $a, array $b) => $rank($a) <=> $rank($b);

        $departments = Department::query()->with('sections:id,department_id,name,name_th')
            ->when($departmentId, fn (Builder $q, int $id) => $q->whereKey($id))
            ->get(['id', 'name', 'name_th']);
        $sectionNames = Section::query()->whereIn('id', $people->pluck('section_id')->filter()->unique())->get(['id', 'name', 'name_th'])->keyBy('id');
        $byDepartment = $people->groupBy(fn (Employee $e) => (string) ($e->department_id ?? ''));

        $rows = $departments->map(fn (Department $d) => [$d, $byDepartment->get((string) $d->id, collect())]);
        if (! $departmentId && $byDepartment->has('')) {
            $rows->push([null, $byDepartment->get('')]);
        }

        $shown = [];
        $apart = [];
        foreach ($rows as [$department, $staff]) {
            $row = [...$label($department), ...$stats($staff)];
            if ($isEmpty($row)) {
                if ($department) {
                    $apart[] = $label($department);
                }

                continue;
            }
            $sections = $staff->groupBy(fn (Employee $e) => (string) ($e->section_id ?? ''));
            $known = $department ? $department->sections->keyBy(fn (Section $s) => (string) $s->id) : collect();
            $keys = $known->keys()->merge($sections->keys())->unique();
            $lines = $keys->map(fn (string $id) => [
                ...$label($id === '' ? null : ($known->get($id) ?? $sectionNames->get((int) $id))),
                ...$stats($sections->get($id, collect())),
            ]);
            $row['sections'] = $lines->reject($isEmpty)->sort($byName)->values()->all();
            $row['hidden_sections'] = $lines->filter($isEmpty)->count();
            $shown[] = $row;
        }
        usort($shown, $byName);

        return ['departments' => $shown, 'empty_departments' => $apart, 'total' => $stats($people)];
    }

    /**
     * Onboarding requests still open for a joiner: done = completed, cancelled is left out entirely.
     *
     * @return list<string>
     */
    private static function openRequestStatuses(): array
    {
        return [RequestStatus::Pending->value, RequestStatus::Approved->value, RequestStatus::Rejected->value];
    }

    /** Joiners only: preparing / ready / none from their onboarding requests. */
    private function prepStatus(Employee $employee): ?string
    {
        if ($employee->getAttribute('movement_kind') !== 'joined') {
            return null;
        }
        if ((int) $employee->getAttribute('onboarding_total') === 0) {
            return 'none';
        }

        return (int) $employee->getAttribute('onboarding_open') > 0 ? 'preparing' : 'ready';
    }

    /** "done/total" for joiners with onboarding requests, where done = completed. */
    private function onboardingProgress(Employee $employee): ?string
    {
        $total = $this->onboardingCount($employee, 'total');

        return $total === null ? null : $this->onboardingCount($employee, 'done')."/{$total}";
    }

    /** A joiner's onboarding requests: 'done' or 'total'; null when not a joiner or none were filed. */
    private function onboardingCount(Employee $employee, string $which): ?int
    {
        $total = (int) $employee->getAttribute('onboarding_total');
        if ($employee->getAttribute('movement_kind') !== 'joined' || $total === 0) {
            return null;
        }

        return $which === 'total' ? $total : $total - (int) $employee->getAttribute('onboarding_open');
    }
}
