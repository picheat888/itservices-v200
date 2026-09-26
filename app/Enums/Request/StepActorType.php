<?php

namespace App\Enums\Request;

/**
 * How a workflow step resolves to a concrete person at submit time:
 * chain      — positional along the requester's manager line (label is display only)
 * owner      — owner_employee_id of the Access resource picked in the request fields
 * it_staff   — nobody in particular: a queue for holders of requests.complete
 * department — somebody in a named department, off the requester's line entirely: either
 *              one person chosen when the step was configured, or whoever in that
 *              department holds one of the step's positions
 */
enum StepActorType: string
{
    case Chain = 'chain';
    case Owner = 'owner';
    case ItStaff = 'it_staff';
    case Department = 'department';
}
