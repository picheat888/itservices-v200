<?php

// Asset lists: the register, the transfer log, the contract form's asset picker and contract options, the recipient check, and "mine".

namespace App\Services\Asset;

use App\Enums\Asset\AssetStatus;
use App\Enums\Asset\AssetTransferKind;
use App\Enums\Contract\ContractType;
use App\Enums\Employee\EmployeeStatus;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\Contract\Contract;
use App\Models\Employee\Employee;
use App\Models\User;
use App\Support\SearchTerms;
use App\Support\SystemTime;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;

class AssetListService
{
    /** The source filter's extra value: rented assets that still need a contract (Asset::rentedUnlinked). */
    public const SOURCE_RENTED_UNLINKED = 'rented_unlinked';

    /** What an asset row renders with. */
    private const ROW_RELATIONS = ['contract.vendor', 'location', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee.position', 'ownerEmployee.department', 'latestHandover'];

    /**
     * The register, newest first, searched and filtered by type / source / status / warehouse (type and warehouse by name).
     *
     * @param  array{search: mixed, type: ?string, source: mixed, status: ?string, warehouse: ?string, per_page: int}  $filters
     */
    public function page(array $filters): LengthAwarePaginator
    {
        $query = Asset::query()->with(self::ROW_RELATIONS)->latest('id');

        SearchTerms::apply($query, $filters['search'], [
            'asset_code', 'tag', 'serial',
            SearchTerms::related('model', ['name']),
            // Owner is a shared label on the asset, or the holding employee
            'owner',
            SearchTerms::related('brand', ['name']),
            SearchTerms::related('location', ['name']),
            SearchTerms::related('contract', ['code']),
            SearchTerms::related('ownerEmployee', ['code', ...SearchTerms::personName(), SearchTerms::related('department', ['name', 'name_th'])]),
        ]);
        if ($filters['type'] !== null) {
            $query->whereHas('category', fn ($c) => $c->where('name', $filters['type']));
        }
        $source = is_string($filters['source']) ? $filters['source'] : null;
        if ($source === self::SOURCE_RENTED_UNLINKED) {
            $query->rentedUnlinked();
        } elseif ($source !== null) {
            $query->where('source', $source);
        }
        if ($filters['status'] !== null) {
            $query->where('status', $filters['status']);
        }
        if ($filters['warehouse'] !== null) {
            $query->whereHas('warehouse', fn ($w) => $w->where('name', $filters['warehouse']));
        }

        return $query->paginate($filters['per_page']);
    }

    /**
     * The contract form's picker: free assets that are not written off, plus those on this contract (listed first).
     *
     * @return array{page: LengthAwarePaginator, rows: list<array<string, mixed>>}
     */
    public function linkable(?int $contractId, mixed $search): array
    {
        $query = Asset::query()
            ->with(['brand', 'model', 'category'])
            ->where(fn ($q) => $q->where(fn ($free) => $free->whereNull('contract_id')->where('status', '!=', AssetStatus::Writeoff))
                ->when($contractId, fn ($w) => $w->orWhere('contract_id', $contractId)));
        SearchTerms::apply($query, $search, [
            'asset_code',
            SearchTerms::related('brand', ['name']),
            SearchTerms::related('model', ['name']),
            SearchTerms::related('category', ['name']),
        ]);
        if ($contractId) {
            $query->orderByRaw('CASE WHEN contract_id = ? THEN 0 ELSE 1 END', [$contractId]);
        }
        $page = $query->orderBy('asset_code')->paginate(20);

        return [
            'page' => $page,
            'rows' => collect($page->items())->map(fn (Asset $a) => [
                'id' => $a->id,
                'asset_code' => $a->asset_code,
                'name' => trim(($a->brand?->name ?? '').' '.($a->model?->name ?? '')) ?: $a->category?->name,
                'type' => $a->category?->name,
                'status' => $a->status->value,
                'on_contract' => $contractId !== null && (int) $a->contract_id === $contractId,
            ])->all(),
        ];
    }

    /**
     * Hardware contracts for the asset form (only they may hold assets); closed ones are offered only as the current contract.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function contractOptions(): Collection
    {
        return Contract::query()
            ->where('type', ContractType::Hardware)
            ->with('vendor')
            ->orderBy('code')
            ->get()
            ->map(fn (Contract $c) => [
                'id' => $c->id,
                'code' => $c->code,
                'vendor' => $c->vendor?->name,
                'vendor_th' => $c->vendor?->name_th,
                'details' => $c->details,
                'end_date' => $c->end_date?->toDateString(),
                'closed' => $c->cancelled_at !== null || $c->expired_at !== null,
            ]);
    }

    /**
     * Active employees who cannot accept a hand-over (no linked account), as id => 'no_account'.
     *
     * @return Collection<int, string>
     */
    public function recipientReadiness(): Collection
    {
        return Employee::where('status', EmployeeStatus::Active->value)
            ->whereNotIn('id', User::whereNotNull('employee_id')->select('employee_id'))
            ->pluck('id')
            ->mapWithKeys(fn (int $id) => [$id => 'no_account']);
    }

    /**
     * The assets the user's linked employee holds, newest first; none when the account has no employee.
     *
     * @return EloquentCollection<int, Asset>
     */
    public function mine(?User $user): EloquentCollection
    {
        $employee = $user?->linkedEmployee();
        if ($employee === null) {
            return new EloquentCollection;
        }

        return Asset::query()
            ->with(self::ROW_RELATIONS)
            ->where('owner_employee_id', $employee->id)
            ->latest('id')
            ->get();
    }

    /**
     * Ownership changes across all assets, newest first (location corrections stay on each asset's own history).
     *
     * @return array{page: LengthAwarePaginator, rows: Collection<int, array<string, mixed>>}
     */
    public function transfers(mixed $search, int $perPage): array
    {
        $page = AssetTransfer::with('performer.employee:id,first_name_th,last_name_th')->whereNot('kind', AssetTransferKind::Relocate)
            ->searchFor($search)
            ->latest()->latest('id')
            ->paginate($perPage);
        $rows = collect($page->items());
        $names = AssetTransfer::employeeNamesFor($rows);
        $namesTh = AssetTransfer::employeeThaiNamesFor($rows);

        return [
            'page' => $page,
            'rows' => $rows->map(fn (AssetTransfer $tr) => [
                'id' => $tr->id,
                // To the minute: several moves of one asset can share a day
                'date' => SystemTime::dateTime($tr->created_at),
                // The asset as it was named then, plus the id to open the record now
                'asset_id' => $tr->asset_id,
                'asset_tag' => $tr->asset_tag,
                'asset_model' => $tr->asset_model,
                'kind' => $tr->kind?->value,
                'from_owner' => $tr->from_owner,
                'to_owner' => $tr->to_owner,
                // Set only when that end was an employee
                'from_name' => $names[$tr->from_owner] ?? null,
                'to_name' => $names[$tr->to_owner] ?? null,
                'from_name_th' => $namesTh[$tr->from_owner] ?? null,
                'to_name_th' => $namesTh[$tr->to_owner] ?? null,
                'reason' => $tr->reason,
                'performed_by' => $tr->performed_by,
                'performed_by_th' => $tr->performer?->name_th,
            ]),
        ];
    }
}
