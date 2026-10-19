<?php

namespace App\Enums\Auth;

// Why a device sign-in ended; stored on user_devices and repeated on the login_events row.
enum DeviceEndReason: string
{
    case ThirdDevice = 'third_device';          // signed out at the limit dialog to make room for a new device
    case Profile = 'profile';                   // signed out from the profile Devices tab
    case Limit = 'limit';                       // the admin lowered the device limit
    case IdleTimeout = 'idle_timeout';          // idle longer than the idle timeout
    case PasswordChanged = 'password_changed';  // password changed or reset
    case AccountClosed = 'account_closed';      // account disabled or deleted
    case SignedOut = 'signed_out';              // the person signed out themselves
}
