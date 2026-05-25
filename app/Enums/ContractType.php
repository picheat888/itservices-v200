<?php

namespace App\Enums;

/**
 * Category of a vendor/service contract. Mirrors the design's four radio-card
 * types plus a generic "Other" fallback. Hardware leases can later be linked
 * to leased assets once the Assets module exists.
 */
enum ContractType: string
{
    case Software = 'software';
    case Hardware = 'hardware';
    case Service = 'service';
    case Connectivity = 'connectivity';
    case Other = 'other';
}
