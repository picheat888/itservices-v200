<?php

namespace App\Services\Report\Asset;

use App\Models\Asset\AssetTransfer;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "ประวัติโอนย้ายและรับคืน" (Report Center → Assets): every row of the asset custody trail
 * (asset_transfers) in the date range (this month by default), newest first — hand-overs,
 * returns, recalls and desk moves.
 *
 * The trail stores the asset tag/model and employee codes as a snapshot (so it still reads
 * after a rename or delete); names are looked up for display in one pass per page
 * (AssetTransfer::employeeNamesFor), and an end that is a warehouse or a shared label shows
 * as stored.
 */
class AssetTransferHistoryReport extends TabularReport
{
    private const KIND_KEYS = [
        'handover' => 'asset_hist_kind_handover', 'return' => 'asset_hist_kind_return',
        'recall' => 'asset_hist_kind_recall', 'relocate' => 'asset_hist_kind_relocate',
    ];

    // Mirrors resources/js/lang/th/asset.ts.
    private const KIND_TH = ['handover' => 'ส่งมอบ', 'return' => 'รับคืน', 'recall' => 'เรียกคืน', 'relocate' => 'ย้ายที่ตั้ง'];

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
            ReportFilter::date('from', today()->startOfMonth()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('kind', Options::fromLabels(self::KIND_KEYS)),
            ReportFilter::search(),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        return AssetTransfer::query()
            ->whereBetween('created_at', $this->dayRange($filters))
            ->when($filters['kind'], fn (Builder $q, string $kind) => $q->where('kind', $kind))
            ->when($filters['search'], function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(fn (Builder $w) => $w->where('asset_tag', 'like', $like)
                    ->orWhere('asset_model', 'like', $like)
                    ->orWhere('from_owner', 'like', $like)
                    ->orWhere('to_owner', 'like', $like));
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    public function columns(): array
    {
        return [
            ReportColumn::date('moved_at', 'วันที่', fn (AssetTransfer $t) => $t->created_at),
            ReportColumn::text('asset_code', 'รหัสทรัพย์สิน', fn (AssetTransfer $t) => $t->asset_tag)->linkTo('/assets', fn (AssetTransfer $t) => $t->asset_id),
            ReportColumn::text('model', 'รุ่น', fn (AssetTransfer $t) => $t->asset_model),
            ReportColumn::enum('transfer_kind', 'รายการ', fn (AssetTransfer $t) => $t->kind, self::KIND_KEYS, self::KIND_TH),
            ReportColumn::text('from_label', 'จาก', fn (AssetTransfer $t) => $this->party($t, 'from_owner')),
            ReportColumn::text('to_label', 'ไปยัง', fn (AssetTransfer $t) => $this->party($t, 'to_owner')),
            ReportColumn::text('reason', 'เหตุผล', fn (AssetTransfer $t) => $t->reason),
            ReportColumn::text('performed_by', 'ผู้ดำเนินการ', fn (AssetTransfer $t) => $t->performed_by),
        ];
    }

    public function hydrateRows(Collection $rows, User $viewer, array $filters): void
    {
        $names = AssetTransfer::employeeNamesFor($rows);
        foreach ($rows as $row) {
            $row->setAttribute('party_names', $names);
        }
    }

    public function summary(Builder $query, array $filters): array
    {
        $bare = fn () => (clone $query)->reorder();

        return [
            ReportSummary::make('total', 'ทั้งหมด', $bare()->count()),
            ReportSummary::make('handovers', 'ส่งมอบ', $bare()->where('kind', 'handover')->count(), 'green'),
            ReportSummary::make('returns', 'รับคืน / เรียกคืน', $bare()->whereIn('kind', ['return', 'recall'])->count(), 'amber'),
            ReportSummary::make('relocations', 'ย้ายที่ตั้ง', $bare()->where('kind', 'relocate')->count()),
        ];
    }

    /** "Name (CODE)" when the stored end is an employee code, else the stored label as is. */
    private function party(AssetTransfer $transfer, string $column): ?string
    {
        $value = $transfer->getAttribute($column);
        $name = ($transfer->getAttribute('party_names') ?? [])[$value] ?? null;

        return $name === null ? $value : "{$name} ({$value})";
    }
}
