<?php

namespace App\Enums\Asset;

/**
 * What a custody-trail row actually was.
 *
 * Before this existed every ownership change was one undifferentiated row, and telling a
 * hand-over from a return meant reading the English `reason` text ('Returned to pool') —
 * a guess, since users type that field themselves. The dashboard's 12-month activity chart
 * needs the fact, not the inference.
 *
 * `Recall` is kept apart from `Return` even though both land the asset back in the pool:
 * one is equipment coming back from use, the other a hand-over that was never accepted.
 * Reports that only care about "came back to the warehouse" count them together.
 */
enum AssetTransferKind: string
{
    case Handover = 'handover';
    case Return = 'return';
    case Recall = 'recall';
    case Relocate = 'relocate';

    /** True when the asset ended this move back in the pool (received or recalled). */
    public function isInbound(): bool
    {
        return $this === self::Return || $this === self::Recall;
    }

    /**
     * True when the row is a change of holder. `Relocate` is the exception: the same person
     * keeps the asset, only the desk it sits at moved — so it must stay out of the custody
     * counts (the activity chart, the recent-transfers list) that ask "who has what".
     */
    public function changesCustody(): bool
    {
        return $this !== self::Relocate;
    }
}
