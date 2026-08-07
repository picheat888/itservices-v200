<?php

namespace App\Enums\Request;

/**
 * Why a workflow step was skipped when the chain was frozen at submit time.
 *
 * Stored as a code rather than a sentence: it is a snapshot fact (it stays true
 * however the org chart changes afterwards), but the wording is presentation, and
 * a sentence in the database can only ever be in one language. The SPA renders it
 * from `req_skip_*`, leaving `request_approvals.note` for what a person wrote.
 */
enum ApprovalSkipReason: string
{
    /** The requester has nobody above them, so a chain step has no one to resolve to. */
    case NoManager = 'no_manager';

    /**
     * The requester already holds the position this step asks for (or one the workflow
     * places above it), so there is nobody above them to ask — a Supervisor filing
     * their own request has no Supervisor over it.
     *
     * Rank comes from the workflow's own rung order, not from the positions table
     * (which carries no level): a rung the requester's own title appears in, and every
     * rung below it, is outranked.
     */
    case RequesterOutranksStep = 'requester_outranks_step';

    /**
     * Nobody in the reporting line holds a position this step accepts, and the
     * requester is not at that level either — a Staff member reporting straight to a
     * Manager has no Supervisor in their line at all. The level is skipped rather than
     * handed to somebody who does not hold it.
     */
    case NoMatchingPosition = 'no_matching_position';

    /** The resource asked for carries no owner, or its owner has left the company. */
    case NoResourceOwner = 'no_resource_owner';

    /** The owner step resolved to the requester themself — nobody approves their own. */
    case RequesterIsOwner = 'requester_is_owner';
}
