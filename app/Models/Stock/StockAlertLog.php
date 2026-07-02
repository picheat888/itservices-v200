<?php

namespace App\Models\Stock;

use Illuminate\Database\Eloquent\Model;

class StockAlertLog extends Model
{
    protected $fillable = ['stock_item_id', 'alert_type', 'last_alerted_on'];

    /**
     * Cast last_alerted_on to a Carbon date so comparisons stay type-safe.
     */
    protected function casts(): array
    {
        return ['last_alerted_on' => 'date'];
    }
}
