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
 * Used by App\Models\Asset\Asset and App\Models\Contract\Contract.
 */
trait RecordsActors
{
    public static function bootRecordsActors(): void
    {
        static::creating(function (Model $model) {
            $id = Auth::id();
            if ($id !== null) {
                $model->created_by ??= $id;
                $model->updated_by ??= $id;
            }
        });

        static::updating(function (Model $model) {
            $id = Auth::id();
            if ($id !== null) {
                $model->updated_by = $id;
            }
        });
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return BelongsTo<User, $this> */
    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
