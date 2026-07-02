<?php

namespace App\Enums\Stock;

/** Lifecycle of a stock-count session. */
enum StockCountStatus: string
{
    case Draft = 'draft';
    case Committed = 'committed';
    case Canceled = 'canceled';
}
