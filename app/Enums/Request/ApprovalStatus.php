<?php

namespace App\Enums\Request;

/**
 * State of one resolved approval row. `current` marks the single row being
 * waited on; `skipped` is set at resolution time only (no manager, no owner,
 * owner is the requester, …) with the reason kept in `note`. A completed
 * fulfillment row reuses `approved` — the UI tells them apart by `kind`.
 */
enum ApprovalStatus: string
{
    case Waiting = 'waiting';
    case Current = 'current';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Skipped = 'skipped';
}
