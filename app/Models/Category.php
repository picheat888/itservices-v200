<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Category extends Model
{
    protected $fillable = ['name', 'name_th', 'description', 'track_serial'];

    protected function casts(): array
    {
        return [
            'track_serial' => 'boolean',
        ];
    }
}
