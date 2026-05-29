<?php

namespace App\Enums;

/**
 * Impact-based priority. Null on a fresh ticket — an IT staff sets it when they
 * take or are assigned the case.
 */
enum TicketPriority: string
{
    case Critical = 'critical';
    case High = 'high';
    case Medium = 'medium';
    case Low = 'low';
}
