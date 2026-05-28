<?php

namespace App\Enums;

/** How an asset was acquired: owned outright or rented/leased from a vendor. */
enum AssetSource: string
{
    case Purchased = 'purchased';
    case Rented = 'rented';
}
