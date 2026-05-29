<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RolePermission extends Model
{
    protected $fillable = ['role_id', 'permission', 'allowed'];

    protected function casts(): array
    {
        return ['allowed' => 'boolean'];
    }

    /**
     * The role this permission entry belongs to (resolved via role_id FK).
     */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }
}
