<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Department extends Model
{
    protected $fillable = ['code', 'tag', 'name', 'name_th'];

    protected static function booted(): void
    {
        static::creating(function (Department $department) {
            // Auto-assign a sequential DEP-#### code on create.
            if (blank($department->code)) {
                $max = (int) str_replace('DEP-', '', (string) static::max('code'));
                $department->code = 'DEP-'.str_pad((string) ($max + 1), 4, '0', STR_PAD_LEFT);
            }
            if (blank($department->tag)) {
                $base = strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $department->name ?? 'DEPT'), 0, 4)) ?: 'DEPT';
                $tag = $base;
                $i = 1;
                while (static::where('tag', $tag)->exists()) {
                    $tag = $base.$i++;
                }
                $department->tag = $tag;
            }
        });
    }

    public function employees(): HasMany
    {
        return $this->hasMany(Employee::class);
    }

    /** Sections (หน่วยงาน) belonging to this department. */
    public function sections(): HasMany
    {
        return $this->hasMany(Section::class);
    }
}
