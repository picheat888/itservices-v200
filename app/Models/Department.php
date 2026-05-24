<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Department extends Model
{
    protected $fillable = ['code', 'name', 'name_th', 'head', 'location'];

    protected static function booted(): void
    {
        static::creating(function (Department $department) {
            if (blank($department->code)) {
                $base = strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $department->name ?? 'DEPT'), 0, 4)) ?: 'DEPT';
                $code = $base;
                $i = 1;
                while (static::where('code', $code)->exists()) {
                    $code = $base.$i++;
                }
                $department->code = $code;
            }
        });
    }

    public function employees(): HasMany
    {
        return $this->hasMany(Employee::class);
    }
}
