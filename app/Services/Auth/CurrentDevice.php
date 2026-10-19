<?php

// The device this request was signed in with (from a remember cookie or a new sign-in); one per request.

namespace App\Services\Auth;

use App\Models\Auth\UserDevice;

class CurrentDevice
{
    private ?UserDevice $device = null;

    public function get(): ?UserDevice
    {
        return $this->device;
    }

    public function set(?UserDevice $device): void
    {
        $this->device = $device;
    }
}
