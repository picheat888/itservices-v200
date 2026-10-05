<?php

namespace App\Models\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * Stamps who last changed a record (updated_by) with the signed-in user, on every save that goes
 * through the model, the first one included. A save with nobody signed in (a queued job, the
 * scheduler, a seeder) leaves it as it was, and a query update never reaches it — so the system's
 * own bookkeeping (a template's last_sent_at) does not count as an edit.
 *
 * On its own it serves records that are only ever edited, never added by a person: the
 * notification and email templates, and the workflows. App\Models\Concerns\RecordsActors adds
 * created_by on top.
 */
trait RecordsUpdater
{
    public static function bootRecordsUpdater(): void
    {
        static::creating(function (Model $model) {
            $id = Auth::id();
            if ($id !== null) {
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
    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
