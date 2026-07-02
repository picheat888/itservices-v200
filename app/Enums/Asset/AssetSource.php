<?php

namespace App\Enums\Asset;

/** How an asset was acquired: owned outright or rented/leased from a vendor. */
enum AssetSource: string
{
    case Purchased = 'purchased';
    case Rented = 'rented';
}
