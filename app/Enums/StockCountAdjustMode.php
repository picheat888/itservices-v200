<?php

namespace App\Enums;

/** How committing a stock count affects stock levels. */
enum StockCountAdjustMode: string
{
    case Auto = 'auto';
    case Manual = 'manual';
}
