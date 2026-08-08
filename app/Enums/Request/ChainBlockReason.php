<?php

namespace App\Enums\Request;

/**
 * Why a request cannot be filed at all: the requester's reporting line cannot
 * carry it, and letting it through would mean recording approvals nobody gave.
 *
 * Returned as a code, not a sentence — the SPA writes it out through
 * `req_block_*` so the reader sees it in their own language (same reasoning as
 * ApprovalSkipReason). This one is NOT stored anywhere: it is a live check made
 * at submit time, and it stops the request from existing.
 *
 * Note what is deliberately NOT here: a line that simply has nobody of the rank a
 * rung asks for (a small department where Staff reports straight to a Manager).
 * That is a valid org shape, the rung is skipped, and the request goes ahead.
 */
enum ChainBlockReason: string
{
    /**
     * Nobody above the requester at all, on a position that is supposed to have
     * somebody. `positions.allow_special_position` marks the titles that legitimately
     * sit at the top (an MD) — those still submit, and their chain steps are skipped.
     */
    case NoManager = 'chain_no_manager';

    /**
     * The person a rung would have resolved to has left the company. Their approval is
     * never coming, and handing the step to whoever is above them would record a
     * decision the departed manager never made — so the request waits for HR to
     * update the reporting line instead.
     */
    case ApproverResigned = 'chain_approver_resigned';

    /** The English fallback, for API clients that do not translate the code. */
    public function message(): string
    {
        return match ($this) {
            self::NoManager => 'Your reporting line has no manager set, so this request cannot be routed. Ask HR to update it.',
            self::ApproverResigned => 'An approver in your reporting line has left the company. Ask HR to update it before submitting.',
        };
    }
}
