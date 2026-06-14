<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class AccessMembership extends Model
{
    protected $fillable = ['resource_type', 'resource_id', 'employee_id', 'access_level', 'purpose', 'granted_at', 'granted_by', 'revoked_at'];

    protected function casts(): array
    {
        return ['granted_at' => 'date', 'revoked_at' => 'date'];
    }

    public function scopeActive(Builder $q): Builder
    {
        return $q->whereNull('revoked_at');
    }

    public function resource(): MorphTo
    {
        return $this->morphTo();
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function grantedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'granted_by');
    }
}
