<?php

namespace App\Enums\Stock;

/** How committing a stock count affects stock levels. */
enum StockCountAdjustMode: string
{
    case Auto = 'auto';
    case Manual = 'manual';
}
