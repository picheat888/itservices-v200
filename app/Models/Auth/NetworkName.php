<?php

namespace App\Models\Auth;

use Illuminate\Database\Eloquent\Model;

// A CIDR range an admin has given a name (office, VPN...), used as the sign-in location.
class NetworkName extends Model
{
    protected $fillable = ['cidr', 'name'];
}
