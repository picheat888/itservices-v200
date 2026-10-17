<?php

namespace App\Models\Asset;

use App\Enums\Asset\AssetTransferKind;
use App\Models\Employee\Employee;
use App\Models\User;
use App\Support\SearchTerms;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;

class AssetTransfer extends Model
{
    protected $fillable = [
        'asset_id', 'asset_tag', 'asset_model', 'kind', 'from_owner', 'to_owner', 'reason', 'performed_by', 'performed_by_user_id',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'kind' => AssetTransferKind::class,
        ];
    }

    /**
     * The transfer search shared by the log tab and the transfer history report: the asset as
     * named then, its brand, both ends (code or label), who moved it, and the employee at either
     * end by name in English or Thai.
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeSearchFor(Builder $query, mixed $search): Builder
    {
        return SearchTerms::apply($query, $search, [
            'asset_tag', 'asset_model', 'from_owner', 'to_owner', 'performed_by',
            fn (Builder $w, string $like) => $w->orWhereIn('asset_id', Asset::query()->select('id')
                ->whereHas('brand', fn (Builder $b) => SearchTerms::anyLike($b, ['name'], $like))),
            function (Builder $w, string $like) {
                $codes = SearchTerms::anyLike(Employee::query()->select('code'), SearchTerms::personName(), $like);
                $w->orWhereIn('from_owner', $codes)->orWhereIn('to_owner', $codes);
            },
            fn (Builder $w, string $like) => $w->orWhereIn('performed_by_user_id', User::query()->select('id')
                ->whereIn('employee_id', SearchTerms::anyLike(Employee::query()->select('id'), SearchTerms::personName(), $like))),
        ]);
    }

    /** @return BelongsTo<User, $this> */
    public function performer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by_user_id');
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

    /**
     * Employee code → Thai full name for the codes on a set of trail rows; codes with no Thai name are left out.
     *
     * @param  Collection<int, self>  $rows
     * @return array<string, string>
     */
    public static function employeeThaiNamesFor(Collection $rows): array
    {
        $codes = $rows->flatMap(fn (self $tr) => [$tr->from_owner, $tr->to_owner])->filter()->unique()->values();

        if ($codes->isEmpty()) {
            return [];
        }

        return Employee::whereIn('code', $codes)
            ->get(['code', 'first_name_th', 'last_name_th'])
            ->filter(fn (Employee $e) => $e->name_th !== null)
            ->mapWithKeys(fn (Employee $e) => [$e->code => $e->name_th])
            ->all();
    }
}
