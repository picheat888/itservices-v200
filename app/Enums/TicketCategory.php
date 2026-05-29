<?php

namespace App\Enums;

/** The kind of issue a ticket is about (drives the create-form category cards). */
enum TicketCategory: string
{
    case Hardware = 'hardware';
    case Software = 'software';
    case Network = 'network';
    case Other = 'other';
}
