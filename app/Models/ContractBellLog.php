<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One row per (contract, calendar day) the in-app expiry bell fired. Acts as the
 * per-day dedup ledger for ContractExpiryAlertService so a contract stuck in
 * "expiring soon" or "expired" re-alerts at most once a day. No timestamps —
 * bell_date is the only fact we need.
 */
class ContractBellLog extends Model
{
    public $timestamps = false;

    protected $fillable = ['contract_id', 'bell_date'];

    protected function casts(): array
    {
        return [
            'bell_date' => 'date',
        ];
    }
}
