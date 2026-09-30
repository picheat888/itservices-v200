<?php

namespace App\Services\Report\Employee;

use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * "พนักงานเข้าใหม่และลาออก" (Report Center → Employees): who starts and who leaves in the date
 * range (this month by default), in date order.
 *
 * - A joiner's "preparation" reads their onboarding requests (filed from Add Employee):
 *   preparing while any is still pending/approved, ready once none is open, none when HR
 *   filed nothing.
 * - A leaver shows how many assets are still in their name — what IT has to collect.
 * - Someone who both joins and leaves inside the range is listed once, as a leaver.
 */
class JoinersLeaversReport extends TabularReport
{
    private const KIND_KEYS = ['joined' => 'rep_kind_joined', 'left' => 'rep_kind_left'];

    private const KIND_TH = ['joined' => 'เข้าใหม่', 'left' => 'ลาออก'];

    private const PREP_KEYS = ['none' => 'rep_prep_none', 'preparing' => 'rep_prep_preparing', 'ready' => 'rep_prep_ready'];

    private const PREP_TH = ['none' => 'ไม่มีคำขอ', 'preparing' => 'กำลังเตรียม', 'ready' => 'พร้อม'];

    public function key(): string
    {
        return 'employees.joiners_leavers';
    }

    public function title(): string
    {
        return 'พนักงานเข้าใหม่และลาออก';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfMonth()->toDateString()),
            ReportFilter::date('to', today()->endOfMonth()->toDateString()),
            ReportFilter::select('kind', Options::fromLabels(self::KIND_KEYS)),
            ReportFilter::select('department_id', Options::departments()),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        [$from, $to] = $this->range($filters);
        $leftInRange = "(status = 'resigned' AND last_day IS NOT NULL AND last_day BETWEEN ? AND ?)";
        $onboarding = fn (array $statuses) => ServiceRequest::query()
            ->selectRaw('COUNT(*)')
            ->whereColumn('service_requests.employee_id', 'employees.id')
            ->where('origin', 'onboarding')
            ->when($statuses !== [], fn ($q) => $q->whereIn('status', $statuses));

        return Employee::query()
            ->select('employees.*')
            ->selectRaw("CASE WHEN {$leftInRange} THEN 'left' ELSE 'joined' END as movement_kind", [$from, $to])
            ->selectRaw("CASE WHEN {$leftInRange} THEN last_day ELSE joined_at END as movement_date", [$from, $to])
            ->selectSub($onboarding([]), 'onboarding_total')
            ->selectSub($onboarding(['pending', 'approved']), 'onboarding_open')
            ->selectSub(Asset::query()->selectRaw('COUNT(*)')->whereColumn('assets.owner_employee_id', 'employees.id'), 'assets_held')
            ->with(['department:id,name,name_th', 'position:id,title'])
            ->where(fn (Builder $q) => match ($filters['kind']) {
                'joined' => $q->whereBetween('joined_at', [$from, $to])->whereRaw("NOT ({$leftInRange})", [$from, $to]),
                'left' => $q->whereRaw($leftInRange, [$from, $to]),
                default => $q->whereBetween('joined_at', [$from, $to])->orWhereRaw($leftInRange, [$from, $to]),
            })
            ->when($filters['department_id'], fn (Builder $q, $id) => $q->where('department_id', (int) $id))
            ->orderBy('movement_date')
            ->orderBy('code');
    }

    public function columns(): array
    {
        return [
            ReportColumn::enum('movement_kind', 'รายการ', fn (Employee $e) => $e->getAttribute('movement_kind'), self::KIND_KEYS, self::KIND_TH),
            ReportColumn::date('movement_date', 'วันที่', fn (Employee $e) => $e->getAttribute('movement_date') ? Carbon::parse($e->getAttribute('movement_date')) : null),
            ReportColumn::text('employee_code', 'รหัสพนักงาน', fn (Employee $e) => $e->code),
            ReportColumn::localized('employee', 'ชื่อ', fn (Employee $e) => ['name' => $e->name, 'name_th' => $e->name_th]),
            ReportColumn::localized('department', 'แผนก', fn (Employee $e) => $e->department ? ['name' => $e->department->name, 'name_th' => $e->department->name_th] : null),
            ReportColumn::text('position', 'ตำแหน่ง', fn (Employee $e) => $e->position?->title),
            ReportColumn::enum('prep_status', 'เตรียมเครื่อง', fn (Employee $e) => $this->prepStatus($e), self::PREP_KEYS, self::PREP_TH),
            ReportColumn::text('onboarding', 'คำขอ onboarding (เสร็จ/ทั้งหมด)', fn (Employee $e) => $this->onboardingProgress($e)),
            ReportColumn::number('assets_held', 'ทรัพย์สินที่ถือ', fn (Employee $e) => (int) $e->getAttribute('assets_held')),
            ReportColumn::text('resign_reason', 'เหตุผลที่ลาออก', fn (Employee $e) => $e->getAttribute('movement_kind') === 'left' ? $e->resign_reason : null),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $rows = (clone $query)->setEagerLoads([])->get();
        $joiners = $rows->where('movement_kind', 'joined');

        return [
            ReportSummary::make('total', 'ทั้งหมด', $rows->count()),
            ReportSummary::make('joined', 'เข้าใหม่', $joiners->count(), 'green'),
            ReportSummary::make('left', 'ลาออก', $rows->where('movement_kind', 'left')->count(), 'amber'),
            ReportSummary::make('preparing', 'ยังเตรียมเครื่องไม่เสร็จ', $joiners->filter(fn (Employee $e) => $this->prepStatus($e) === 'preparing')->count(), 'red'),
        ];
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

    /** "done/total" for joiners with onboarding requests, where done = no longer open. */
    private function onboardingProgress(Employee $employee): ?string
    {
        $total = (int) $employee->getAttribute('onboarding_total');
        if ($employee->getAttribute('movement_kind') !== 'joined' || $total === 0) {
            return null;
        }

        return ($total - (int) $employee->getAttribute('onboarding_open'))."/{$total}";
    }

    /**
     * The range as whole-day datetime strings, reversed reads right. Spelled out to the second
     * so the last day matches however the date is stored (DATE on MariaDB, a midnight
     * timestamp string on SQLite).
     *
     * @param  array<string, mixed>  $filters
     * @return array{0: string, 1: string}
     */
    private function range(array $filters): array
    {
        $from = Carbon::parse($filters['from'])->toDateString();
        $to = Carbon::parse($filters['to'])->toDateString();
        [$first, $last] = $from <= $to ? [$from, $to] : [$to, $from];

        return ["{$first} 00:00:00", "{$last} 23:59:59"];
    }
}
