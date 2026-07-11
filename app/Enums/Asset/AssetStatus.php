<?php

namespace App\Enums\Asset;

/**
 * Lifecycle state of an asset.
 *
 * Ready → (transfer) → PendingAcceptance → (employee accepts) → Deployed
 * Deployed → (return) → PendingReturn → (IT receives) → Ready
 * Any active state → Writeoff.
 */
enum AssetStatus: string
{
    case Ready = 'ready';                          // in the pool, ready to deploy
    case PendingAcceptance = 'pending_acceptance'; // assigned, awaiting employee accept
    case Deployed = 'deployed';                    // in active use by an employee owner
    case Common = 'common';                        // shared / common-use, deployed with no employee owner
    case PendingReturn = 'pending_return';         // awaiting IT to receive it back
    case Writeoff = 'writeoff';                    // retired / disposed
}
