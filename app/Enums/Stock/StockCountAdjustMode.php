<?php

namespace App\Enums\Stock;

/** How a committed stock count affected stock levels; new commits are always Auto, Manual only marks old report-only counts. */
enum StockCountAdjustMode: string
{
    case Auto = 'auto';
    case Manual = 'manual';
}
