<?php

namespace App\Enums\Auth;

// The kind of row in the login log.
enum LoginEventType: string
{
    case SignedIn = 'signed_in';
    case Failed = 'failed';
    case Locked = 'locked';
    case SignedOut = 'signed_out';
    case ForcedOut = 'forced_out';
}
