<?php

namespace App\Enums;

/**
 * Lifecycle state of an asset.
 *
 * Ready → (transfer) → PendingAcceptance → (employee accepts) → Deployed
 * Deployed → (return) → PendingReturn → (IT receives) → Ready
 * Any active state → Maintenance / Writeoff / PendingStock.
 */
enum AssetStatus: string
{
    case Ready = 'ready';                          // in the pool, ready to deploy
    case PendingAcceptance = 'pending_acceptance'; // assigned, awaiting employee accept
    case Deployed = 'deployed';                    // in active use by an owner
    case PendingReturn = 'pending_return';         // awaiting IT to receive it back
    case Maintenance = 'maintenance';              // out for repair/service
    case Writeoff = 'writeoff';                    // retired / disposed
    case PendingStock = 'pending_stock';           // queued to be converted into stock
}
