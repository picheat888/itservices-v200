<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

class AuditLog extends Model
{
    protected $fillable = ['user_id', 'user_name', 'action', 'target', 'details'];

    protected $casts = ['details' => 'array'];

    /** Fields never worth recording in an audit diff. */
    private const DIFF_HIDDEN = ['updated_at', 'created_at', 'password', 'remember_token'];

    /** Record an audit entry for the current (or system) actor. */
    public static function record(string $action, ?string $target = null, ?array $details = null): void
    {
        $user = Auth::user();
        static::create([
            'user_id' => $user?->id,
            'user_name' => $user?->name ?? 'System',
            'action' => $action,
            'target' => $target,
            'details' => $details,
        ]);
    }

    /**
     * Build a field-level before/after diff to attach as audit `details`.
     * Capture `$before = $model->getOriginal()` (or `->getAttributes()`) BEFORE the
     * update, then call this AFTER `$model->save()` — it reads the saved changes and
     * pairs each changed field with its prior value.
     *
     * Returns `['changes' => ['field' => ['from' => .., 'to' => ..], ...]]`,
     * or null when nothing meaningful changed (so `record()` stores no details).
     *
     * @param  array<string, mixed>  $before
     * @param  array<int, string>  $hidden  extra fields to omit (merged with defaults)
     * @return array<string, mixed>|null
     */
    public static function changes(array $before, Model $after, array $hidden = []): ?array
    {
        $skip = array_merge(self::DIFF_HIDDEN, $hidden);
        $diff = [];

        foreach ($after->getChanges() as $field => $to) {
            if (in_array($field, $skip, true)) {
                continue;
            }
            $diff[$field] = ['from' => $before[$field] ?? null, 'to' => $to];
        }

        return $diff === [] ? null : ['changes' => $diff];
    }
}
