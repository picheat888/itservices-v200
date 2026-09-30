<?php

namespace App\Services\Report\Access;

use App\Models\Access\AccessMembership;
use App\Models\Access\Software;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * "การใช้ License ซอฟต์แวร์" (Report Center → Access): per software, seats bought against seats
 * in use (active memberships — the same count the Access module shows), what is left, who
 * holds them, and how many holders have resigned (seats to take back). No seat count means
 * the licence is not seat-limited.
 */
class SoftwareLicenseReport extends TabularReport
{
    private const LICENSE_KEYS = [
        'perpetual' => 'access_lic_perpetual', 'subscription' => 'access_lic_subscription',
        'free' => 'access_lic_free', 'open_source' => 'access_lic_open_source',
    ];

    // Mirrors resources/js/lang/th/access.ts.
    private const LICENSE_TH = [
        'perpetual' => 'ซื้อขาด', 'subscription' => 'รายเดือน/รายปี', 'free' => 'ฟรี', 'open_source' => 'โอเพนซอร์ส',
    ];

    private const USAGE_KEYS = [
        'over' => 'rep_usage_over', 'full' => 'rep_usage_full',
        'available' => 'rep_usage_available', 'unlimited' => 'rep_usage_unlimited',
    ];

    public function key(): string
    {
        return 'access.software_licenses';
    }

    public function title(): string
    {
        return 'การใช้ License ซอฟต์แวร์';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('license_type', Options::fromLabels(self::LICENSE_KEYS)),
            ReportFilter::select('usage', Options::fromLabels(self::USAGE_KEYS)),
            ReportFilter::search(),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        $used = AccessMembership::query()
            ->selectRaw('COUNT(*)')
            ->where('resource_type', (new Software)->getMorphClass())
            ->whereColumn('access_memberships.resource_id', 'softwares.id')
            ->whereNull('revoked_at');
        $usedSql = '('.$used->toSql().')';
        $usedBindings = $used->getBindings();

        return Software::query()
            ->with([
                'brand:id,name',
                'memberships' => fn (MorphMany $q) => $q->whereNull('revoked_at')
                    ->with('employee:id,code,first_name,last_name,status,last_day')
                    ->orderBy('granted_at'),
            ])
            ->withCount([
                'memberships as seats_used' => fn (Builder $q) => $q->whereNull('revoked_at'),
                'memberships as held_by_leavers' => fn (Builder $q) => $q->whereNull('revoked_at')
                    ->whereHas('employee', fn (Builder $e) => $e->where('status', 'resigned')),
            ])
            ->when($filters['license_type'], fn (Builder $q, string $type) => $q->where('license_type', $type))
            ->when($filters['usage'], fn (Builder $q, string $usage) => match ($usage) {
                'unlimited' => $q->whereNull('seats'),
                'over' => $q->whereNotNull('seats')->whereRaw("{$usedSql} > seats", $usedBindings),
                'full' => $q->whereNotNull('seats')->whereRaw("{$usedSql} = seats", $usedBindings),
                default => $q->whereNotNull('seats')->whereRaw("{$usedSql} < seats", $usedBindings),
            })
            ->when($filters['search'], function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(fn (Builder $w) => $w->where('name', 'like', $like)->orWhere('code', 'like', $like));
            })
            ->orderBy('name')
            ->orderBy('id');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('software_code', 'รหัส', fn (Software $s) => $s->code),
            ReportColumn::text('software', 'ซอฟต์แวร์', fn (Software $s) => $s->name),
            ReportColumn::text('publisher', 'ผู้ผลิต', fn (Software $s) => $s->brand?->name),
            ReportColumn::enum('license_type', 'ประเภท License', fn (Software $s) => $s->license_type, self::LICENSE_KEYS, self::LICENSE_TH),
            ReportColumn::number('seats', 'ซื้อไว้', fn (Software $s) => $s->seats),
            ReportColumn::number('seats_used', 'ใช้ไป', fn (Software $s) => (int) $s->seats_used),
            ReportColumn::number('seats_left', 'คงเหลือ', fn (Software $s) => $s->seats === null ? null : $s->seats - (int) $s->seats_used),
            ReportColumn::number('usage_pct', '% ใช้งาน', fn (Software $s) => $s->seats ? (int) round((int) $s->seats_used / $s->seats * 100) : null),
            ReportColumn::number('held_by_leavers', 'ผู้ลาออกที่ยังถือ', fn (Software $s) => (int) $s->held_by_leavers),
            ReportColumn::text('holders', 'ผู้ถือ', fn (Software $s) => $this->holders($s)),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $rows = (clone $query)->setEagerLoads([])->get();
        $limited = $rows->whereNotNull('seats');

        return [
            ReportSummary::make('total', 'ซอฟต์แวร์', $rows->count()),
            ReportSummary::make('seats_total', 'License ที่ซื้อ', (int) $limited->sum('seats')),
            ReportSummary::make('seats_used', 'ใช้ไป', (int) $rows->sum('seats_used')),
            ReportSummary::make('over_allocated', 'ใช้เกินจำนวน', $limited->filter(fn (Software $s) => (int) $s->seats_used > $s->seats)->count(), 'red'),
            ReportSummary::make('held_by_leavers', 'ผู้ลาออกที่ยังถือ', (int) $rows->sum('held_by_leavers'), 'amber'),
        ];
    }

    /** "Name (CODE), …" of every active holder, oldest grant first. */
    private function holders(Software $software): ?string
    {
        $names = $software->memberships
            ->filter(fn (AccessMembership $m) => $m->employee !== null)
            ->map(fn (AccessMembership $m) => "{$m->employee->name} ({$m->employee->code})");

        return $names->isEmpty() ? null : $names->implode(', ');
    }
}
