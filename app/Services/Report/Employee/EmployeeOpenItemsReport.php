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
 * "สรุปเรื่องค้างของพนักงาน" (employees.open_items): leaver assets, leaver access, accounts and incomplete data as of today.
 * breakdown() draws the four cards; the rows (one per open item) go to Excel, PDF and schedules.
 */
class EmployeeOpenItemsReport extends TabularReport
{
    use AssetColumns;

    private const GROUP_KEYS = [
        'asset' => 'rep_ef_group_asset', 'access' => 'rep_ef_group_access',
        'acct' => 'rep_ef_group_acct', 'data' => 'rep_ef_group_data',
    ];

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
            ReportFilter::search()->placeholderKey('rep_ph_open_items'),
        ];
    }

    public function showsTable(): bool
    {
        return false;
    }

    public function query(User $viewer, array $filters): Builder
    {
        return OpenItems::query($this->departmentId($filters), $filters['search'] ?? null, $filters['group'] ?? null);
    }

    /**
     * The cards' data.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function breakdown(User $viewer, array $filters): array
    {
        return OpenItems::collect($this->departmentId($filters), $filters['search'] ?? null);
    }

    /**
     * The page's topic cards as tables: each topic's people, pieces and oldest case, then the
     * account kinds and data issues behind the last two. All as of the moment the file is made.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $b = $this->breakdown($viewer, $filters);
        $topics = [
            [OpenItems::GROUP_TH['asset'], $b['asset']['people'], $b['asset']['pieces'], 'ชิ้น', $b['asset']['oldest_days']],
            [OpenItems::GROUP_TH['access'], $b['access']['people'], $b['access']['grants'], 'สิทธิ์', $b['access']['oldest_days']],
            [OpenItems::GROUP_TH['acct'], null, $b['acct']['accounts'], 'บัญชี', null],
            [OpenItems::GROUP_TH['data'], $b['data']['people'], array_sum($b['data']['by_issue']), 'เรื่อง', null],
        ];

        return [
            [
                'title' => 'สรุปตามเรื่อง (รวม '.$b['people_total'].' คน/บัญชี)',
                'note' => 'ตามสถานะตอนนี้',
                'headings' => ['เรื่อง', 'พนักงาน (คน)', 'จำนวนรายการ', 'หน่วย', 'ค้างนานสุด (วัน)'],
                'rows' => $topics,
            ],
            [
                'title' => 'บัญชีเข้าใช้งานที่ต้องจัดการ',
                'headings' => ['ประเภท', 'บัญชี'],
                'rows' => array_map(fn (string $kind) => [OpenItems::ACCOUNT_KIND_TH[$kind] ?? $kind, $b['acct']['by_kind'][$kind]], array_keys($b['acct']['by_kind'])),
            ],
            [
                'title' => 'ข้อมูลพนักงานไม่ครบ ตามปัญหา',
                'headings' => ['ปัญหา', 'พนักงาน (คน)'],
                'rows' => collect($b['data']['by_issue'])->map(fn (int $n, string $issue) => [OpenItems::ISSUE_TH[$issue] ?? $issue, $n])->sortByDesc(1)->values()->all(),
            ],
        ];
    }

    /** @param Collection<int, Model> $rows */
    public function hydrateRows(Collection $rows, User $viewer, array $filters): void
    {
        OpenItems::hydrate($rows);
    }

    /** @return array<string, string> */
    protected function meanings(): array
    {
        return [
            'group' => 'ทรัพย์สินค้างคืน = ทรัพย์สินที่ยังผูกกับพนักงานที่บันทึกลาออกแล้ว, สิทธิ์ค้างถอน = สิทธิ์ที่ยังไม่ถอนของผู้ที่พ้นวันทำงานวันสุดท้ายแล้ว, บัญชีเข้าใช้งาน = บัญชีที่ต้องจัดการ, ข้อมูลพนักงานไม่ครบ = ข้อมูลของพนักงานที่ยังทำงานอยู่ขาดหรือขัดกัน ทุกเรื่องดู ณ วันที่ส่งออก',
            'item' => 'ทรัพย์สิน = รหัสทรัพย์สิน, สิทธิ์ = ชื่อ Resource, บัญชี = ชื่อผู้ใช้ (username), ข้อมูลไม่ครบ = ชื่อปัญหา เช่น ไม่มีหัวหน้า หรือวันที่ไม่สอดคล้อง',
            'detail' => 'ทรัพย์สิน = หมวดหมู่ / รุ่น, สิทธิ์ = ประเภท Resource, บัญชี = Role ของบัญชี, หัวหน้าลาออกแล้ว = ชื่อและวันสุดท้ายของหัวหน้า, วันที่ไม่สอดคล้อง = วันเริ่มงานและวันสุดท้ายที่ขัดกัน',
            'status' => 'ทรัพย์สิน = สถานะของทรัพย์สิน เช่น ใช้งานอยู่ หรือรอรับคืน, บัญชี = เจ้าของบัญชีลาออกแล้ว, ยังไม่ได้เปลี่ยนรหัสผ่านครั้งแรก หรือรหัสผ่านหมดอายุ (ไม่เคยเปลี่ยนนับเป็นหมดอายุ) ว่าง = เรื่องสิทธิ์และข้อมูลไม่ครบ',
            'last_day' => 'วันทำงานวันสุดท้ายของพนักงานตามที่บันทึก ว่าง = ไม่ได้บันทึก หรือบัญชีที่ไม่ผูกพนักงาน',
        ];
    }

    public function columns(): array
    {
        return [
            ReportColumn::enum('group', 'เรื่อง', fn (OpenItemRow $r) => $r->grp, self::GROUP_KEYS, OpenItems::GROUP_TH),
            ReportColumn::text('employee_code', 'รหัสพนักงาน', fn (OpenItemRow $r) => $r->employee?->code)
                ->linkTo('/employees', fn (OpenItemRow $r) => $r->employee_id),
            ReportColumn::text('employee', 'พนักงาน', fn (OpenItemRow $r) => $r->employee?->name),
            ReportColumn::localized('department', 'แผนก', fn (OpenItemRow $r) => AccessFacts::department($r->employee))->withCode('รหัสแผนก', 'รหัสแผนก ใช้เชื่อมกับตารางแผนก (ชื่อเปลี่ยนได้ รหัสไม่เปลี่ยน)'),
            ReportColumn::text('item', 'รายการ', fn (OpenItemRow $r) => $this->item($r))
                ->linkTo('/assets', fn (OpenItemRow $r) => $r->grp === 'asset' ? (int) $r->ref_id : null),
            ReportColumn::text('detail', 'รายละเอียด', fn (OpenItemRow $r) => $this->detail($r)),
            ReportColumn::text('status', 'สถานะ', fn (OpenItemRow $r) => $this->status($r)),
            ReportColumn::date('last_day', 'วันทำงานวันสุดท้าย', fn (OpenItemRow $r) => $r->last_day),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        // Every topic whatever the topic filter, as the page's cards: the filter narrows the list only.
        $rows = OpenItems::query($this->departmentId($filters), $filters['search'] ?? null)->get(['grp', 'employee_id']);
        $people = fn (?string $group = null) => $rows->when($group, fn (Collection $c) => $c->where('grp', $group))
            ->whereNotNull('employee_id')->pluck('employee_id')->unique()->count();
        $orphanAccounts = $rows->where('grp', 'acct')->whereNull('employee_id')->count();

        $tiles = [
            ReportSummary::make('total', 'ทั้งหมด', $people() + $orphanAccounts),
            ReportSummary::make('open_assets', 'ทรัพย์สินค้างคืน', $people('asset'), 'red'),
            ReportSummary::make('open_access', 'สิทธิ์ค้างถอน', $people('access'), 'red'),
        ];
        $tiles[] = ReportSummary::make('open_accounts', 'บัญชีเข้าใช้งาน', $rows->where('grp', 'acct')->count(), 'amber');
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
