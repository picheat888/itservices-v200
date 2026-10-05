<?php

namespace App\Models\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * Stamps who added a record (created_by) and who last changed it (updated_by) with the signed-in
 * user, on every save that goes through the model. A save with nobody signed in (a queued job, the
 * scheduler, a seeder) leaves both as they were.
 *
 * A query update (`Model::whereIn(...)->update([...])`) never reaches these hooks, so code that
 * writes that way sets updated_by itself. The full history — what changed, from what — stays in
 * audit_logs; these two columns answer "who" at a glance.
 *
 * updated_by and updater() come from App\Models\Concerns\RecordsUpdater.
 *
 * Used by assets, contracts, employees, stock items, the master data (brands, asset models,
 * categories, vendors, warehouses, locations, units, warranty types, departments, positions,
 * sections) and the access catalogues (email groups, file shares, social platforms, software).
 */
trait RecordsActors
{
    use RecordsUpdater;

    public static function bootRecordsActors(): void
    {
        static::creating(function (Model $model) {
            $id = Auth::id();
            if ($id !== null) {
                $model->created_by ??= $id;
            }
        });
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
