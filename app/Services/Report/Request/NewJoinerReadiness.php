<?php

namespace App\Services\Report\Request;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestOrigin;
use App\Enums\Request\RequestType;
use App\Models\Employee\Employee;
use App\Models\Request\ServiceRequest;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * "พนักงานใหม่พร้อมก่อนวันเริ่มงานไหม" on the IT pending report: each joiner's onboarding requests
 * against their start day (employees.joined_at), within 30 days either side of today.
 */
final class NewJoinerReadiness
{
    use RequestLabels;

    public const WINDOW_DAYS = 30;

    private const OPEN = ['pending', 'approved'];

    /** Urgency order: not ready past the start day, not ready before it, ready late, ready on time. */
    private const RANK = ['open_started' => 0, 'open' => 1, 'late' => 2, 'on_time' => 3];

    /**
     * @return array{
     *     from: string, to: string,
     *     counts: array{on_time: int, late: int, open: int, past_start: int, before_start: int},
     *     types: list<string>,
     *     rows: list<array<string, mixed>>,
     *     left_early: list<array<string, mixed>>
     * }
     */
    public function build(?int $departmentId): array
    {
        $from = today()->subDays(self::WINDOW_DAYS);
        $to = today()->addDays(self::WINDOW_DAYS);

        $joiners = Employee::query()
            ->with('department')
            ->whereBetween('joined_at', [$from->toDateString(), $to->toDateString()])
            ->when($departmentId, fn (Builder $q, int $id) => $q->where('department_id', $id))
            ->whereIn('id', ServiceRequest::query()->select('employee_id')->where('origin', RequestOrigin::Onboarding->value))
            ->get();

        $requests = ServiceRequest::query()
            ->with(['ticket.assignee:id,name', 'approvals' => fn (HasMany $q) => $q->where('status', ApprovalStatus::Current->value)])
            ->where('origin', RequestOrigin::Onboarding->value)
            ->whereIn('employee_id', $joiners->pluck('id'))
            ->orderBy('id')
            ->get()
            ->groupBy('employee_id');

        $rows = [];
        $leftEarly = [];
        foreach ($joiners as $joiner) {
            $own = $requests->get($joiner->id, collect());
            $row = $this->row($joiner, $own);
            if ($joiner->status?->value === 'resigned') {
                if ($row['open'] > 0) {
                    $leftEarly[] = $row;
                }

                continue;
            }
            // Nothing was delivered or is still coming (every request rejected or cancelled): nothing to be ready for.
            if ($row['verdict'] !== null) {
                $rows[] = $row;
            }
        }

        usort($rows, fn (array $a, array $b) => $this->rank($a) <=> $this->rank($b) ?: strcmp($a['joined_at'], $b['joined_at']));
        usort($leftEarly, fn (array $a, array $b) => strcmp($a['joined_at'], $b['joined_at']));

        $verdicts = array_count_values(array_map(fn (array $r) => $r['verdict'], $rows));
        $pastStart = count(array_filter($rows, fn (array $r) => $r['verdict'] === 'open' && $r['started']));

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'counts' => [
                'on_time' => $verdicts['on_time'] ?? 0,
                'late' => $verdicts['late'] ?? 0,
                'open' => $verdicts['open'] ?? 0,
                'past_start' => $pastStart,
                'before_start' => ($verdicts['open'] ?? 0) - $pastStart,
            ],
            'types' => $this->types([...$rows, ...$leftEarly]),
            'rows' => $rows,
            'left_early' => $leftEarly,
        ];
    }

    /**
     * One joiner and their onboarding requests. verdict: open (any still pending or approved), late
     * (all delivered, one after the start day), on_time, or null when none was or will be delivered.
     *
     * @param  Collection<int, ServiceRequest>  $requests
     * @return array<string, mixed>
     */
    private function row(Employee $joiner, Collection $requests): array
    {
        $start = Carbon::parse($joiner->joined_at)->startOfDay();
        $open = $requests->filter(fn (ServiceRequest $r) => in_array($r->status->value, self::OPEN, true));
        $done = $requests->filter(fn (ServiceRequest $r) => $r->status->value === 'completed' && $r->completed_at !== null);
        $lateDays = $done->map(fn (ServiceRequest $r) => self::wholeDays($start, $r->completed_at))->filter(fn (int $d) => $d > 0);

        $verdict = match (true) {
            $open->isNotEmpty() => 'open',
            $lateDays->isNotEmpty() => 'late',
            $done->isNotEmpty() => 'on_time',
            default => null,
        };

        return [
            'employee_id' => (int) $joiner->id,
            'code' => (string) $joiner->code,
            'name' => $joiner->name,
            'name_th' => $joiner->name_th,
            'department' => $joiner->department ? ['name' => $joiner->department->name, 'name_th' => $joiner->department->name_th] : null,
            'joined_at' => $start->toDateString(),
            'last_day' => $joiner->last_day?->toDateString(),
            'days_to_start' => self::wholeDays(today(), $start),
            'started' => $start->lte(today()),
            'verdict' => $verdict,
            'late_days' => $lateDays->isEmpty() ? 0 : (int) $lateDays->max(),
            'open' => $open->count(),
            'pending' => $open->filter(fn (ServiceRequest $r) => $r->status->value === 'pending')->count(),
            'requests' => $requests->map(fn (ServiceRequest $r) => [
                'id' => (int) $r->id,
                'reference' => $r->reference,
                'type' => $r->type->value,
                'status' => $r->status->value,
                'completed_on' => $r->completed_at?->toDateString(),
                'late_days' => $r->completed_at ? max(0, self::wholeDays($start, $r->completed_at)) : 0,
                'has_ticket' => $r->ticket_id !== null,
                'assignee' => $r->ticket?->assignee?->name,
                'current_approver' => $this->currentApprover($r),
            ])->values()->all(),
        ];
    }

    private function currentApprover(ServiceRequest $request): ?string
    {
        $step = $request->approvals->first();

        return $step ? ($step->approver_name ?: $step->label) : null;
    }

    /** @param array<string, mixed> $row */
    private function rank(array $row): int
    {
        $key = $row['verdict'] === 'open' && $row['started'] ? 'open_started' : $row['verdict'];

        return self::RANK[$key];
    }

    /**
     * The request types any listed joiner has, in the Request module's order — the table's columns.
     *
     * @param  list<array<string, mixed>>  $rows
     * @return list<string>
     */
    private function types(array $rows): array
    {
        $present = [];
        foreach ($rows as $row) {
            foreach ($row['requests'] as $request) {
                $present[$request['type']] = true;
            }
        }

        return array_values(array_filter(array_map(fn (RequestType $t) => $t->value, RequestType::cases()), fn (string $t) => isset($present[$t])));
    }
}
