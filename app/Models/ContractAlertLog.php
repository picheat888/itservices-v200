<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One row per (contract, reminder threshold) that has been alerted. Acts as the
 * dedup ledger for ContractExpiryAlertService. No created_at/updated_at — the
 * single alerted_at timestamp is all we need.
 */
class ContractAlertLog extends Model
{
    public $timestamps = false;

    protected $fillable = ['contract_id', 'threshold', 'alerted_at'];

    protected function casts(): array
    {
        return [
            'threshold' => 'integer',
            'alerted_at' => 'datetime',
        ];
    }
}
