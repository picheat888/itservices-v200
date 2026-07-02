<?php

namespace App\Models\Settings;

use Illuminate\Database\Eloquent\Model;

class Vendor extends Model
{
    protected $fillable = ['name', 'name_th', 'contact', 'phone', 'email', 'address'];
}
