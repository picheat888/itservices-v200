<?php

namespace App\Enums\Request;

/**
 * What a workflow step does: an approval decision, or the final fulfillment
 * work by IT (at most one, always last).
 */
enum WorkflowStepKind: string
{
    case Approval = 'approval';
    case Fulfillment = 'fulfillment';
}
