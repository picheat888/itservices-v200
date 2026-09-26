<?php

namespace App\Enums\Request;

/**
 * Lifecycle of a service request:
 * pending → approved → completed, pending → rejected, pending → cancelled.
 */
enum RequestStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Completed = 'completed';
    case Cancelled = 'cancelled';
}
