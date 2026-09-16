<?php

namespace App\Models\Asset;

use App\Enums\Asset\AssetTransferKind;
use App\Models\Employee\Employee;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;

class AssetTransfer extends Model
{
    protected $fillable = [
        'asset_id', 'asset_tag', 'asset_model', 'kind', 'from_owner', 'to_owner', 'reason', 'performed_by',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'kind' => AssetTransferKind::class,
        ];
    }

    /** @return BelongsTo<Asset, $this> */
    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    /**
     * Employee code → full name, for the codes appearing on a set of trail rows.
     *
     * The trail stores a code on purpose: it is a snapshot, so a hand-over still reads
     * correctly after the employee is renamed or deleted. That makes it unreadable on screen
     * ("EMP-14 → EMP-16"), so the name is looked up for display only — one query for the whole
     * set, and an end that is a warehouse, a shared label or a departed employee has no name.
     *
     * @param  Collection<int, self>  $rows
     * @return array<string, string>
     */
    public static function employeeNamesFor(Collection $rows): array
    {
        $codes = $rows->flatMap(fn (self $tr) => [$tr->from_owner, $tr->to_owner])->filter()->unique()->values();

        if ($codes->isEmpty()) {
            return [];
        }

        return Employee::whereIn('code', $codes)
            ->get(['code', 'first_name', 'last_name'])
            ->mapWithKeys(fn (Employee $e) => [$e->code => $e->name])
            ->all();
    }
}
