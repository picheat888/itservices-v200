<?php

namespace App\Models\Settings;

use App\Models\Concerns\RecordsActors;
use Illuminate\Database\Eloquent\Model;

class Category extends Model
{
    use RecordsActors;

    protected $fillable = ['name', 'name_th', 'icon', 'description'];
}
