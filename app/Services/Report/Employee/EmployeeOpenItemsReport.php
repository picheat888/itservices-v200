<?php

namespace App\Services\Report\Employee;

use App\Models\User;
use App\Services\Report\Access\AccessFacts;
use App\Services\Report\Asset\AssetColumns;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * "สรุปเรื่องค้างของพนักงาน" (Report Center → Employees): what is still open about people as of
 * today — leaver assets, leaver access, accounts, incomplete employee data. The page draws four
 * cards from breakdown(); the rows (one per open item) are what Excel, PDF and schedules carry.
 * Gated by employees.view; accounts only for a viewer with employees.set_credentials.
 */
class EmployeeOpenItemsReport extends TabularReport
{
    use AssetColumns;

    private const GROUP_KEYS = [
        'asset' => 'rep_ef_group_asset', 'access' => 'rep_ef_group_access',
        'acct' => 'rep_ef_group_acct', 'data' => 'rep_ef_group_data',
    ];

    /** Whether the viewer of the query just built may see accounts — summary() has no viewer of its own. */
    private bool $withAccounts = false;

    public function key(): string
    {
        return 'employees.open_items';
    }

    public function title(): string
    {
        return 'สรุปเรื่องค้างของพนักงาน';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('department_id', Options::departments()),
            ReportFilter::select('group', Options::fromLabels(self::GROUP_KEYS)),
            ReportFilter::search(),
        ];
    }

    public function showsTable(): bool
    {
        return false;
    }

    public function query(User $viewer, array $filters): Builder
    {
        $this->withAccounts = OpenItems::canSeeAccounts($viewer);

        return OpenItems::query($viewer, $this->departmentId($filters), $filters['search'] ?? null, $filters['group'] ?? null);
    }

    /**
     * The cards' data.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function breakdown(User $viewer, array $filters): array
    {
        return OpenItems::collect($viewer, $this->departmentId($filters), $filters['search'] ?? null);
    }

    /** @param Collection<int, Model> $rows */
    public function hydrateRows(Collection $rows, User $viewer, array $filters): void
    {
        OpenItems::hydrate($rows);
    }

    public function columns(): array
    {
        return [
            ReportColumn::enum('group', 'เรื่อง', fn (OpenItemRow $r) => $r->grp, self::GROUP_KEYS, OpenItems::GROUP_TH),
            ReportColumn::text('employee_code', 'รหัสพนักงาน', fn (OpenItemRow $r) => $r->employee?->code)
                ->linkTo('/employees', fn (OpenItemRow $r) => $r->employee_id),
            ReportColumn::text('employee', 'พนักงาน', fn (OpenItemRow $r) => $r->employee?->name),
            ReportColumn::localized('department', 'แผนก', fn (OpenItemRow $r) => AccessFacts::department($r->employee)),
            ReportColumn::text('item', 'รายการ', fn (OpenItemRow $r) => $this->item($r))
                ->linkTo('/assets', fn (OpenItemRow $r) => $r->grp === 'asset' ? (int) $r->ref_id : null),
            ReportColumn::text('detail', 'รายละเอียด', fn (OpenItemRow $r) => $this->detail($r)),
            ReportColumn::text('status', 'สถานะ', fn (OpenItemRow $r) => $this->status($r)),
            ReportColumn::date('last_day', 'วันทำงานวันสุดท้าย', fn (OpenItemRow $r) => $r->last_day),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $rows = (clone $query)->get(['grp', 'employee_id']);
        $people = fn (?string $group = null) => $rows->when($group, fn (Collection $c) => $c->where('grp', $group))
            ->whereNotNull('employee_id')->pluck('employee_id')->unique()->count();
        $orphanAccounts = $rows->where('grp', 'acct')->whereNull('employee_id')->count();

        $tiles = [
            ReportSummary::make('total', 'ทั้งหมด', $people() + $orphanAccounts),
            ReportSummary::make('open_assets', 'ทรัพย์สินค้างคืน', $people('asset'), 'red'),
            ReportSummary::make('open_access', 'สิทธิ์ค้างถอน', $people('access'), 'red'),
        ];
        if ($this->withAccounts) {
            $tiles[] = ReportSummary::make('open_accounts', 'บัญชีผู้ใช้งาน', $rows->where('grp', 'acct')->count(), 'violet');
        }
        $tiles[] = ReportSummary::make('open_data', 'ข้อมูลไม่ครบ', $people('data'), 'amber');

        return $tiles;
    }

    private function item(OpenItemRow $row): ?string
    {
        return match ($row->grp) {
            'asset' => $row->subject?->asset_code,
            'access' => $row->subject?->resource?->name,
            'acct' => $row->subject?->username,
            default => OpenItems::ISSUE_TH[$row->kind] ?? null,
        };
    }

    private function detail(OpenItemRow $row): ?string
    {
        return match ($row->grp) {
            'asset' => collect([$row->subject?->category?->name_th ?: $row->subject?->category?->name, $row->subject?->model?->name])->filter()->implode(' / ') ?: null,
            'access' => AccessFacts::TYPE_TH[$row->kind] ?? $row->kind,
            'acct' => $row->subject?->role?->name,
            default => $row->employee ? OpenItems::issueDetail($row->kind, $row->employee) : null,
        };
    }

    private function status(OpenItemRow $row): ?string
    {
        return match ($row->grp) {
            'asset' => self::STATUS_TH[$row->kind] ?? $row->kind,
            'acct' => OpenItems::ACCOUNT_KIND_TH[$row->kind] ?? $row->kind,
            default => null,
        };
    }

    /** @param array<string, mixed> $filters */
    private function departmentId(array $filters): ?int
    {
        return ($filters['department_id'] ?? null) ? (int) $filters['department_id'] : null;
    }
}
