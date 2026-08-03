<?php

namespace App\Enums\Request;

/**
 * Lifecycle of a service request:
 * pending → approved → fulfilled, pending → rejected, pending → cancelled.
 */
enum RequestStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Fulfilled = 'fulfilled';
    case Cancelled = 'cancelled';
}
