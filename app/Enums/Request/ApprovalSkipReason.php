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

    /** The resource asked for carries no owner, or its owner has left the company. */
    case NoResourceOwner = 'no_resource_owner';

    /** The owner step resolved to the requester themself — nobody approves their own. */
    case RequesterIsOwner = 'requester_is_owner';
}
