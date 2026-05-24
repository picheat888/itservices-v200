<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

class AuditLog extends Model
{
    protected $fillable = ['user_id', 'user_name', 'action', 'target', 'details'];

    protected $casts = ['details' => 'array'];

    /** Record an audit entry for the current (or system) actor. */
    public static function record(string $action, ?string $target = null, ?array $details = null): void
    {
        $user = Auth::user();
        static::create([
            'user_id'   => $user?->id,
            'user_name' => $user?->name ?? 'System',
            'action'    => $action,
            'target'    => $target,
            'details'   => $details,
        ]);
    }
}
