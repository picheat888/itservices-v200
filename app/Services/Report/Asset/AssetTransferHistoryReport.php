<?php

namespace App\Services\Report\Asset;

use App\Enums\Asset\AssetTransferKind;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\Employee\Employee;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\DateDisplay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "ประวัติโอนย้ายและรับคืน": the asset custody trail (asset_transfers) in a date range, newest first,
 * with what became of each hand-over; breakdown() feeds the cards above the list.
 */
class AssetTransferHistoryReport extends TabularReport
{
    private const KIND_KEYS = [
        'handover' => 'asset_hist_kind_handover', 'return' => 'asset_hist_kind_return',
        'recall' => 'asset_hist_kind_recall', 'relocate' => 'asset_hist_kind_relocate',
    ];

    // Mirrors resources/js/lang/th/asset.ts.
    private const KIND_TH = ['handover' => 'ส่งมอบ', 'return' => 'รับคืน', 'recall' => 'เรียกคืน', 'relocate' => 'ย้ายที่ตั้ง'];

    private const PARTY_KEYS = [
        'employee' => 'rep_th_party_employee', 'warehouse' => 'rep_th_party_warehouse',
        'location' => 'rep_th_party_location', 'shared' => 'rep_th_party_shared',
    ];

    private const PARTY_TH = ['employee' => 'พนักงาน', 'warehouse' => 'คลัง', 'location' => 'สถานที่', 'shared' => 'ส่วนกลาง'];

    private const OUTCOME_KEYS = [
        'accepted' => 'rep_th_outcome_accepted', 'waiting' => 'rep_th_outcome_waiting',
        'recalled' => 'rep_th_outcome_recalled', 'never_accepted' => 'rep_th_outcome_never_accepted',
        'not_needed' => 'rep_th_outcome_not_needed', 'returned' => 'rep_th_outcome_returned',
    ];

    private const OUTCOME_TH = [
        'accepted' => 'กดรับแล้ว', 'waiting' => 'รอกดรับ', 'recalled' => 'เรียกคืนก่อนกดรับ',
        'never_accepted' => 'ไม่ได้กดรับ', 'not_needed' => 'ส่วนกลาง ไม่ต้องกดรับ', 'returned' => 'รับคืนหลังแจ้งคืน',
    ];

    /** A wait longer than this many days turns the "waiting now" tile red. */
    private const LONG_WAIT_DAYS = 7;

    public function key(): string
    {
        return 'assets.transfer_history';
    }

    public function title(): string
    {
        return 'ประวัติโอนย้ายและรับคืน';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfYear()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('kind', Options::fromLabels(self::KIND_KEYS)),
            ReportFilter::select('warehouse_id', Options::warehouses()),
            ReportFilter::select('category_id', Options::categories())->labelKey('rep_fl_asset_category'),
            ReportFilter::select('department_id', Options::departments()),
            ReportFilter::search(),
        ];
    }

    /**
     * The trail rows the filters keep, bare — the list adds its order.
     *
     * @param  array<string, mixed>  $filters
     */
    private function filtered(array $filters): Builder
    {
        return AssetTransfer::query()
            ->whereBetween('created_at', $this->dayRange($filters))
            ->when($filters['kind'] ?? null, fn (Builder $q, string $kind) => $q->where('kind', $kind))
            ->when($filters['warehouse_id'] ?? null, function (Builder $q, $id) {
                $name = Warehouse::query()->whereKey((int) $id)->value('name');
                $q->where(fn (Builder $w) => $w->where('from_owner', $name)->orWhere('to_owner', $name));
            })
            ->when($filters['category_id'] ?? null, fn (Builder $q, $id) => $q->whereIn('asset_id', Asset::query()->select('id')->where('category_id', (int) $id)))
            ->when($filters['department_id'] ?? null, function (Builder $q, $id) {
                $codes = Employee::query()->select('code')->where('department_id', (int) $id);
                $q->where(fn (Builder $w) => $w->whereIn('from_owner', $codes)->orWhereIn('to_owner', $codes));
            })
            ->when($filters['search'] ?? null, function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $codes = Employee::query()->select('code')
                    ->where(fn (Builder $e) => $e->where('first_name', 'like', $like)->orWhere('last_name', 'like', $like));
                $q->where(fn (Builder $w) => $w->where('asset_tag', 'like', $like)
                    ->orWhere('asset_model', 'like', $like)
                    ->orWhereIn('asset_id', Asset::query()->select('id')->whereHas('brand', fn (Builder $b) => $b->where('name', 'like', $like)))
                    ->orWhere('from_owner', 'like', $like)
                    ->orWhere('to_owner', 'like', $like)
                    ->orWhereIn('from_owner', $codes)
                    ->orWhereIn('to_owner', $codes));
            });
    }

    public function query(User $viewer, array $filters): Builder
    {
        return $this->filtered($filters)->orderByDesc('created_at')->orderByDesc('id');
    }

    public function columns(): array
    {
        return [
            ReportColumn::dateTime('moved_at', 'วันที่', fn (AssetTransfer $t) => $t->created_at),
            ReportColumn::text('asset_code', 'รหัสทรัพย์สิน', fn (AssetTransfer $t) => $t->asset_tag)->linkTo('/assets', fn (AssetTransfer $t) => $t->asset_id),
            // Drawn under the code on the page, so hidden as columns of their own.
            ReportColumn::text('brand', 'ยี่ห้อ', fn (AssetTransfer $t) => $this->trail($t, 'brands')[$t->asset_id] ?? null)
                ->labelKey('rep_c_brand')->hiddenByDefault(),
            ReportColumn::text('model', 'รุ่น', fn (AssetTransfer $t) => $t->asset_model)->hiddenByDefault(),
            ReportColumn::localized('category', 'หมวดหมู่', fn (AssetTransfer $t) => $this->trail($t, 'categories')[$t->asset_id] ?? null)
                ->labelKey('rep_c_asset_category')->hiddenByDefault(),
            ReportColumn::number('asset_moves', 'จำนวนครั้งที่เคลื่อนไหว', fn (AssetTransfer $t) => $this->trail($t, 'moves')[$t->asset_id] ?? null)->hiddenByDefault(),
            ReportColumn::enum('transfer_kind', 'รายการ', fn (AssetTransfer $t) => $t->kind, self::KIND_KEYS, self::KIND_TH),
            ReportColumn::text('from_label', 'จาก', fn (AssetTransfer $t) => $this->partyLabel($t, 'from_owner')),
            ...$this->partyColumns('from'),
            ReportColumn::text('to_label', 'ไปยัง', fn (AssetTransfer $t) => $this->partyLabel($t, 'to_owner')),
            ...$this->partyColumns('to'),
            ReportColumn::enum('outcome', 'ผลหลังส่ง', fn (AssetTransfer $t) => $this->trail($t, 'outcomes')[$t->id]['outcome'] ?? null, self::OUTCOME_KEYS, self::OUTCOME_TH)
                ->labelKey('rep_c_th_outcome'),
            // Hours to the acceptance, the wait so far, or from the return request to the return.
            ReportColumn::number('outcome_hours', 'ผลหลังส่ง (ชม.)', fn (AssetTransfer $t) => $this->trail($t, 'outcomes')[$t->id]['hours'] ?? null)->hiddenByDefault(),
            ReportColumn::text('reason', 'เหตุผล', fn (AssetTransfer $t) => $t->reason),
            ReportColumn::text('performed_by', 'ผู้ดำเนินการ', fn (AssetTransfer $t) => $t->performed_by),
        ];
    }

    /**
     * One end's parts, drawn inside the from / to cell on the page.
     *
     * @return list<ReportColumn>
     */
    private function partyColumns(string $end): array
    {
        $column = "{$end}_owner";
        $person = fn (AssetTransfer $t) => $this->trail($t, 'people')[$t->getAttribute($column)] ?? null;

        return [
            ReportColumn::enum("{$end}_type", $end === 'from' ? 'จาก (ประเภท)' : 'ไปยัง (ประเภท)', fn (AssetTransfer $t) => $this->partyType($t, $column), self::PARTY_KEYS, self::PARTY_TH)->hiddenByDefault(),
            ReportColumn::text("{$end}_name", $end === 'from' ? 'จาก (ชื่อ)' : 'ไปยัง (ชื่อ)', fn (AssetTransfer $t) => $person($t)['name'] ?? $t->getAttribute($column))->hiddenByDefault(),
            ReportColumn::text("{$end}_code", $end === 'from' ? 'จาก (รหัสพนักงาน)' : 'ไปยัง (รหัสพนักงาน)', fn (AssetTransfer $t) => $person($t) ? $t->getAttribute($column) : null)->hiddenByDefault(),
            ReportColumn::localized("{$end}_department", $end === 'from' ? 'จาก (แผนก)' : 'ไปยัง (แผนก)', fn (AssetTransfer $t) => isset($person($t)['department'])
                ? ['name' => $person($t)['department']['name'], 'name_th' => $person($t)['department']['name_th']]
                : null)->hiddenByDefault(),
            ReportColumn::number("{$end}_resigned", $end === 'from' ? 'จาก (ลาออกแล้ว)' : 'ไปยัง (ลาออกแล้ว)', fn (AssetTransfer $t) => $person($t) === null ? null : (int) $person($t)['resigned'])->hiddenByDefault(),
        ];
    }

    public function hydrateRows(Collection $rows, User $viewer, array $filters): void
    {
        $trail = $this->trailOf($rows);
        foreach ($rows as $row) {
            $row->setAttribute('trail', $trail);
        }
    }

    /**
     * What the columns need for a set of rows, loaded in one pass.
     *
     * @param  Collection<int, AssetTransfer>  $rows
     * @return array{people: array<string, mixed>, warehouses: list<string>, outcomes: array<int, mixed>, categories: array<int, mixed>, moves: array<int, int>}
     */
    private function trailOf(Collection $rows): array
    {
        $people = TransferTrail::people($rows);
        $assetIds = $rows->pluck('asset_id')->unique()->values();
        $assets = Asset::query()->whereIn('id', $assetIds)->with('category:id,name,name_th')->get(['id', 'category_id']);

        return [
            'people' => $people,
            'warehouses' => TransferTrail::warehouseNames(),
            'outcomes' => TransferTrail::outcomes($rows, $people),
            'categories' => $assets->mapWithKeys(fn (Asset $a) => [$a->id => $a->category ? ['name' => $a->category->name, 'name_th' => $a->category->name_th] : null])->all(),
            'brands' => TransferTrail::brands($assetIds),
            'moves' => AssetTransfer::query()->whereIn('asset_id', $assetIds)->selectRaw('asset_id, COUNT(*) as n')->groupBy('asset_id')
                ->pluck('n', 'asset_id')->map(fn ($n) => (int) $n)->all(),
        ];
    }

    private function trail(AssetTransfer $row, string $part): array
    {
        return ($row->getAttribute('trail') ?? [])[$part] ?? [];
    }

    private function partyType(AssetTransfer $row, string $column): ?string
    {
        return TransferTrail::partyType($row->getAttribute($column), $row->kind, $this->trail($row, 'people'), $this->trail($row, 'warehouses'));
    }

    /** "Name (CODE)" when the stored end is an employee code, else the stored label as is. */
    private function partyLabel(AssetTransfer $row, string $column): ?string
    {
        $value = $row->getAttribute($column);
        $name = $this->trail($row, 'people')[$value]['name'] ?? null;

        return $name === null ? $value : "{$name} ({$value})";
    }

    /**
     * Every row in the range with its trail figures, for the tiles, the breakdown and the sheets.
     *
     * @param  array<string, mixed>  $filters
     * @return array{rows: Collection<int, AssetTransfer>, trail: array<string, mixed>}
     */
    private function figures(array $filters): array
    {
        $rows = $this->filtered($filters)->orderBy('created_at')->orderBy('id')
            ->get(['id', 'asset_id', 'kind', 'from_owner', 'to_owner', 'created_at']);

        return ['rows' => $rows, 'trail' => $this->trailOf($rows)];
    }

    /**
     * Who held each relocated asset when it moved — an employee, shared use or nobody (in store) —
     * read from its last hand-over, return or recall before the move.
     *
     * @param  Collection<int, AssetTransfer>  $relocations
     * @return list<array{key: string, label_key: string, tone: string, value: int}>
     */
    private static function relocationHolders(Collection $relocations): array
    {
        $counts = ['employee' => 0, 'shared' => 0, 'store' => 0];
        if ($relocations->isNotEmpty()) {
            $before = AssetTransfer::query()
                ->whereIn('asset_id', $relocations->pluck('asset_id')->unique())
                ->where('kind', '!=', AssetTransferKind::Relocate->value)
                ->orderBy('created_at')->orderBy('id')
                ->get(['asset_id', 'kind', 'to_owner', 'created_at'])
                ->groupBy('asset_id');
            $people = Employee::query()->whereIn('code', $before->flatten()->pluck('to_owner')->filter()->unique())->pluck('code')->flip();
            foreach ($relocations as $move) {
                $last = $before->get($move->asset_id, collect())->filter(fn (AssetTransfer $t) => $t->created_at->lt($move->created_at))->last();
                $holder = match (true) {
                    $last === null, $last->kind !== AssetTransferKind::Handover => 'store',
                    $people->has($last->to_owner) => 'employee',
                    default => 'shared',
                };
                $counts[$holder]++;
            }
        }

        return [
            ['key' => 'employee', 'label_key' => 'rep_th_split_held', 'tone' => 'asset-deployed', 'value' => $counts['employee']],
            ['key' => 'shared', 'label_key' => 'rep_th_split_shared', 'tone' => 'asset-common', 'value' => $counts['shared']],
            ['key' => 'store', 'label_key' => 'rep_th_split_in_store', 'tone' => 'asset-ready', 'value' => $counts['store']],
        ];
    }

    /** @param Collection<int, AssetTransfer> $rows */
    private static function ofKind(Collection $rows, AssetTransferKind $kind): Collection
    {
        return $rows->filter(fn (AssetTransfer $t) => $t->kind === $kind)->values();
    }

    public function summary(Builder $query, array $filters): array
    {
        ['rows' => $rows, 'trail' => $trail] = $this->figures($filters);
        $handovers = self::ofKind($rows, AssetTransferKind::Handover);
        $acceptance = TransferTrail::acceptance($handovers, $trail['outcomes']);
        $returns = self::ofKind($rows, AssetTransferKind::Return)->count();
        $recalls = self::ofKind($rows, AssetTransferKind::Recall)->count();
        $waiting = collect(TransferTrail::waiting($filters));
        $relocations = self::ofKind($rows, AssetTransferKind::Relocate);

        return [
            ReportSummary::make('th_handovers', 'ส่งมอบออก (ครั้ง)', $handovers->count())->withSplit([
                ['key' => 'to_people', 'label_key' => 'rep_th_split_people', 'tone' => 'soft-blue', 'value' => $acceptance['to_people']],
                ['key' => 'to_shared', 'label_key' => 'rep_th_split_shared', 'tone' => 'asset-common', 'value' => $acceptance['to_shared']],
            ]),
            ReportSummary::make('th_back_in', 'กลับเข้าคลัง (ครั้ง)', $returns + $recalls)->withSplit([
                ['key' => 'returns', 'label_key' => 'asset_hist_kind_return', 'tone' => 'soft-green', 'value' => $returns],
                ['key' => 'recalls', 'label_key' => 'asset_hist_kind_recall', 'tone' => 'soft-amber', 'value' => $recalls],
            ]),
            // Assets waiting right now, whatever the date range.
            ReportSummary::make('th_waiting_now', 'ค้างอยู่ตอนนี้ (เครื่อง)', $waiting->count())
                ->withAttention($waiting->contains(fn (array $w) => $w['days'] > self::LONG_WAIT_DAYS) ? 'red' : 'amber')
                ->withSplit([
                    ['key' => 'pending_acceptance', 'label_key' => 'rep_th_split_wait_accept', 'tone' => 'asset-pending-acceptance', 'value' => $waiting->where('status', 'pending_acceptance')->count()],
                    ['key' => 'pending_return', 'label_key' => 'rep_th_split_wait_return', 'tone' => 'asset-pending-return', 'value' => $waiting->where('status', 'pending_return')->count()],
                ]),
            ReportSummary::make('th_accept_median', 'เวลากดรับมอบ (มัธยฐาน)', $acceptance['median_hours'], null, 'hours')
                ->withSplit([
                    ['key' => 'same_day', 'label_key' => 'rep_th_acc_same_day', 'tone' => 'soft-green', 'value' => $acceptance['same_day'], 'counts' => true],
                    ['key' => 'next_day', 'label_key' => 'rep_th_acc_next_day', 'tone' => 'soft-blue', 'value' => $acceptance['next_day'], 'counts' => true],
                    ['key' => 'later', 'label_key' => 'rep_th_acc_later', 'tone' => 'soft-amber', 'value' => $acceptance['later'], 'counts' => true],
                ]),
            // A desk or room move: the holder stays the same, so it is neither out nor back in.
            ReportSummary::make('th_relocations', 'ย้ายที่ตั้ง (ครั้ง)', $relocations->count())
                ->withSplit(self::relocationHolders($relocations)),
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
        ['rows' => $rows, 'trail' => $trail] = $this->figures($filters);
        $handovers = self::ofKind($rows, AssetTransferKind::Handover);

        return [
            'months' => $this->months($rows, $filters),
            'acceptance' => TransferTrail::acceptance($handovers, $trail['outcomes']),
            'warehouses' => self::warehouses($rows, $trail),
            'departments' => self::departments($handovers, $trail),
            'categories' => self::categories($handovers, $trail),
            'waiting' => TransferTrail::waiting($filters),
            'relocations' => $this->relocations($filters),
        ];
    }

    /**
     * Every location update in the range, newest first: the asset, where from and to, why and by whom.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{id: int, asset_id: int, at: string, code: string, brand: ?string, model: string, from: ?string, to: string, reason: ?string, by: ?string}>
     */
    private function relocations(array $filters): array
    {
        $moves = $this->filtered($filters)
            ->where('kind', AssetTransferKind::Relocate->value)
            ->orderByDesc('created_at')->orderByDesc('id')
            ->get(['id', 'asset_id', 'asset_tag', 'asset_model', 'from_owner', 'to_owner', 'reason', 'performed_by', 'created_at']);
        $brands = TransferTrail::brands($moves->pluck('asset_id')->unique());

        return $moves
            ->map(fn (AssetTransfer $t) => [
                'id' => $t->id,
                'asset_id' => $t->asset_id,
                'at' => $t->created_at->format('Y-m-d H:i'),
                'code' => $t->asset_tag,
                'brand' => $brands[$t->asset_id] ?? null,
                'model' => $t->asset_model,
                'from' => $t->from_owner,
                'to' => $t->to_owner,
                'reason' => $t->reason,
                'by' => $t->performed_by,
            ])
            ->all();
    }

    /**
     * Every month of the range, oldest first, empty ones included: each kind's count.
     *
     * @param  Collection<int, AssetTransfer>  $rows
     * @param  array<string, mixed>  $filters
     * @return list<array{month: string, handover: int, return: int, recall: int, relocate: int}>
     */
    private function months(Collection $rows, array $filters): array
    {
        [$from, $to] = $this->dayRange($filters);
        $byMonth = $rows->groupBy(fn (AssetTransfer $t) => $t->created_at->format('Y-m'));

        $months = [];
        for ($month = $from->copy()->startOfMonth(); $month->lte($to); $month->addMonth()) {
            $group = $byMonth->get($month->format('Y-m'), collect());
            $months[] = ['month' => $month->format('Y-m')] + collect(AssetTransferKind::cases())
                ->mapWithKeys(fn (AssetTransferKind $kind) => [$kind->value => self::ofKind($group, $kind)->count()])->all();
        }

        return $months;
    }

    /**
     * Each warehouse on the trail: hand-overs out of it, returns and recalls back into it.
     *
     * @param  Collection<int, AssetTransfer>  $rows
     * @param  array<string, mixed>  $trail
     * @return list<array{name: string, out: int, back: int}>
     */
    private static function warehouses(Collection $rows, array $trail): array
    {
        $names = $trail['warehouses'];
        $out = $rows->filter(fn (AssetTransfer $t) => in_array($t->from_owner, $names, true))->countBy('from_owner');
        $back = $rows->filter(fn (AssetTransfer $t) => in_array($t->to_owner, $names, true))->countBy('to_owner');

        return $out->keys()->merge($back->keys())->unique()
            ->map(fn (string $name) => ['name' => $name, 'out' => (int) $out->get($name, 0), 'back' => (int) $back->get($name, 0)])
            ->sortBy([['out', 'desc'], ['back', 'desc'], ['name', 'asc']])
            ->values()
            ->all();
    }

    /**
     * Hand-overs to employees by the receiver's department, most first (null = no department).
     *
     * @param  Collection<int, AssetTransfer>  $handovers
     * @param  array<string, mixed>  $trail
     * @return list<array{department_id: ?int, name: ?string, name_th: ?string, count: int}>
     */
    private static function departments(Collection $handovers, array $trail): array
    {
        return $handovers
            ->filter(fn (AssetTransfer $t) => isset($trail['people'][$t->to_owner]))
            ->groupBy(fn (AssetTransfer $t) => (string) ($trail['people'][$t->to_owner]['department']['id'] ?? ''))
            ->map(function (Collection $group) use ($trail) {
                $department = $trail['people'][$group->first()->to_owner]['department'];

                return ['department_id' => $department['id'] ?? null, 'name' => $department['name'] ?? null, 'name_th' => $department['name_th'] ?? null, 'count' => $group->count()];
            })
            ->sortBy([['count', 'desc'], ['name', 'asc']])
            ->values()
            ->all();
    }

    /**
     * Hand-overs by the asset's category, most first (null = no category).
     *
     * @param  Collection<int, AssetTransfer>  $handovers
     * @param  array<string, mixed>  $trail
     * @return list<array{name: ?string, name_th: ?string, count: int}>
     */
    private static function categories(Collection $handovers, array $trail): array
    {
        return $handovers
            ->groupBy(fn (AssetTransfer $t) => (string) ($trail['categories'][$t->asset_id]['name'] ?? ''))
            ->map(fn (Collection $group) => [
                'name' => $trail['categories'][$group->first()->asset_id]['name'] ?? null,
                'name_th' => $trail['categories'][$group->first()->asset_id]['name_th'] ?? null,
                'count' => $group->count(),
            ])
            ->sortBy([['count', 'desc'], ['name', 'asc']])
            ->values()
            ->all();
    }

    /**
     * The breakdown as sheets: by month, acceptance, warehouses, departments, categories, waiting now.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $b = $this->breakdown($viewer, $filters);
        $a = $b['acceptance'];
        $name = fn (?string $name, ?string $nameTh, string $none) => $name === null ? $none : ($nameTh ?: $name);

        return [
            [
                'title' => 'แยกตามเดือน',
                'headings' => ['เดือน', 'ส่งมอบ', 'รับคืน', 'เรียกคืน', 'ย้ายที่ตั้ง'],
                'rows' => array_map(fn (array $m) => [DateDisplay::monthYear($m['month']), $m['handover'], $m['return'], $m['recall'], $m['relocate']], $b['months']),
            ],
            [
                'title' => 'การกดรับมอบ',
                'headings' => ['รายการ', 'จำนวน'],
                'rows' => [
                    ['ส่งมอบให้พนักงาน', $a['to_people']], ['กดรับวันเดียวกัน', $a['same_day']], ['กดรับวันถัดไป', $a['next_day']],
                    ['กดรับหลัง 2 วันขึ้นไป', $a['later']], ['รอกดรับ', $a['waiting']], ['เรียกคืนก่อนกดรับ', $a['recalled']],
                    ['ไม่ได้กดรับ', $a['never_accepted']], ['ส่งมอบเป็นส่วนกลาง (ไม่ต้องกดรับ)', $a['to_shared']],
                    ['เวลากดรับมอบ มัธยฐาน (ชม.)', $a['median_hours']],
                ],
            ],
            [
                'title' => 'แยกตามคลัง',
                'headings' => ['คลัง', 'ส่งมอบออก', 'กลับเข้าคลัง'],
                'rows' => array_map(fn (array $w) => [$w['name'], $w['out'], $w['back']], $b['warehouses']),
            ],
            [
                'title' => 'แยกตามแผนกผู้รับ',
                'headings' => ['แผนก', 'ส่งมอบ'],
                'rows' => array_map(fn (array $d) => [$name($d['name'], $d['name_th'], 'ไม่ระบุแผนก'), $d['count']], $b['departments']),
            ],
            [
                'title' => 'แยกตามหมวดหมู่',
                'headings' => ['หมวดหมู่', 'ส่งมอบ'],
                'rows' => array_map(fn (array $c) => [$name($c['name'], $c['name_th'], 'ไม่ระบุหมวดหมู่'), $c['count']], $b['categories']),
            ],
            [
                'title' => 'ค้างอยู่ตอนนี้',
                'headings' => ['รหัสทรัพย์สิน', 'ยี่ห้อ', 'รุ่น', 'สถานะ', 'ผู้ถือ', 'แผนก', 'เริ่มรอ', 'สาเหตุ', 'รอมาแล้ว (วัน)'],
                'rows' => array_map(fn (array $w) => [
                    $w['code'], $w['brand'], $w['model'], $w['status'] === 'pending_acceptance' ? 'รอกดรับ' : 'รอรับคืน',
                    $w['holder'] ? "{$w['holder']['name']} ({$w['holder']['code']})" : $w['owner_label'],
                    isset($w['holder']['department']) ? $name($w['holder']['department']['name'], $w['holder']['department']['name_th'], '') : null,
                    DateDisplay::cellDateTime($w['since']),
                    match ($w['cause']) {
                        'handover' => 'ส่งมอบ', 'request' => 'แจ้งคืน', 'resign' => 'ลาออก', default => null,
                    },
                    $w['days'],
                ], $b['waiting']),
            ],
            [
                'title' => 'อัปเดตสถานที่',
                'headings' => ['วันที่', 'รหัสทรัพย์สิน', 'ยี่ห้อ', 'รุ่น', 'จาก', 'ไปยัง', 'เหตุผล', 'ผู้ดำเนินการ'],
                'rows' => array_map(fn (array $r) => [DateDisplay::cellDateTime($r['at']), $r['code'], $r['brand'], $r['model'], $r['from'], $r['to'], $r['reason'], $r['by']], $b['relocations']),
            ],
        ];
    }
}
