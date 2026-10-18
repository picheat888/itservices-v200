<?php

namespace App\Services\Report\Stock;

use App\Enums\Stock\StockCountAdjustMode;
use App\Enums\Stock\StockCountStatus;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockCountLine;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Report\Tabular\CellDate;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\SearchTerms;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "รับเข้าและเบิกออก" (Report Center → Stock): every stock document in the date range (last 12 months by default),
 * oldest first. breakdown() (StockMovementsBreakdownController) feeds the tiles, monthly flow, pending requests,
 * top requesters and count variance above the rows.
 */
class StockMovementReport extends TabularReport
{
    use StockColumns;

    private const MONTHS = 12;

    private const REQUEST_ROWS = 500;

    private const RANK_BY_KEYS = ['value' => 'rep_smv_sort_value', 'qty' => 'rep_smv_sort_qty', 'times' => 'rep_smv_sort_times'];

    private const NO_DEPARTMENT_TH = 'ไม่มีแผนก';

    /** @var array<string, array<string, mixed>> breakdown() per filter set */
    private array $breakdowns = [];

    /** Lot costs of the rows about to be shown, set by hydrateRows(). */
    private ?StockCostBook $rowBook = null;

    public function key(): string
    {
        return 'stock.movements';
    }

    public function title(): string
    {
        return 'รับเข้าและเบิกออก';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfMonth()->subMonthsNoOverflow(self::MONTHS - 1)->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('type', Options::fromLabels(self::MOVEMENT_TYPE_KEYS)),
            ReportFilter::select('warehouse_id', Options::warehouses()),
            ReportFilter::select('category_id', Options::categories()),
            ReportFilter::search()->placeholderKey('rep_ph_stock_movements'),
            // How each rank card sorts (value, pieces or times); the page keeps it in the URL.
            ReportFilter::select('people_by', Options::fromLabels(self::RANK_BY_KEYS), 'value')->labelKey('rep_smv_sort_by')->viewOnly(),
            ReportFilter::select('dept_by', Options::fromLabels(self::RANK_BY_KEYS), 'value')->labelKey('rep_smv_sort_by')->viewOnly(),
        ];
    }

    /**
     * Movements between two moments, narrowed by warehouse (left from or arrived at it) and item category.
     *
     * @param  array<string, mixed>  $filters
     */
    private function scoped(array $filters, CarbonInterface $from, CarbonInterface $to): Builder
    {
        return StockMovement::query()
            ->whereBetween('moved_at', [$from, $to])
            ->when($this->warehouseId($filters), fn (Builder $q, int $id) => self::touchingWarehouse($q, $id))
            ->when($filters['category_id'] ?? null, fn (Builder $q, $id) => $q->whereHas('item', fn (Builder $i) => $i->where('category_id', (int) $id)));
    }

    /** @param  array<string, mixed>  $filters */
    private function warehouseId(array $filters): ?int
    {
        $id = (int) ($filters['warehouse_id'] ?? 0);

        return $id > 0 ? $id : null;
    }

    /** Movements that left from or arrived at the warehouse, by id so a renamed warehouse keeps its history. */
    private static function touchingWarehouse(Builder $query, int $id): Builder
    {
        return $query->where(fn (Builder $w) => $w->where('stock_movements.from_warehouse_id', $id)->orWhere('stock_movements.to_warehouse_id', $id));
    }

    public function query(User $viewer, array $filters): Builder
    {
        [$from, $to] = $this->dayRange($filters);

        return $this->scoped($filters, $from, $to)
            ->with(['item' => fn ($q) => $q->select('id', 'sku', 'name', 'category_id', 'unit_id')->with(self::ITEM_RELATIONS)])
            ->when($filters['type'], fn (Builder $q, string $type) => $q->where('type', $type))
            ->when($filters['search'], fn (Builder $q, string $search) => SearchTerms::apply($q, $search, [
                'doc_no', 'reference',
                SearchTerms::related('item', ['sku', 'name']),
            ]))
            ->orderBy('moved_at')
            ->orderBy('id');
    }

    public function hydrateRows(Collection $rows, User $viewer, array $filters): void
    {
        $this->rowBook = StockCostBook::forItems($rows->pluck('stock_item_id'));
    }

    /** @return array<string, string> */
    protected function meanings(): array
    {
        return [
            'doc_no' => 'เลขที่เอกสารรูปแบบ คำนำหน้า-ปี-ลำดับ: RCV รับเข้า, ISS เบิกออก, RET คืนของ, TRF ย้ายคลัง โดยนับลำดับใหม่ทุกปี ว่าง = ปรับยอดจากการตรวจนับ (ใช้เลขที่รายการในระบบเป็นคีย์ของแถว)',
            'type' => 'รับเข้า, เบิกออก (จ่ายตามคำขอเบิกที่อนุมัติแล้ว), คืนของ, ย้ายคลัง (ยอดรวมไม่เปลี่ยน), ปรับเพิ่ม + และปรับลด − (ผลต่างจากการตรวจนับ)',
            'qty' => 'จำนวนหน่วยของรายการ เป็นค่าบวกเสมอ ทิศทางดูจากประเภท: รับเข้า คืนของ ปรับเพิ่ม = เพิ่มสต็อก, เบิกออก ปรับลด = ลดสต็อก, ย้ายคลัง = ยอดรวมไม่เปลี่ยน',
            'unit_cost' => 'ราคาต่อหน่วยที่กรอกตอนรับเข้า ว่าง = รายการประเภทอื่นหรือรับเข้าโดยไม่กรอกราคา',
            'line_value' => 'รับเข้าที่มีราคา = จำนวนคูณต้นทุน/หน่วย ประเภทอื่น = จำนวนคูณต้นทุนเฉลี่ยถ่วงน้ำหนักของทุก Lot ที่รับเข้าถึงสิ้นวันของรายการ (ยังไม่มี Lot ใช้ราคา Lot แรก ถ้าไม่มีเลยใช้ต้นทุนที่ตั้งไว้ของ SKU) ปัดทศนิยม 2 ตำแหน่ง',
            'from_label_th' => 'ต้นทาง: รับเข้า = ผู้ขายที่กรอก, เบิกออก ย้ายคลัง ปรับลด = ชื่อคลังที่ของออก (ไม่ระบุคลัง = ไม่ได้เลือกคลัง), คืนของและปรับเพิ่ม = ว่าง',
            'to_label_th' => 'ปลายทาง: รับเข้า คืนของ ย้ายคลัง ปรับเพิ่ม = ชื่อคลังที่ของเข้า (ไม่ระบุคลัง = ไม่ได้เลือกคลัง), เบิกออก = ชื่อผู้ขอเบิก, ปรับลด = ว่าง',
            'reference' => 'เลขอ้างอิง: เบิกออก = เลขที่คำขอเบิก, ปรับเพิ่มและปรับลด = เลขที่ใบตรวจนับ, รับเข้าและย้ายคลัง = เลขที่ผู้บันทึกกรอกเอง (ไม่บังคับ), คืนของ = ว่าง',
        ];
    }

    protected function hasRowId(): bool
    {
        return true;
    }

    // A movement's end as the sheet reads it: the "no warehouse" sentinel in Thai
    private static function warehouseLabel(?string $label): ?string
    {
        return $label === 'Unassigned' ? 'ไม่ระบุคลัง' : $label;
    }

    public function columns(): array
    {
        return [
            ReportColumn::date('moved_at', 'วันที่', fn (StockMovement $m) => $m->moved_at),
            ReportColumn::text('doc_no', 'เลขที่เอกสาร', fn (StockMovement $m) => $m->doc_no),
            ReportColumn::enum('type', 'ประเภท', fn (StockMovement $m) => $m->type, self::MOVEMENT_TYPE_KEYS, self::MOVEMENT_TYPE_TH),
            ...$this->itemColumns(fn (StockMovement $m) => $m->item),
            ReportColumn::number('qty', 'จำนวน', fn (StockMovement $m) => $m->qty),
            ReportColumn::money('unit_cost', 'ต้นทุน/หน่วย', fn (StockMovement $m) => $m->unit_cost),
            ReportColumn::money('line_value', 'มูลค่า', fn (StockMovement $m) => $this->lineValue($m)),
            ReportColumn::text('from_label', 'จาก', fn (StockMovement $m) => $m->from_label)->screenOnly(),
            ReportColumn::text('from_label_th', 'จาก', fn (StockMovement $m) => self::warehouseLabel($m->from_label))->sheetOnly(),
            ReportColumn::text('to_label', 'ไปยัง', fn (StockMovement $m) => $m->to_label)->screenOnly(),
            ReportColumn::text('to_label_th', 'ไปยัง', fn (StockMovement $m) => self::warehouseLabel($m->to_label))->sheetOnly(),
            ReportColumn::text('reference', 'อ้างอิง', fn (StockMovement $m) => $m->reference),
            ReportColumn::text('recorded_by', 'ผู้บันทึก', fn (StockMovement $m) => $m->recorded_by),
        ];
    }

    /** Receipts at their own cost; everything else at the item's average lot cost on its day. */
    private function lineValue(StockMovement $movement): float
    {
        $book = $this->rowBook ?? StockCostBook::forItems([$movement->stock_item_id]);
        $unitCost = $movement->unit_cost === null ? null : (float) $movement->unit_cost;

        return round(self::movementValue($book, (int) $movement->stock_item_id, $movement->type, (int) $movement->qty, $unitCost, $movement->moved_at), 2);
    }

    private static function movementValue(StockCostBook $book, int $itemId, string $type, int $qty, ?float $unitCost, CarbonInterface $at): float
    {
        return $type === 'receive' && $unitCost !== null ? $qty * $unitCost : $qty * $book->averageAt($itemId, $at);
    }

    /** The file headline repeats the page tiles (range, warehouse, category); the row count stays with the rows, which also follow type and search. */
    public function summary(Builder $query, array $filters): array
    {
        $tiles = $this->breakdown(null, $filters)['tiles'];

        return [
            ReportSummary::make('receive_qty', 'รับเข้า (ชิ้น)', $tiles['receive']['qty'], 'green'),
            ReportSummary::make('receive_value', 'มูลค่ารับเข้า', $tiles['receive']['value'], format: 'money'),
            ReportSummary::make('issue_qty', 'เบิกออก (ชิ้น)', $tiles['issue']['qty']),
            ReportSummary::make('issue_value', 'มูลค่าเบิกออก', $tiles['issue']['value'], format: 'money'),
            ReportSummary::make('return_qty', 'คืนของ (ชิ้น)', $tiles['return']['qty']),
            // Transfers move stock between warehouses without changing the total.
            ReportSummary::make('transfer_qty', 'ย้ายคลัง (ชิ้น)', $tiles['transfer']['qty']),
            ReportSummary::make('adjust_net', 'ปรับยอดสุทธิ (ชิ้น)', $tiles['adjust_up']['qty'] - $tiles['adjust_down']['qty']),
        ];
    }

    /**
     * What the page draws above the rows: range + warehouse + category, never the type. Codes, numbers and stored
     * names only.
     *
     * @param  array<string, mixed>  $filters
     * @return array{tiles: array<string, array{qty: int, value: float, times: int}>, months: list<array<string, mixed>>, requests: array<string, mixed>, people: list<array<string, mixed>>, departments: list<array<string, mixed>>, counts: list<array<string, mixed>>}
     */
    public function breakdown(?User $viewer, array $filters): array
    {
        return $this->breakdowns[md5(serialize($filters))] ??= $this->buildBreakdown($filters);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    private function buildBreakdown(array $filters): array
    {
        [$from, $to] = array_map(fn (CarbonInterface $d) => CarbonImmutable::instance($d), $this->dayRange($filters));
        $movements = $this->scoped($filters, $from, $to)
            ->toBase()->get(['stock_movements.stock_item_id', 'stock_movements.type', 'stock_movements.qty', 'stock_movements.unit_cost', 'stock_movements.moved_at'])
            ->map(fn (object $m) => [
                'item' => (int) $m->stock_item_id,
                'type' => (string) $m->type,
                'qty' => (int) $m->qty,
                'unit_cost' => $m->unit_cost === null ? null : (float) $m->unit_cost,
                'at' => CarbonImmutable::parse($m->moved_at),
            ]);
        $fulfilled = $this->fulfilledRequests($filters, $from, $to);
        $counts = $this->committedCounts($filters, $from, $to);

        $book = StockCostBook::forItems([
            ...$movements->pluck('item'),
            ...$fulfilled->pluck('stock_item_id'),
            ...$counts->flatMap(fn (StockCount $c) => $c->lines->pluck('stock_item_id')),
        ]);
        $movements = $movements->map(fn (array $m) => $m + ['value' => self::movementValue($book, $m['item'], $m['type'], $m['qty'], $m['unit_cost'], $m['at'])]);
        $requests = $fulfilled->map(fn (StockRequest $r) => [
            'request' => $r,
            'qty' => (int) $r->qty,
            'value' => $r->qty * $book->averageAt((int) $r->stock_item_id, $r->fulfilled_at),
        ]);

        return [
            'tiles' => self::tiles($movements),
            'months' => self::months($movements, $from, $to),
            'requests' => $this->waitingRequests($filters),
            'people' => self::people($requests),
            'departments' => self::departments($requests),
            'counts' => self::countRows($counts, $book),
        ];
    }

    /**
     * Pieces, value and documents per movement type.
     *
     * @param  Collection<int, array{item: int, type: string, qty: int, unit_cost: ?float, at: CarbonImmutable, value: float}>  $movements
     * @return array<string, array{qty: int, value: float, times: int}>
     */
    private static function tiles(Collection $movements): array
    {
        $tiles = [];
        foreach (array_keys(self::MOVEMENT_TYPE_KEYS) as $type) {
            $ofType = $movements->where('type', $type);
            $tiles[$type] = ['qty' => (int) $ofType->sum('qty'), 'value' => round((float) $ofType->sum('value'), 2), 'times' => $ofType->count()];
        }

        return $tiles;
    }

    /**
     * Every month of the range, oldest first, empty ones included.
     *
     * @param  Collection<int, array{item: int, type: string, qty: int, unit_cost: ?float, at: CarbonImmutable, value: float}>  $movements
     * @return list<array{month: string, receive: int, return: int, issue: int, transfer: int, receive_value: float, issue_value: float, adjust_net: int}>
     */
    private static function months(Collection $movements, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $byMonth = $movements->groupBy(fn (array $m) => $m['at']->format('Y-m'));
        $months = [];
        for ($month = $from->startOfMonth(); $month->lte($to); $month = $month->addMonthNoOverflow()) {
            $rows = $byMonth->get($month->format('Y-m'), collect());
            $qty = fn (string $type) => (int) $rows->where('type', $type)->sum('qty');
            $months[] = [
                'month' => $month->format('Y-m'),
                'receive' => $qty('receive'),
                'return' => $qty('return'),
                'issue' => $qty('issue'),
                'transfer' => $qty('transfer'),
                'receive_value' => round((float) $rows->where('type', 'receive')->sum('value'), 2),
                'issue_value' => round((float) $rows->where('type', 'issue')->sum('value'), 2),
                'adjust_net' => $qty('adjust_up') - $qty('adjust_down'),
            ];
        }

        return $months;
    }

    /**
     * Requests waiting today, whatever the range: counts per status and the oldest first.
     *
     * @param  array<string, mixed>  $filters
     * @return array{pending: int, approved: int, rows: list<array{reference: ?string, item_name: ?string, sku: ?string, qty: int, unit: ?string, requester: string, requester_th: ?string, status: string, created_at: ?string}>}
     */
    private function waitingRequests(array $filters): array
    {
        $waiting = StockRequest::query()
            ->whereIn('status', ['pending', 'approved'])
            ->when($filters['category_id'] ?? null, fn (Builder $q, $id) => $q->whereHas('item', fn (Builder $i) => $i->where('category_id', (int) $id)));
        $perStatus = (clone $waiting)->toBase()->selectRaw('status, COUNT(*) AS total')->groupBy('status')->pluck('total', 'status');

        $rows = (clone $waiting)
            ->with(['item:id,sku,name,unit_id', 'item.unit:id,name', 'user:id,name,employee_id', 'user.employee:id,first_name_th,last_name_th'])
            ->orderBy('created_at')->orderBy('id')
            ->limit(self::REQUEST_ROWS)
            ->get()
            ->map(fn (StockRequest $r) => [
                'reference' => $r->reference,
                'item_name' => $r->item?->name,
                'sku' => $r->item?->sku,
                'qty' => (int) $r->qty,
                'unit' => $r->item?->unit?->name,
                'requester' => (string) ($r->user?->name ?? $r->requester_name),
                'requester_th' => $r->user?->employee?->name_th,
                'status' => (string) $r->status,
                'created_at' => $r->created_at?->toIso8601String(),
                // An approved request waits to be handed out from its approval, a pending one from its filing.
                'waiting_since' => ($r->status === 'approved' && $r->approved_at !== null ? $r->approved_at : $r->created_at)?->toIso8601String(),
            ]);

        return ['pending' => (int) ($perStatus['pending'] ?? 0), 'approved' => (int) ($perStatus['approved'] ?? 0), 'rows' => $rows->all()];
    }

    /**
     * Requests handed out within the range, with the requester's department.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, StockRequest>
     */
    private function fulfilledRequests(array $filters, CarbonImmutable $from, CarbonImmutable $to): Collection
    {
        return StockRequest::query()
            ->whereBetween('fulfilled_at', [$from, $to])
            ->when($filters['category_id'] ?? null, fn (Builder $q, $id) => $q->whereHas('item', fn (Builder $i) => $i->where('category_id', (int) $id)))
            ->with(['user:id,name,employee_id', 'user.employee:id,department_id,first_name_th,last_name_th', 'user.employee.department:id,code,name,name_th'])
            ->get(['id', 'stock_item_id', 'user_id', 'requester_name', 'qty', 'fulfilled_at']);
    }

    /**
     * One row per requester; the page sorts by the chosen metric.
     *
     * @param  Collection<int, array{request: StockRequest, qty: int, value: float}>  $requests
     * @return list<array{user_id: ?int, name: string, name_th: ?string, department_id: ?int, department: ?string, department_th: ?string, qty: int, value: float, times: int}>
     */
    private static function people(Collection $requests): array
    {
        return $requests
            ->groupBy(fn (array $r) => self::personKey($r['request']))
            ->map(function (Collection $group) {
                $request = $group->first()['request'];
                $department = $request->user?->employee?->department;

                return [
                    'user_id' => $request->user_id,
                    'name' => (string) ($request->user?->name ?? $request->requester_name),
                    'name_th' => $request->user?->employee?->name_th,
                    'department_id' => $department?->id,
                    'department' => $department?->name,
                    'department_th' => $department?->name_th,
                    'qty' => (int) $group->sum('qty'),
                    'value' => round((float) $group->sum('value'), 2),
                    'times' => $group->count(),
                ];
            })
            ->values()
            ->all();
    }

    /**
     * One row per requester department, no department as its own row (department_id null).
     *
     * @param  Collection<int, array{request: StockRequest, qty: int, value: float}>  $requests
     * @return list<array{department_id: ?int, name: ?string, name_th: ?string, people: int, qty: int, value: float, times: int}>
     */
    private static function departments(Collection $requests): array
    {
        return $requests
            ->groupBy(fn (array $r) => (string) $r['request']->user?->employee?->department_id)
            ->map(function (Collection $group) {
                $department = $group->first()['request']->user?->employee?->department;

                return [
                    'department_id' => $department?->id,
                    'name' => $department?->name,
                    'name_th' => $department?->name_th,
                    'people' => $group->map(fn (array $r) => self::personKey($r['request']))->unique()->count(),
                    'qty' => (int) $group->sum('qty'),
                    'value' => round((float) $group->sum('value'), 2),
                    'times' => $group->count(),
                ];
            })
            ->values()
            ->all();
    }

    /** The account, or the stored name when the account is gone. */
    private static function personKey(StockRequest $request): string
    {
        return $request->user_id !== null ? 'u'.$request->user_id : 'n'.$request->requester_name;
    }

    /**
     * Committed counts in the range at the chosen warehouse, their lines narrowed to the category; a count with no
     * line in the category drops out.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, StockCount>
     */
    private function committedCounts(array $filters, CarbonImmutable $from, CarbonImmutable $to): Collection
    {
        $warehouseId = $this->warehouseId($filters);
        $category = $filters['category_id'] ?? null;
        // An all-warehouse count reaches a warehouse through the adjustments it booked there (reference + item).
        $bookedHere = $warehouseId === null ? collect() : self::touchingWarehouse(StockMovement::query(), $warehouseId)
            ->whereIn('type', ['adjust_up', 'adjust_down'])->whereNotNull('reference')
            ->toBase()->get(['reference', 'stock_item_id'])
            ->map(fn (object $m) => $m->reference.'|'.$m->stock_item_id)->flip();

        return StockCount::query()
            ->where('status', StockCountStatus::Committed->value)
            // A Manual count is report-only: it booked no adjustment.
            ->where(fn (Builder $q) => $q->whereNull('adjust_mode')->orWhere('adjust_mode', '!=', StockCountAdjustMode::Manual->value))
            ->whereBetween('committed_at', [$from, $to])
            ->when($warehouseId, fn (Builder $q, int $id) => $q->where(fn (Builder $w) => $w->where('warehouse_id', $id)
                ->orWhere(fn (Builder $all) => $all->whereNull('warehouse_id')->whereIn('reference', $bookedHere->keys()->map(fn (string $k) => strstr($k, '|', true))->unique()->values()))))
            ->with(['lines:id,stock_count_id,stock_item_id,system_qty,counted_qty', 'lines.item:id,category_id'])
            ->orderByDesc('committed_at')->orderByDesc('id')
            ->get(['id', 'reference', 'warehouse', 'warehouse_id', 'committed_at'])
            ->each(fn (StockCount $c) => $c->setRelation('lines', $c->lines->filter(
                fn (StockCountLine $l) => (! $category || (int) $l->item?->category_id === (int) $category)
                    && ($warehouseId === null || $c->warehouse_id !== null || $bookedHere->has($c->reference.'|'.$l->stock_item_id)),
            )->values()))
            ->filter(fn (StockCount $c) => ! $category || $c->lines->isNotEmpty())
            ->values();
    }

    /**
     * Lines that differ, pieces up and down, net value at the average lot cost on the commit day; newest first.
     *
     * @param  Collection<int, StockCount>  $counts
     * @return list<array{reference: string, warehouse: ?string, committed_at: ?string, lines: int, up: int, down: int, net_value: float}>
     */
    private static function countRows(Collection $counts, StockCostBook $book): array
    {
        return $counts->map(function (StockCount $count) use ($book) {
            $differing = $count->lines->filter(fn (StockCountLine $l) => (int) $l->variance() !== 0);

            return [
                'reference' => (string) $count->reference,
                'warehouse' => $count->warehouse,
                'committed_at' => $count->committed_at?->toIso8601String(),
                'lines' => $differing->count(),
                'up' => (int) $differing->sum(fn (StockCountLine $l) => max(0, (int) $l->variance())),
                'down' => (int) $differing->sum(fn (StockCountLine $l) => max(0, -(int) $l->variance())),
                'net_value' => round((float) $differing->sum(fn (StockCountLine $l) => $l->variance() * $book->averageAt((int) $l->stock_item_id, $count->committed_at)), 2),
            ];
        })->all();
    }

    /**
     * The cards as sheets: months in the range, waiting requests, requesters and departments by value, count variance.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $data = $this->breakdown($viewer, $filters);
        $byValue = fn (array $rows) => collect($rows)->sortByDesc('value')->values()->all();

        $sections = [[
            'title' => 'รับเข้าและเบิกออกรายเดือน',
            'headings' => ['เดือน', 'รับเข้า (ชิ้น)', 'คืนของ (ชิ้น)', 'เบิกออก (ชิ้น)', 'ย้ายคลัง (ชิ้น)', 'มูลค่ารับเข้า', 'มูลค่าเบิกออก', 'ปรับยอดสุทธิ (ชิ้น)'],
            'rows' => array_values(array_map(fn (array $m) => [
                CellDate::month($m['month']), $m['receive'], $m['return'], $m['issue'], $m['transfer'],
                $m['receive_value'], $m['issue_value'], $m['adjust_net'],
            ], $data['months'])),
        ]];

        $sections[] = [
            'title' => 'คำขอเบิกที่ค้าง',
            'note' => 'ตามสถานะตอนนี้ ไม่ขึ้นกับช่วงวันที่และตัวกรองคลัง',
            'headings' => ['เลขที่', 'ชื่อรายการ', 'SKU', 'จำนวน', 'ผู้ขอ', 'สถานะ', 'รอตั้งแต่'],
            'rows' => array_map(fn (array $r) => [
                $r['reference'], $r['item_name'], $r['sku'], $r['qty'], $r['requester_th'] ?: $r['requester'],
                $r['status'] === 'approved' ? 'อนุมัติแล้ว รอจ่าย' : 'รออนุมัติ', CellDate::dateTime($r['waiting_since']),
            ], $data['requests']['rows']),
        ];
        $sections[] = [
            'title' => 'ผู้ขอที่เบิกมากที่สุด',
            'headings' => ['ผู้ขอ', 'แผนก', 'มูลค่า', 'ชิ้น', 'ครั้ง'],
            'rows' => array_map(fn (array $p) => [
                $p['name_th'] ?: $p['name'], $p['department_id'] === null ? self::NO_DEPARTMENT_TH : ($p['department_th'] ?: $p['department']),
                $p['value'], $p['qty'], $p['times'],
            ], $byValue($data['people'])),
        ];
        $sections[] = [
            'title' => 'แผนกที่เบิกมากที่สุด',
            'headings' => ['แผนก', 'คน', 'มูลค่า', 'ชิ้น', 'ครั้ง'],
            'rows' => array_map(fn (array $d) => [
                $d['department_id'] === null ? self::NO_DEPARTMENT_TH : ($d['name_th'] ?: $d['name']),
                $d['people'], $d['value'], $d['qty'], $d['times'],
            ], $byValue($data['departments'])),
        ];

        $sections[] = [
            'title' => 'ส่วนต่างจากการนับสต็อก',
            'headings' => ['รอบนับ', 'คลัง', 'ยืนยันเมื่อ', 'รายการที่มีส่วนต่าง', 'ปรับเพิ่ม', 'ปรับลด', 'มูลค่าสุทธิ'],
            'rows' => array_map(fn (array $c) => [
                $c['reference'], $c['warehouse'], CellDate::dateTime($c['committed_at']),
                $c['lines'], $c['up'], $c['down'], $c['net_value'],
            ], $data['counts']),
        ];

        return $sections;
    }
}
