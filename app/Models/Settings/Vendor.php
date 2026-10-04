<?php

namespace App\Models\Settings;

use App\Models\Concerns\RecordsActors;
use Illuminate\Database\Eloquent\Model;

class Vendor extends Model
{
    use RecordsActors;

    protected $fillable = ['name', 'name_th', 'contact', 'phone', 'email', 'address'];
}
