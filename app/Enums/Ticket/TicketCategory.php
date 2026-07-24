<?php

namespace App\Enums\Ticket;

/** The kind of issue a ticket is about (drives the create-form category cards). */
enum TicketCategory: string
{
    case Hardware = 'hardware';
    case Software = 'software';
    case Network = 'network';
    case Other = 'other';

    /** Short code used inside the ticket number (e.g. TKT-SW-YYMMDD-NNN). */
    public function shortCode(): string
    {
        return match ($this) {
            self::Software => 'SW',
            self::Hardware => 'HW',
            self::Network => 'NW',
            self::Other => 'OTH',
        };
    }
}
