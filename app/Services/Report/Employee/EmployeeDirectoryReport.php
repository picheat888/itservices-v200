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
use Illuminate\Database\Eloquent\Model;

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

    /** What a blank name part may hold: spaces, tabs and line breaks — one rule for each row (isBlank) and the tile (blankSql). */
    private const BLANK_CHARACTERS = " \t\n\r";

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

    /**
     * The filters the tiles and the list share; สถานะ narrows only the list (query()), on the page and in the files.
     *
     * @param  array<string, mixed>  $filters
     */
    private function filtered(array $filters): Builder
    {
        $search = $filters['search'] ?? null;

        return Employee::query()
            ->when($filters['department_id'] ?? null, fn (Builder $q, mixed $id) => $q->where('department_id', (int) $id))
            ->when($filters['section_id'] ?? null, fn (Builder $q, mixed $id) => $q->where('section_id', (int) $id))
            ->when(filled($search), fn (Builder $q) => SearchTerms::apply($q, $search, ['code', 'email', 'username', ...SearchTerms::personName()]));
    }

    public function query(User $viewer, array $filters): Builder
    {
        return $this->filtered($filters)
            ->with([
                'department:id,code,name,name_th',
                'section:id,name,name_th',
                'position:id,title',
                'manager:id,first_name,last_name,first_name_th,last_name_th',
            ])
            ->when($filters['status'] ?? null, fn (Builder $q, mixed $status) => $q->where('status', $status))
            ->orderBy('code');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('code', 'รหัสพนักงาน', fn (Employee $e) => $e->code)
                ->labelKey('rep_c_employee_code')
                ->linkTo('/employees', fn (Employee $e) => $e->id),
            ReportColumn::text('name_th', 'ชื่อ-นามสกุล (ไทย)', fn (Employee $e) => self::thaiName($e))->screenOnly(),
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
     * Each row also says whether its Thai name is missing or half filled, so the page marks the rows the tile counts.
     *
     * @return array<string, mixed>
     */
    public function row(Model $model): array
    {
        /** @var Employee $model */
        return [...parent::row($model), '_thai_name_missing' => ! self::hasThaiName($model)];
    }

    /**
     * Everyone, the active and the resigned, the leavers whose last day has passed this calendar year
     * (gone the day after it, as Employee::hasLeft()), and the active employees still missing a Thai name —
     * one aggregate query over the department, section and search; สถานะ narrows only the list.
     */
    public function summary(Builder $query, array $filters): array
    {
        $active = EmployeeStatus::Active->value;
        $resigned = EmployeeStatus::Resigned->value;
        [$firstBlank, $firstBindings] = self::blankSql('first_name_th');
        [$lastBlank, $lastBindings] = self::blankSql('last_name_th');
        $counts = $this->filtered($filters)->toBase()->selectRaw(
            'COUNT(*) AS total, COUNT(DISTINCT department_id) AS departments,'
            .' SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS active,'
            .' SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS resigned,'
            .' SUM(CASE WHEN status = ? AND last_day >= ? AND last_day < ? THEN 1 ELSE 0 END) AS left_this_year,'
            ." SUM(CASE WHEN status = ? AND ({$firstBlank} OR {$lastBlank}) THEN 1 ELSE 0 END) AS no_thai_name",
            [
                $active, $resigned, $resigned, today()->startOfYear()->toDateString(), today()->toDateString(),
                $active, ...$firstBindings, ...$lastBindings,
            ],
        )->first();

        $total = (int) $counts->total;
        $activeCount = (int) $counts->active;
        $departments = (int) $counts->departments;

        return [
            ReportSummary::make('total', 'ทั้งหมด', $total)
                ->withNote(['label_key' => $departments === 1 ? 'rep_n_ed_departments_one' : 'rep_n_ed_departments', 'values' => ['n' => $departments]]),
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
        return ! self::isBlank($employee->first_name_th) && ! self::isBlank($employee->last_name_th);
    }

    /** The Thai first and last name, or the one part there is; null when both are blank. */
    private static function thaiName(Employee $employee): ?string
    {
        $parts = array_filter([$employee->first_name_th, $employee->last_name_th], fn (?string $part) => ! self::isBlank($part));

        return $parts === [] ? null : implode(' ', array_map(fn (string $part) => trim($part, self::BLANK_CHARACTERS), $parts));
    }

    private static function isBlank(?string $value): bool
    {
        return $value === null || trim($value, self::BLANK_CHARACTERS) === '';
    }

    /**
     * SQL true when the column is blank by isBlank()'s rule: tabs and line breaks dropped, then spaces trimmed.
     *
     * @return array{0: string, 1: list<string>}
     */
    private static function blankSql(string $column): array
    {
        return ["({$column} IS NULL OR TRIM(REPLACE(REPLACE(REPLACE({$column}, ?, ''), ?, ''), ?, '')) = '')", ["\t", "\n", "\r"]];
    }

    private static function filledOrNull(?string $value): ?string
    {
        return self::isBlank($value) ? null : $value;
    }
}
