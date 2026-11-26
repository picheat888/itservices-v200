<?php

namespace App\Services\Report\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Employee;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\SearchTerms;
use Illuminate\Database\Eloquent\Builder;

/**
 * "รายชื่อพนักงาน" (employees.directory): every employee as of today, for HR to check —
 * Thai and English names, position, section, department, contacts, manager, start date, status and login name.
 * The page shows each name as one cell per language; the rows sheet splits them into first and last name.
 */
class EmployeeDirectoryReport extends TabularReport
{
    private const STATUS_KEYS = [
        EmployeeStatus::Active->value => 'rep_ed_status_active',
        EmployeeStatus::Resigned->value => 'rep_ed_status_resigned',
    ];

    private const STATUS_TH = [
        EmployeeStatus::Active->value => 'ใช้งาน',
        EmployeeStatus::Resigned->value => 'ลาออก',
    ];

    /** A Thai name counts as missing when either part is empty or only spaces — the same rule on the page and the tile. */
    private const MISSING_THAI_NAME_SQL = "(first_name_th IS NULL OR TRIM(first_name_th) = '' OR last_name_th IS NULL OR TRIM(last_name_th) = '')";

    public function key(): string
    {
        return 'employees.directory';
    }

    public function title(): string
    {
        return 'รายชื่อพนักงาน';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('department_id', Options::departments()),
            ReportFilter::select('section_id', Options::sections()),
            ReportFilter::select('status', Options::fromLabels(self::STATUS_KEYS)),
            ReportFilter::search()->placeholderKey('rep_ph_employee_directory'),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        $search = $filters['search'] ?? null;

        return Employee::query()
            ->with([
                'department:id,code,name,name_th',
                'section:id,name,name_th',
                'position:id,title',
                'manager:id,first_name,last_name,first_name_th,last_name_th',
            ])
            ->when($filters['department_id'] ?? null, fn (Builder $q, mixed $id) => $q->where('department_id', (int) $id))
            ->when($filters['section_id'] ?? null, fn (Builder $q, mixed $id) => $q->where('section_id', (int) $id))
            ->when($filters['status'] ?? null, fn (Builder $q, mixed $status) => $q->where('status', $status))
            ->when(filled($search), fn (Builder $q) => SearchTerms::apply($q, $search, ['code', 'email', 'username', ...SearchTerms::personName()]))
            ->orderBy('code');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('code', 'รหัสพนักงาน', fn (Employee $e) => $e->code)
                ->labelKey('rep_c_employee_code')
                ->linkTo('/employees', fn (Employee $e) => $e->id),
            ReportColumn::text('name_th', 'ชื่อ-นามสกุล (ไทย)', fn (Employee $e) => self::hasThaiName($e) ? trim("{$e->first_name_th} {$e->last_name_th}") : null)
                ->screenOnly(),
            ReportColumn::text('name_en', 'ชื่อ-นามสกุล (อังกฤษ)', fn (Employee $e) => $e->name !== '' ? $e->name : null)->screenOnly(),
            ReportColumn::text('first_name_th', 'ชื่อ (ไทย)', fn (Employee $e) => self::filledOrNull($e->first_name_th))->sheetOnly(),
            ReportColumn::text('last_name_th', 'นามสกุล (ไทย)', fn (Employee $e) => self::filledOrNull($e->last_name_th))->sheetOnly(),
            ReportColumn::text('first_name', 'ชื่อ (อังกฤษ)', fn (Employee $e) => self::filledOrNull($e->first_name))->sheetOnly(),
            ReportColumn::text('last_name', 'นามสกุล (อังกฤษ)', fn (Employee $e) => self::filledOrNull($e->last_name))->sheetOnly(),
            ReportColumn::text('position', 'ตำแหน่ง', fn (Employee $e) => $e->position?->title),
            ReportColumn::localized('section', 'หน่วยงาน', fn (Employee $e) => $e->section ? ['name' => $e->section->name, 'name_th' => $e->section->name_th] : null),
            ReportColumn::localized('department', 'แผนก', fn (Employee $e) => $e->department ? ['name' => $e->department->name, 'name_th' => $e->department->name_th] : null),
            ReportColumn::text('email', 'อีเมล', fn (Employee $e) => self::filledOrNull($e->email))->labelKey('rep_c_email_phone'),
            ReportColumn::text('phone', 'เบอร์โทรศัพท์', fn (Employee $e) => self::filledOrNull($e->phone)),
            ReportColumn::localized('manager', 'หัวหน้างาน', fn (Employee $e) => $e->manager ? ['name' => $e->manager->name, 'name_th' => $e->manager->name_th] : null),
            ReportColumn::date('joined_at', 'เริ่มงาน', fn (Employee $e) => $e->joined_at),
            ReportColumn::enum('status', 'สถานะ', fn (Employee $e) => $e->status, self::STATUS_KEYS, self::STATUS_TH),
            ReportColumn::text('username', 'Username', fn (Employee $e) => self::filledOrNull($e->username)),
        ];
    }

    protected function sheetOrder(): array
    {
        return [
            'code', 'first_name_th', 'last_name_th', 'first_name', 'last_name', 'position', 'section',
            'department', 'email', 'manager', 'joined_at', 'status', 'phone', 'username',
        ];
    }

    /** @return array<string, string> */
    protected function meanings(): array
    {
        return [
            'code' => 'รหัสพนักงานตามที่บันทึกในระบบ',
            'first_name_th' => 'ชื่อภาษาไทย ว่าง = ยังไม่ได้กรอกชื่อไทย',
            'last_name_th' => 'นามสกุลภาษาไทย ว่าง = ยังไม่ได้กรอกนามสกุลไทย',
            'first_name' => 'ชื่อภาษาอังกฤษ',
            'last_name' => 'นามสกุลภาษาอังกฤษ',
            'position' => 'ตำแหน่งปัจจุบันของพนักงาน ว่าง = ไม่ได้ระบุ',
            'section' => 'หน่วยงานที่สังกัด ว่าง = ไม่ได้ระบุหน่วยงาน',
            'department' => 'แผนกที่สังกัด ว่าง = ไม่ได้ระบุแผนก',
            'email' => 'อีเมลของพนักงาน ว่าง = ไม่ได้บันทึก',
            'phone' => 'เบอร์โทรของพนักงาน ว่าง = ไม่ได้บันทึก',
            'manager' => 'ชื่อหัวหน้างานโดยตรง ว่าง = ไม่มีหัวหน้า',
            'joined_at' => 'วันเริ่มงานตามที่บันทึก',
            'status' => 'ลาออก = บันทึกการลาออกแล้ว รวมคนที่วันทำงานวันสุดท้ายยังมาไม่ถึง',
            'username' => 'ชื่อผู้ใช้สำหรับเข้าระบบ ว่าง = ยังไม่มีบัญชี',
        ];
    }

    /**
     * Everyone, the active and the resigned, the leavers whose last day falls in this calendar year,
     * and the active employees still missing a Thai name — one aggregate query over the filtered rows.
     */
    public function summary(Builder $query, array $filters): array
    {
        $active = EmployeeStatus::Active->value;
        $resigned = EmployeeStatus::Resigned->value;
        $counts = (clone $query)->reorder()->toBase()->selectRaw(
            'COUNT(*) AS total, COUNT(DISTINCT department_id) AS departments,'
            .' SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS active,'
            .' SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS resigned,'
            .' SUM(CASE WHEN status = ? AND last_day BETWEEN ? AND ? THEN 1 ELSE 0 END) AS left_this_year,'
            .' SUM(CASE WHEN status = ? AND '.self::MISSING_THAI_NAME_SQL.' THEN 1 ELSE 0 END) AS no_thai_name',
            [$active, $resigned, $resigned, today()->startOfYear()->toDateString(), today()->endOfYear()->toDateString(), $active],
        )->first();

        $total = (int) $counts->total;
        $activeCount = (int) $counts->active;

        return [
            ReportSummary::make('total', 'ทั้งหมด', $total)
                ->withNote(['label_key' => 'rep_n_ed_departments', 'values' => ['n' => (int) $counts->departments]]),
            ReportSummary::make('active', 'ใช้งาน', $activeCount)
                ->withNote($total > 0 ? ['label_key' => 'rep_n_ed_share', 'values' => ['pct' => round($activeCount / $total * 100, 1)]] : null),
            ReportSummary::make('resigned', 'ลาออก', (int) $counts->resigned)
                ->withNote(['label_key' => 'rep_n_ed_left_this_year', 'values' => ['n' => (int) $counts->left_this_year]]),
            ReportSummary::make('no_thai_name', 'ยังไม่มีชื่อไทย', (int) $counts->no_thai_name, 'amber')
                ->withNote(['label_key' => 'rep_n_ed_active_only']),
        ];
    }

    private static function hasThaiName(Employee $employee): bool
    {
        return filled($employee->first_name_th) && filled($employee->last_name_th);
    }

    private static function filledOrNull(?string $value): ?string
    {
        return filled($value) ? $value : null;
    }
}
