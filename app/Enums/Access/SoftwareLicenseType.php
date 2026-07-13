<?php

namespace App\Enums\Access;

/** How a piece of software is licensed. */
enum SoftwareLicenseType: string
{
    case Perpetual = 'perpetual';
    case Subscription = 'subscription';
    case Free = 'free';
    case OpenSource = 'open_source';
}
