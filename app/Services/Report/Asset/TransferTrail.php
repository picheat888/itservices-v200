<?php

namespace App\Services\Report\Asset;

use App\Enums\Asset\AssetStatus;
use App\Enums\Asset\AssetTransferKind;
use App\Enums\Employee\EmployeeStatus;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\AuditLog;
use App\Models\Employee\Employee;
use App\Models\Stock\Warehouse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Reads the asset custody trail for "ประวัติโอนย้ายและรับคืน": what each end of a row is, what became
 * of each hand-over, and which assets wait to be accepted or handed back right now.
 */
class TransferTrail
{
    public const ACCEPTED_ACTION = 'Accepted asset';

    public const RETURN_ACTION = 'Requested asset return';

    public const RESIGN_ACTION = 'Recorded resignation';

    /**
     * Employees behind the codes on a set of rows, with their department.
     *
     * @param  Collection<int, AssetTransfer>  $rows
     * @return array<string, array{name: string, department: array{id: int, name: string, name_th: ?string}|null, resigned: bool}>
     */
    public static function people(Collection $rows): array
    {
        $codes = $rows->flatMap(fn (AssetTransfer $t) => [$t->from_owner, $t->to_owner])->filter()->unique()->values();
        if ($codes->isEmpty()) {
            return [];
        }

        return Employee::query()->whereIn('code', $codes)->with('department:id,code,name,name_th')
            ->get(['id', 'code', 'first_name', 'last_name', 'first_name_th', 'last_name_th', 'department_id', 'status'])
            ->mapWithKeys(fn (Employee $e) => [$e->code => [
                'name' => $e->name,
                'name_th' => $e->name_th,
                'department' => $e->department ? ['id' => $e->department->id, 'code' => $e->department->code, 'name' => $e->department->name, 'name_th' => $e->department->name_th] : null,
                'resigned' => $e->status === EmployeeStatus::Resigned,
            ]])
            ->all();
    }

    /**
     * Each asset's brand name, from its record (the trail only keeps the model).
     *
     * @param  Collection<int, int>  $assetIds
     * @return array<int, string>
     */
    public static function brands(Collection $assetIds): array
    {
        if ($assetIds->isEmpty()) {
            return [];
        }

        return Asset::query()->whereIn('assets.id', $assetIds)
            ->join('brands', 'brands.id', '=', 'assets.brand_id')
            ->pluck('brands.name', 'assets.id')
            ->all();
    }

    /** @return list<string> */
    public static function warehouseNames(): array
    {
        return Warehouse::query()->pluck('name')->all();
    }

    /**
     * Employee (code on file), warehouse (name on file), location (a relocation) or a shared-use label.
     *
     * @param  array<string, mixed>  $people
     * @param  list<string>  $warehouses
     */
    public static function partyType(?string $value, AssetTransferKind $kind, array $people, array $warehouses): ?string
    {
        return match (true) {
            $value === null || $value === '' => null,
            isset($people[$value]) => 'employee',
            in_array($value, $warehouses, true) => 'warehouse',
            $kind === AssetTransferKind::Relocate => 'location',
            default => 'shared',
        };
    }

    /**
     * Each hand-over's outcome and hours (to accept, or waited so far); a return's hours since it was asked.
     *
     * @param  Collection<int, AssetTransfer>  $rows
     * @param  array<string, mixed>  $people
     * @return array<int, array{outcome: ?string, hours: ?float, at: ?Carbon}>
     */
    public static function outcomes(Collection $rows, array $people): array
    {
        if ($rows->isEmpty()) {
            return [];
        }
        $assetIds = $rows->pluck('asset_id')->unique()->values();
        $trail = AssetTransfer::query()->whereIn('asset_id', $assetIds)->orderBy('created_at')->orderBy('id')
            ->get(['id', 'asset_id', 'kind', 'created_at'])->groupBy('asset_id');
        $audits = AuditLog::query()
            ->where('subject_type', AuditLog::subjectType(new Asset))
            ->whereIn('subject_id', $assetIds)
            ->whereIn('action', [self::ACCEPTED_ACTION, self::RETURN_ACTION])
            ->orderBy('created_at')
            ->get(['subject_id', 'action', 'created_at'])
            ->groupBy('subject_id');
        $statuses = Asset::query()->whereIn('id', $assetIds)->pluck('status', 'id');
        $now = now();

        $out = [];
        foreach ($rows as $row) {
            $steps = $trail->get($row->asset_id, collect())->values();
            $index = $steps->search(fn (AssetTransfer $s) => $s->id === $row->id);
            $next = $index === false ? null : $steps->get($index + 1);
            $previous = $index === false || $index === 0 ? null : $steps->get($index - 1);
            $logs = $audits->get($row->asset_id, collect());

            $out[$row->id] = match ($row->kind) {
                AssetTransferKind::Handover => self::handoverOutcome($row, $next, $logs, $people, $statuses->get($row->asset_id), $now),
                AssetTransferKind::Return => self::returnOutcome($row, $previous, $logs),
                default => ['outcome' => null, 'hours' => null, 'at' => null],
            };
        }

        return $out;
    }

    /**
     * @param  Collection<int, AuditLog>  $logs
     * @param  array<string, mixed>  $people
     * @return array{outcome: ?string, hours: ?float, at: ?Carbon}
     */
    private static function handoverOutcome(AssetTransfer $row, ?AssetTransfer $next, Collection $logs, array $people, mixed $status, Carbon $now): array
    {
        if (! isset($people[$row->to_owner])) {
            return ['outcome' => 'not_needed', 'hours' => null, 'at' => null];
        }
        $accepted = $logs->first(fn (AuditLog $log) => $log->action === self::ACCEPTED_ACTION
            && $log->created_at->gte($row->created_at)
            && ($next === null || $log->created_at->lt($next->created_at)));

        return match (true) {
            $accepted !== null => ['outcome' => 'accepted', 'hours' => self::hours($row->created_at, $accepted->created_at), 'at' => $accepted->created_at],
            $next === null && $status === AssetStatus::PendingAcceptance => ['outcome' => 'waiting', 'hours' => self::hours($row->created_at, $now), 'at' => null],
            $next?->kind === AssetTransferKind::Recall => ['outcome' => 'recalled', 'hours' => null, 'at' => null],
            default => ['outcome' => 'never_accepted', 'hours' => null, 'at' => null],
        };
    }

    /**
     * @param  Collection<int, AuditLog>  $logs
     * @return array{outcome: ?string, hours: ?float, at: ?Carbon}
     */
    private static function returnOutcome(AssetTransfer $row, ?AssetTransfer $previous, Collection $logs): array
    {
        $asked = $logs->last(fn (AuditLog $log) => $log->action === self::RETURN_ACTION
            && $log->created_at->lte($row->created_at)
            && ($previous === null || $log->created_at->gte($previous->created_at)));

        return $asked === null
            ? ['outcome' => null, 'hours' => null, 'at' => null]
            : ['outcome' => 'returned', 'hours' => self::hours($asked->created_at, $row->created_at), 'at' => $asked->created_at];
    }

    /**
     * How the hand-overs ended up, by calendar days to accept, plus the median hours.
     *
     * @param  Collection<int, AssetTransfer>  $handovers
     * @param  array<int, array{outcome: ?string, hours: ?float, at: ?Carbon}>  $outcomes
     * @return array{to_people: int, to_shared: int, same_day: int, next_day: int, later: int, later_weekend: int, waiting: int, recalled: int, never_accepted: int, median_hours: ?float, within_2_days: int}
     */
    public static function acceptance(Collection $handovers, array $outcomes): array
    {
        $byOutcome = fn (string $outcome) => $handovers->filter(fn (AssetTransfer $t) => ($outcomes[$t->id]['outcome'] ?? null) === $outcome);
        $accepted = $byOutcome('accepted');
        $dayGap = fn (AssetTransfer $t) => (int) $t->created_at->copy()->startOfDay()->diffInDays($outcomes[$t->id]['at']->copy()->startOfDay());
        $later = $accepted->filter(fn (AssetTransfer $t) => $dayGap($t) >= 2);
        $hours = $accepted->map(fn (AssetTransfer $t) => $outcomes[$t->id]['hours'])->sort()->values();

        return [
            'to_people' => $handovers->count() - $byOutcome('not_needed')->count(),
            'to_shared' => $byOutcome('not_needed')->count(),
            'same_day' => $accepted->filter(fn (AssetTransfer $t) => $dayGap($t) === 0)->count(),
            'next_day' => $accepted->filter(fn (AssetTransfer $t) => $dayGap($t) === 1)->count(),
            'later' => $later->count(),
            // Sent on a Friday, accepted on the Monday after: only the weekend in between.
            'later_weekend' => $later->filter(fn (AssetTransfer $t) => $t->created_at->isFriday() && $dayGap($t) === 3)->count(),
            'waiting' => $byOutcome('waiting')->count(),
            'recalled' => $byOutcome('recalled')->count(),
            'never_accepted' => $byOutcome('never_accepted')->count(),
            'median_hours' => $hours->isEmpty() ? null : round((float) $hours->median(), 1),
            'within_2_days' => $hours->filter(fn (float $h) => $h <= 48)->count(),
        ];
    }

    /**
     * Assets waiting now to be accepted or received back, longest wait first in each group.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array<string, mixed>>
     */
    public static function waiting(array $filters): array
    {
        $assets = Asset::query()
            ->whereIn('status', [AssetStatus::PendingAcceptance->value, AssetStatus::PendingReturn->value])
            ->when($filters['category_id'] ?? null, fn (Builder $q, $id) => $q->where('category_id', (int) $id))
            ->when($filters['department_id'] ?? null, fn (Builder $q, $id) => $q->whereHas('ownerEmployee', fn (Builder $e) => $e->where('department_id', (int) $id)))
            ->with(['brand:id,name', 'model:id,name', 'category:id,name,name_th', 'ownerEmployee:id,code,first_name,last_name,first_name_th,last_name_th,department_id', 'ownerEmployee.department:id,code,name,name_th'])
            ->get(['id', 'asset_code', 'status', 'brand_id', 'model_id', 'category_id', 'owner_employee_id', 'owner', 'updated_at']);
        if ($assets->isEmpty()) {
            return [];
        }

        $handedAt = AssetTransfer::query()->whereIn('asset_id', $assets->modelKeys())->where('kind', AssetTransferKind::Handover->value)
            ->selectRaw('asset_id, MAX(created_at) as at')->groupBy('asset_id')->pluck('at', 'asset_id');
        $asked = AuditLog::query()->where('subject_type', AuditLog::subjectType(new Asset))->whereIn('subject_id', $assets->modelKeys())
            ->where('action', self::RETURN_ACTION)->selectRaw('subject_id, MAX(created_at) as at')->groupBy('subject_id')->pluck('at', 'subject_id');
        $resigned = AuditLog::query()->where('subject_type', AuditLog::subjectType(new Employee))
            ->whereIn('subject_id', $assets->pluck('owner_employee_id')->filter()->unique())
            ->where('action', self::RESIGN_ACTION)->selectRaw('subject_id, MAX(created_at) as at')->groupBy('subject_id')->pluck('at', 'subject_id');
        $now = now();

        return $assets
            ->map(function (Asset $asset) use ($handedAt, $asked, $resigned, $now) {
                $handed = $handedAt->has($asset->id) ? Carbon::parse($handedAt->get($asset->id)) : null;
                [$since, $cause] = $asset->status === AssetStatus::PendingAcceptance
                    ? [$handed, $handed ? 'handover' : null]
                    : self::returnSince($handed, $asked->get($asset->id), $resigned->get($asset->owner_employee_id));
                $since ??= $asset->updated_at;
                $holder = $asset->ownerEmployee;

                return [
                    'id' => $asset->id,
                    'code' => $asset->asset_code,
                    'brand' => $asset->brand?->name,
                    'model' => $asset->model?->name,
                    'category' => $asset->category ? ['name' => $asset->category->name, 'name_th' => $asset->category->name_th] : null,
                    'status' => $asset->status->value,
                    'holder' => $holder ? [
                        'code' => $holder->code,
                        'name' => $holder->name,
                        'name_th' => $holder->name_th,
                        'department' => $holder->department ? ['name' => $holder->department->name, 'name_th' => $holder->department->name_th] : null,
                    ] : null,
                    'owner_label' => $holder ? null : $asset->owner,
                    'since' => $since->format('Y-m-d H:i'),
                    'cause' => $cause,
                    'days' => (int) floor($since->diffInDays($now, true)),
                ];
            })
            ->sortBy([
                fn (array $a, array $b) => ($a['status'] === 'pending_acceptance' ? 0 : 1) <=> ($b['status'] === 'pending_acceptance' ? 0 : 1),
                fn (array $a, array $b) => $a['since'] <=> $b['since'],
            ])
            ->values()
            ->all();
    }

    /**
     * The later of the return request and the holder's resignation, if after the last hand-over.
     *
     * @return array{0: ?Carbon, 1: ?string}
     */
    private static function returnSince(?Carbon $handed, ?string $asked, ?string $resigned): array
    {
        $candidates = collect([
            'request' => $asked ? Carbon::parse($asked) : null,
            'resign' => $resigned ? Carbon::parse($resigned) : null,
        ])->filter(fn (?Carbon $at) => $at !== null && ($handed === null || $at->gte($handed)))->sort();

        return $candidates->isEmpty() ? [null, null] : [$candidates->last(), $candidates->keys()->last()];
    }

    private static function hours(Carbon $from, Carbon $to): float
    {
        return round($from->diffInMinutes($to, true) / 60, 1);
    }
}
