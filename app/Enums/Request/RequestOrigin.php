<?php

namespace App\Enums\Request;

/**
 * Where a service request came from.
 *
 * `Direct` is the ordinary case: somebody opened the New Request wizard for
 * themselves. `Onboarding` is filed on a new employee's behalf from the Add
 * Employee form, before that person has a login of their own — which is why the
 * request carries a submitter separate from its owner, and why approvers are
 * shown that it is a new hire rather than a colleague asking for a second laptop.
 *
 * The value 'direct' (not 'self') because `self` cannot be an enum case name.
 */
enum RequestOrigin: string
{
    case Direct = 'direct';
    case Onboarding = 'onboarding';

    /** True when the request was filed by somebody other than its owner. */
    public function isOnBehalf(): bool
    {
        return $this !== self::Direct;
    }
}
