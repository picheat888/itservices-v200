<?php

namespace App\Models\Settings;

use App\Models\Concerns\RecordsActors;
use Illuminate\Database\Eloquent\Model;

class Unit extends Model
{
    use RecordsActors;

    protected $fillable = ['name', 'description'];
}
