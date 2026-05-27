<?php

namespace App\Models;

use App\Enums\CategoryType;
use Illuminate\Database\Eloquent\Model;

class Category extends Model
{
    protected $fillable = ['name', 'type', 'description'];

    /** Cast type to the CategoryType enum. */
    protected function casts(): array
    {
        return ['type' => CategoryType::class];
    }
}
