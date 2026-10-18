<?php

namespace App\Services\Report\Contract;

use App\Enums\Asset\AssetSource;
use App\Enums\Asset\AssetStatus;
use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Contract\ContractAlertLog;
use App\Models\Contract\ContractAttachment;
use App\Models\User;
use App\Services\Report\Tabular\CellDate;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\DateDisplay;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "ต่ออายุและสิ้นสุดสัญญา" (Report Center → Contracts): open contracts ending inside the window or already
 * past their end, with their reminders and what to do; breakdown() feeds the tiles, months, bands and closed list.
 */
class ContractRenewalsReport extends TabularReport
{
    private const ALERT_STATE_TH = ['off' => 'ไม่ได้เปิด', 'waiting' => 'ยังไม่ถึงรอบ', 'sent' => 'ส่งแล้ว', 'missed' => 'ยังไม่ได้ส่ง'];

    use ContractLabels;

    private const WINDOWS = [30, 60, 90, 180, 365];

    private const DEFAULT_WINDOW = 90;

    /** Ending within this many days is the amber tile. */
    private const SOON_DAYS = 30;

    private const CLOSED_RANGES = ['year' => 'rep_cren_closed_year', '12m' => 'rep_cren_closed_12m', 'all' => 'rep_cren_closed_all'];

    /** Days left in bands, [from, to] inclusive (null = open-ended); overdue is 0 or less. */
    private const BANDS = [
        'overdue' => [null, 0], 'd30' => [1, 30], 'd90' => [31, 90], 'd180' => [91, 180], 'd365' => [181, 365], 'later' => [366, null],
    ];

    private const BAND_TH = [
        'overdue' => 'เกินกำหนด', 'd30' => 'ภายใน 30 วัน', 'd90' => '31-90 วัน', 'd180' => '91-180 วัน',
        'd365' => '181-365 วัน', 'later' => 'เกิน 1 ปี',
    ];

    private const CLOSED_TH = ['year' => 'ปีนี้', '12m' => '12 เดือนที่ผ่านมา', 'all' => 'ทั้งหมด'];

    /** @var array<int, array<string, mixed>> per-contract figures for the rows about to be shown or exported */
    private array $rowFigures = [];

    /** @var array<string, Collection<int, array<string, mixed>>> open and closed figures per filter set, so tiles, cards and the file share one read */
    private array $memo = [];

    public function key(): string
    {
        return 'contracts.renewals';
    }

    public function title(): string
    {
        return 'ต่ออายุและสิ้นสุดสัญญา';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('within', Options::dayWindows(self::WINDOWS), self::DEFAULT_WINDOW)->labelKey('rep_cren_fl_within'),
            ReportFilter::select('type', Options::fromLabels(self::TYPE_KEYS)),
            ReportFilter::select('vendor_id', Options::vendors()),
            ReportFilter::select('closed', Options::fromLabels(self::CLOSED_RANGES), 'year')->labelKey('rep_cren_fl_closed')->viewOnly(),
        ];
    }

    /** @param array<string, mixed> $filters */
    private static function window(array $filters): int
    {
        return (int) ($filters['within'] ?? self::DEFAULT_WINDOW);
    }

    /**
     * Every contract the type and vendor filters keep, open or closed.
     *
     * @param  array<string, mixed>  $filters
     */
    private function scoped(array $filters): Builder
    {
        return Contract::query()
            ->when($filters['type'] ?? null, fn (Builder $q, string $type) => $q->where('contracts.type', $type))
            ->when($filters['vendor_id'] ?? null, fn (Builder $q, $id) => $q->where('contracts.vendor_id', (int) $id));
    }

    /** @param array<string, mixed> $filters */
    private function open(array $filters): Builder
    {
        return $this->scoped($filters)->whereNull('contracts.cancelled_at')->whereNull('contracts.expired_at');
    }

    public function query(User $viewer, array $filters): Builder
    {
        return $this->open($filters)
            ->with('vendor:id,name,name_th')
            ->whereDate('end_date', '<=', today()->addDays(self::window($filters)))
            ->orderBy('end_date')
            ->orderBy('code')
            ->orderBy('id');
    }

    /** @return array<string, string> */
    protected function meanings(): array
    {
        return [
            'days_left' => 'จำนวนวันจากวันที่ส่งออกถึงวันสิ้นสุด ติดลบ = เลยวันสิ้นสุดมาแล้วแต่ยังไม่ได้กดสิ้นสุดหรือยกเลิกสัญญา',
            'yearly' => 'มูลค่าต่องวดคูณจำนวนรอบบิลใน 1 ปี: รายเดือน คูณ 12, รายไตรมาส คูณ 4, รายปี คูณ 1',
            'value_per_period' => 'จำนวนเงินที่เรียกเก็บต่อหนึ่งรอบบิลตามที่บันทึกในสัญญา',
            'alerts' => 'รอบแจ้งเตือนที่เปิดไว้ (จำนวนวันก่อนหมดสัญญา) ตามด้วยผล: ส่งแล้ว = รอบล่าสุดที่ระบบส่งอีเมลพร้อมวันที่ส่งครั้งล่าสุด (วันหมด = อีเมลแจ้งวันสิ้นสุด), ยังไม่ได้ส่ง = ถึงรอบแล้วแต่ไม่พบประวัติการส่ง, เริ่มเตือนอีก N วัน = ยังไม่ถึงรอบแรก, ไม่ได้เปิดแจ้งเตือน ค่าเดียวกันแยกเป็นคอลัมน์สถานะแจ้งเตือนและแจ้งเตือนล่าสุดเมื่อ',
            'todo' => 'สิ่งที่ต้องทำตามกฎของระบบ เลือกข้อแรกที่เข้าเงื่อนไขตามลำดับ: เกินกำหนด, ครบกำหนดวันนี้, มีเครื่องเช่าต้องคืน, มีเครื่องซื้อต้องตัดสินใจต่อ MA, อยู่ในช่วงแจ้งเตือนหรือไม่ได้เปิดแจ้งเตือนให้ติดต่อผู้ขาย, นอกนั้นยังไม่ถึงช่วงแจ้งเตือน จำนวนเครื่องนับเฉพาะทรัพย์สินที่ผูกกับสัญญาและยังไม่ตัดจำหน่าย ข้อเพิ่มเติมคั่นด้วยเครื่องหมาย ;',
        ];
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('code', 'เลขที่สัญญา', fn (Contract $c) => $c->code)->linkTo('/contracts', fn (Contract $c) => $c->id),
            ReportColumn::text('name', 'ชื่อสัญญา', fn (Contract $c) => $c->name),
            ReportColumn::localized('vendor', 'ผู้ขาย', fn (Contract $c) => $c->vendor ? ['name' => $c->vendor->name, 'name_th' => $c->vendor->name_th] : null),
            ReportColumn::enum('type', 'ประเภท', fn (Contract $c) => $c->type, self::TYPE_KEYS, self::TYPE_TH),
            ReportColumn::date('start_date', 'วันที่เริ่ม', fn (Contract $c) => $c->start_date)->hiddenByDefault(),
            ReportColumn::date('end_date', 'วันสิ้นสุด', fn (Contract $c) => $c->end_date)->labelKey('rep_cren_c_end'),
            ReportColumn::daysLeft('days_left', 'เหลือ (วัน)', fn (Contract $c) => $c->end_date),
            ReportColumn::money('yearly', 'ต่อปี', fn (Contract $c) => ContractBilling::yearlyCost($c))->labelKey('rep_cren_c_yearly'),
            ReportColumn::money('value_per_period', 'มูลค่าต่องวด', fn (Contract $c) => $c->value)->hiddenByDefault(),
            ReportColumn::enum('billing_cycle', 'รอบบิล', fn (Contract $c) => $c->billing_cycle, self::CYCLE_KEYS, self::CYCLE_TH)->hiddenByDefault(),
            ReportColumn::text('alerts', 'แจ้งเตือน', fn (Contract $c) => self::alertText($this->rowFigures[$c->id]['alert'] ?? null))->labelKey('rep_cren_c_alerts'),
            ReportColumn::text('todo', 'สิ่งที่ต้องทำ', fn (Contract $c) => self::todoText($this->rowFigures[$c->id] ?? null))->labelKey('rep_cren_c_todo'),
            ReportColumn::text('alert_state', 'สถานะแจ้งเตือน', fn (Contract $c) => self::ALERT_STATE_TH[$this->rowFigures[$c->id]['alert']['state'] ?? ''] ?? null)->sheetOnly()
                ->describe('การแจ้งเตือนวันหมดสัญญา: ไม่ได้เปิด, ยังไม่ถึงรอบ, ส่งแล้ว หรือถึงรอบแล้วแต่ยังไม่ได้ส่ง'),
            ReportColumn::date('alert_sent_at', 'แจ้งเตือนล่าสุดเมื่อ', fn (Contract $c) => ($at = $this->rowFigures[$c->id]['alert']['sent_at'] ?? null) ? CarbonImmutable::parse($at) : null)->sheetOnly()
                ->describe('วันที่ระบบส่งอีเมลแจ้งเตือนครั้งล่าสุด (ว่าง = ยังไม่เคยส่ง)'),
            ReportColumn::number('rented_assets', 'ทรัพย์สินเช่าในสัญญา', fn (Contract $c) => $this->rowFigures[$c->id]['todo']['rented'] ?? null)->sheetOnly()
                ->describe('จำนวนทรัพย์สินเช่าที่ผูกกับสัญญานี้และยังไม่ได้ตัดจำหน่าย ต้องคืนผู้ให้เช่าเมื่อสัญญาสิ้นสุด'),
            ReportColumn::number('rented_in_use', 'ทรัพย์สินเช่าที่พนักงานใช้อยู่', fn (Contract $c) => $this->rowFigures[$c->id]['todo']['held'] ?? null)->sheetOnly()
                ->describe('จำนวนทรัพย์สินเช่าของสัญญานี้ที่ยังอยู่กับพนักงาน ต้องเรียกคืนก่อนคืนผู้ให้เช่า'),
        ];
    }

    public function hydrateRows(Collection $rows, User $viewer, array $filters): void
    {
        $this->rowFigures = $this->figures($rows)->keyBy('id')->all();
    }

    /**
     * Each contract's figures: days left, yearly cost, file, reminders and the fixed to-do rule.
     *
     * @param  Collection<int, Contract>  $contracts
     * @return Collection<int, array<string, mixed>>
     */
    private function figures(Collection $contracts): Collection
    {
        $ids = $contracts->pluck('id')->all();
        if ($ids === []) {
            return collect();
        }

        $logs = ContractAlertLog::query()->whereIn('contract_id', $ids)->get(['contract_id', 'threshold', 'alerted_at'])->groupBy('contract_id');
        $withFile = array_flip(ContractAttachment::query()->whereIn('contract_id', $ids)->distinct()->pluck('contract_id')->all());
        $assets = Asset::query()
            ->whereIn('contract_id', $ids)
            ->where('status', '!=', AssetStatus::Writeoff->value)
            ->get(['id', 'contract_id', 'source', 'status'])
            ->groupBy('contract_id');

        return $contracts->map(function (Contract $c) use ($logs, $withFile, $assets) {
            $days = $c->daysRemaining();
            $linked = $assets->get($c->id, collect());
            $rented = $linked->filter(fn (Asset $a) => self::enumValue($a->source) === AssetSource::Rented->value);
            $bought = $linked->filter(fn (Asset $a) => self::enumValue($a->source) === AssetSource::Purchased->value);

            return [
                'id' => $c->id,
                'code' => (string) $c->code,
                'name' => (string) $c->name,
                'type' => self::enumValue($c->type),
                'vendor' => $c->vendor ? ['name' => $c->vendor->name, 'name_th' => $c->vendor->name_th] : null,
                'end_date' => $c->end_date->format('Y-m-d'),
                'days' => $days,
                'yearly' => round(ContractBilling::yearlyCost($c), 2),
                'in_reminder' => $c->isInReminder(),
                'has_file' => isset($withFile[$c->id]),
                'alert' => self::alert($c, $days, $logs->get($c->id, collect())),
                'todo' => [
                    'main' => self::todoMain($c, $days, $rented->count(), $bought->count()),
                    'rented' => $rented->count(),
                    'bought' => $bought->count(),
                    'held' => $rented->filter(fn (Asset $a) => self::enumValue($a->status) === AssetStatus::Deployed->value)->count(),
                ],
            ];
        })->values();
    }

    private static function enumValue(mixed $value): string
    {
        return $value instanceof \BackedEnum ? (string) $value->value : (string) $value;
    }

    /**
     * The reminder cell: thresholds switched on, what contract_alert_logs says was sent (0 = the "ended"
     * mail), and whether a threshold already passed has no log row (the daily sweep did not send it).
     *
     * @param  Collection<int, ContractAlertLog>  $logs
     * @return array{days: list<int>, sent: list<int>, sent_at: ?string, state: string, starts_in: ?int}
     */
    private static function alert(Contract $c, int $days, Collection $logs): array
    {
        $enabled = $c->enabledReminderDays();
        rsort($enabled);
        $logged = $logs->pluck('threshold')->map(fn ($t) => (int) $t)->unique()->values()->all();
        // The sweep logs every threshold one mail covers, so only the latest one reached is shown as sent.
        $sent = $logged === [] ? [] : [min($logged)];
        $sentAt = $logs->max('alerted_at');
        // Once overdue the sweep sends only the "ended" mail (0), whatever thresholds it skipped before
        $due = $days <= 0 ? [0] : array_values(array_filter($enabled, fn (int $t) => $days <= $t));
        $threshold = $enabled === [] ? null : max($enabled);

        $state = match (true) {
            $enabled === [] => 'off',
            array_diff($due, $logged) !== [] => 'missed',
            $logged !== [] => 'sent',
            default => 'waiting',
        };

        return [
            'days' => $enabled,
            'sent' => $sent,
            'sent_at' => $sentAt ? CarbonImmutable::parse($sentAt)->format('Y-m-d') : null,
            'state' => $state,
            'starts_in' => $state === 'waiting' && $threshold !== null ? max(0, $days - $threshold) : null,
        ];
    }

    /** The to-do's main rule, first match wins: overdue, rented to return, bought to decide on, in reminder, not yet. */
    private static function todoMain(Contract $c, int $days, int $rented, int $bought): string
    {
        return match (true) {
            $days < 0 => 'overdue',
            $days === 0 => 'today',
            $rented > 0 => 'return_rent',
            $bought > 0 => 'decide_ma',
            // No reminders switched on means no window to wait for
            $c->isInReminder() || $c->reminderThreshold() === null => 'contact',
            default => 'not_yet',
        };
    }

    /** @param array<string, mixed>|null $alert */
    private static function alertText(?array $alert): ?string
    {
        if ($alert === null) {
            return null;
        }
        if ($alert['state'] === 'off') {
            return 'ไม่ได้เปิดแจ้งเตือน';
        }
        $on = implode(', ', $alert['days']).' วัน';

        return match ($alert['state']) {
            'sent' => "{$on} ส่งแล้ว ".implode(', ', array_map(fn (int $t) => $t === 0 ? 'วันหมด' : "{$t} วัน", $alert['sent']))
                .($alert['sent_at'] ? ' ('.DateDisplay::date($alert['sent_at']).')' : ''),
            'missed' => "{$on} ยังไม่ได้ส่ง",
            default => "{$on} เริ่มเตือนอีก {$alert['starts_in']} วัน",
        };
    }

    /** @param array<string, mixed>|null $figures */
    private static function todoText(?array $figures): ?string
    {
        if ($figures === null) {
            return null;
        }
        $todo = $figures['todo'];
        $lines = [match ($todo['main']) {
            'overdue' => 'เกินกำหนด '.(-$figures['days']).' วัน ต่ออายุหรือกดสิ้นสุดสัญญา',
            'today' => 'ครบกำหนดวันนี้ ต่ออายุหรือกดสิ้นสุดสัญญา',
            'return_rent' => "คืนเครื่องเช่า {$todo['rented']} เครื่อง หรือต่อสัญญา",
            'decide_ma' => "ตัดสินใจต่อ MA เครื่อง {$todo['bought']} เครื่อง",
            'contact' => 'ติดต่อผู้ขายเรื่องต่ออายุ',
            default => 'ยังไม่ถึงช่วงแจ้งเตือน',
        }];
        if ($figures['days'] <= 0 && $todo['rented'] > 0) {
            $lines[] = "เครื่องเช่าที่ยังไม่คืน {$todo['rented']} เครื่อง";
        }
        if ($todo['held'] > 0) {
            $lines[] = "ผู้ใช้ถือเครื่องอยู่ {$todo['held']} เครื่อง ต้องเรียกคืนก่อน";
        }

        return implode('; ', $lines);
    }

    /**
     * Every open contract in scope with its figures.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array<string, mixed>>
     */
    private function openFigures(array $filters): Collection
    {
        return $this->memo['open'.md5(serialize($filters))] ??= $this->figures($this->open($filters)->with('vendor:id,name,name_th')->orderBy('end_date')->orderBy('code')->get());
    }

    /**
     * Closed contracts in scope (cancelled or ended by hand), newest closed first, with what closing saved.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array<string, mixed>>
     */
    private function closedRows(array $filters, string $range): Collection
    {
        return $this->memo["closed{$range}".md5(serialize($filters))] ??= $this->readClosedRows($filters, $range);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array<string, mixed>>
     */
    private function readClosedRows(array $filters, string $range): Collection
    {
        $today = CarbonImmutable::today();
        $from = match ($range) {
            'year' => $today->startOfYear(),
            '12m' => $today->subMonthsNoOverflow(12),
            default => null,
        };

        return $this->scoped($filters)
            ->where(fn (Builder $q) => $q->whereNotNull('contracts.cancelled_at')->orWhereNotNull('contracts.expired_at'))
            ->when($from, fn (Builder $q, CarbonImmutable $from) => $q->whereRaw('COALESCE(contracts.expired_at, contracts.cancelled_at) >= ?', [$from->toDateTimeString()]))
            ->with(['vendor:id,name,name_th', 'canceller:id,name'])
            ->get()
            ->map(function (Contract $c) {
                // Same precedence as Contract::status: ended by hand wins over cancelled.
                $kind = $c->expired_at !== null ? 'expired' : 'cancelled';
                $closed = CarbonImmutable::parse($kind === 'expired' ? $c->expired_at : $c->cancelled_at)->startOfDay();
                $end = CarbonImmutable::parse($c->end_date)->startOfDay();

                return [
                    'id' => $c->id,
                    'code' => (string) $c->code,
                    'name' => (string) $c->name,
                    'vendor' => $c->vendor ? ['name' => $c->vendor->name, 'name_th' => $c->vendor->name_th] : null,
                    'type' => self::enumValue($c->type),
                    'kind' => $kind,
                    'closed_at' => $closed->format('Y-m-d'),
                    'end_date' => $end->format('Y-m-d'),
                    'gap' => (int) $end->diffInDays($closed, false),
                    'unpaid' => $kind === 'cancelled' && $closed->lt($end) ? round(ContractBilling::remainingValue($c, $closed->addDay()), 2) : 0.0,
                    'reason' => $kind === 'cancelled' && filled($c->cancel_reason) ? (string) $c->cancel_reason : null,
                    'by' => $kind === 'cancelled' ? $c->canceller?->name : null,
                ];
            })
            ->filter(fn (array $row) => $from === null || $row['closed_at'] >= $from->format('Y-m-d'))
            ->sortBy([['closed_at', 'desc'], ['code', 'asc']])
            ->values();
    }

    public function summary(Builder $query, array $filters): array
    {
        $within = self::window($filters);
        $open = $this->openFigures($filters);
        $tiles = self::tiles($open, $within, $this->closedRows($filters, 'year'));

        return [
            ReportSummary::make('total', 'ในรายการ', $open->filter(fn (array $c) => $c['days'] <= $within)->count()),
            ReportSummary::make('within', $within === 365 ? 'หมดภายใน 1 ปี' : "หมดภายใน {$within} วัน", $tiles['within']['count']),
            ReportSummary::make('within_30', 'หมดภายใน 30 วัน', $tiles['soon']['count'], 'amber'),
            ReportSummary::make('overdue', 'เกินกำหนด ยังไม่ปิด', $tiles['overdue']['count'], 'red'),
            ReportSummary::make('no_file', 'ยังไม่แนบไฟล์สัญญา', $tiles['files']['missing']),
            ReportSummary::make('closed_year', 'ปิดไปในปีนี้', $tiles['closed_year']['count']),
        ];
    }

    /**
     * The five tiles' figures.
     *
     * @param  Collection<int, array<string, mixed>>  $open
     * @param  Collection<int, array<string, mixed>>  $closedThisYear
     * @return array<string, array<string, mixed>>
     */
    private static function tiles(Collection $open, int $within, Collection $closedThisYear): array
    {
        $inWindow = $open->filter(fn (array $c) => $c['days'] > 0 && $c['days'] <= $within);
        $soon = $open->filter(fn (array $c) => $c['days'] > 0 && $c['days'] <= self::SOON_DAYS)->sortBy([['days', 'asc'], ['code', 'asc']])->values();
        $overdue = $open->filter(fn (array $c) => $c['days'] <= 0)->sortBy([['days', 'asc'], ['code', 'asc']])->values();
        $pick = fn (?array $c, bool $past) => $c === null ? null : ['id' => $c['id'], 'code' => $c['code'], 'days' => $past ? -$c['days'] : $c['days']];

        return [
            'within' => ['count' => $inWindow->count(), 'yearly' => round((float) $inWindow->sum('yearly'), 2)],
            'soon' => ['count' => $soon->count(), 'nearest' => $pick($soon->first(), false)],
            'overdue' => ['count' => $overdue->count(), 'oldest' => $pick($overdue->first(), true)],
            'files' => ['missing' => $open->where('has_file', false)->count(), 'open' => $open->count()],
            'closed_year' => [
                'count' => $closedThisYear->count(),
                'cancelled' => $closedThisYear->where('kind', 'cancelled')->count(),
                'expired' => $closedThisYear->where('kind', 'expired')->count(),
            ],
        ];
    }

    /**
     * What the page draws (see the class note). Codes and numbers only — the page writes the words.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function breakdown(User $viewer, array $filters): array
    {
        $within = self::window($filters);
        $range = array_key_exists((string) ($filters['closed'] ?? ''), self::CLOSED_RANGES) ? (string) $filters['closed'] : 'year';
        $open = $this->openFigures($filters);
        $closed = $this->closedRows($filters, $range);
        // "12m" and "all" both reach back past 1 January, so this year's rows are a slice of them.
        $yearStart = CarbonImmutable::today()->startOfYear()->format('Y-m-d');
        $closedThisYear = $range === 'year' ? $closed : $closed->filter(fn (array $row) => $row['closed_at'] >= $yearStart)->values();

        return [
            'within' => $within,
            'tiles' => self::tiles($open, $within, $closedThisYear),
            'months' => self::months($open),
            'open_total' => $open->count(),
            'bands' => self::bands($open),
            'list' => $open->filter(fn (array $c) => $c['days'] <= $within)
                ->map(fn (array $c) => ['id' => $c['id'], 'in_reminder' => $c['in_reminder'], 'alert' => $c['alert'], 'todo' => $c['todo']])
                ->values()->all(),
            'closed' => [
                'range' => $range,
                'cancelled' => $closed->where('kind', 'cancelled')->count(),
                'expired' => $closed->where('kind', 'expired')->count(),
                'unpaid' => round((float) $closed->sum('unpaid'), 2),
                'rows' => $closed->all(),
            ],
        ];
    }

    /**
     * This month and the next 11: open contracts still running, by the month they end.
     *
     * @param  Collection<int, array<string, mixed>>  $open
     * @return list<array{month: string, items: list<array<string, mixed>>}>
     */
    private static function months(Collection $open): array
    {
        $byMonth = $open->filter(fn (array $c) => $c['days'] > 0)->groupBy(fn (array $c) => substr($c['end_date'], 0, 7));
        $months = [];
        for ($i = 0, $month = CarbonImmutable::today()->startOfMonth(); $i < 12; $i++, $month = $month->addMonth()) {
            $months[] = [
                'month' => $month->format('Y-m'),
                'items' => $byMonth->get($month->format('Y-m'), collect())
                    ->map(fn (array $c) => [
                        'id' => $c['id'], 'code' => $c['code'], 'name' => $c['name'], 'type' => $c['type'],
                        'amount' => 1, 'date' => $c['end_date'], 'yearly' => $c['yearly'],
                    ])
                    ->values()->all(),
            ];
        }

        return $months;
    }

    /**
     * Open contracts by days left, each band with its yearly cost and its split by type.
     *
     * @param  Collection<int, array<string, mixed>>  $open
     * @return list<array{key: string, total: int, yearly: float, types: array<string, int>}>
     */
    private static function bands(Collection $open): array
    {
        return array_map(function (string $key) use ($open) {
            [$from, $to] = self::BANDS[$key];
            $group = $open->filter(fn (array $c) => ($from === null || $c['days'] >= $from) && ($to === null || $c['days'] <= $to));
            $counts = $group->countBy('type');

            return [
                'key' => $key,
                'total' => $group->count(),
                'yearly' => round((float) $group->sum('yearly'), 2),
                'types' => array_map(fn (string $type) => (int) ($counts[$type] ?? 0), array_combine(array_keys(self::TYPE_KEYS), array_keys(self::TYPE_KEYS))),
            ];
        }, array_keys(self::BANDS));
    }

    /**
     * The breakdown as sheets: by month, by time left, and the closed contracts in the card's range.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $breakdown = $this->breakdown($viewer, $filters);
        $typeHeadings = array_values(self::TYPE_TH);

        return [
            [
                'title' => 'สัญญาที่จะหมดในแต่ละเดือน',
                'headings' => ['เดือน', 'จำนวนสัญญา', 'ต่อปี'],
                'rows' => array_map(fn (array $m) => [
                    CellDate::month($m['month']), count($m['items']), round(array_sum(array_column($m['items'], 'yearly')), 2),
                ], $breakdown['months']),
            ],
            [
                'title' => 'สัญญาตามเวลาที่เหลือ',
                'headings' => ['ช่วง', 'จำนวนสัญญา', 'ต่อปี', ...$typeHeadings],
                'rows' => array_map(fn (array $b) => [self::BAND_TH[$b['key']], $b['total'], $b['yearly'], ...array_values($b['types'])], $breakdown['bands']),
            ],
            [
                'title' => 'สัญญาที่ปิดไปแล้ว ('.self::CLOSED_TH[$breakdown['closed']['range']].')',
                'headings' => ['เลขที่สัญญา', 'ชื่อสัญญา', 'ผู้ขาย', 'ปิดแบบ', 'ปิดเมื่อ', 'วันสิ้นสุด', 'เทียบวันสิ้นสุด (วัน)', 'งวดที่ไม่ต้องจ่าย', 'เหตุผล', 'ผู้ยกเลิก'],
                'rows' => array_map(fn (array $r) => [
                    $r['code'], $r['name'], $r['vendor'] ? ($r['vendor']['name_th'] ?: $r['vendor']['name']) : null,
                    $r['kind'] === 'cancelled' ? 'ยกเลิกแล้ว' : 'สิ้นสุดแล้ว',
                    CellDate::date($r['closed_at']), CellDate::date($r['end_date']), $r['gap'], $r['unpaid'], $r['reason'], $r['by'],
                ], $breakdown['closed']['rows']),
            ],
        ];
    }
}
