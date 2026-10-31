<?php

namespace App\Enums\Ticket;

/** The clock an SLA rule counts on: Business = working hours less listed holidays, Calendar = real time 24/7. */
enum TicketSlaClock: string
{
    case Business = 'business';
    case Calendar = 'calendar';
}
