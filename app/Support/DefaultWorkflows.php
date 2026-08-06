<?php

namespace App\Support;

use App\Enums\Request\RequestType;

/**
 * Canonical default workflow per request type, straight from the approved
 * Request & Workflow diagram: chain approvals climb the requester's manager
 * line, owner approvals go to the Access resource owner, and IT Staff performs
 * the final fulfillment. Seeded once by WorkflowSeeder; admins edit from the
 * Workflows page afterwards (re-seeding never overwrites their edits).
 *
 * A step carries no SLA. How long each route actually takes is measured from the
 * requests that ran through it, not declared here.
 */
class DefaultWorkflows
{
    /**
     * @return array<string, array{name: string, auto_ticket: bool, steps: list<array{actor_type: string, label: string, kind: string}>}>
     */
    public static function all(): array
    {
        $chain3 = [
            ['actor_type' => 'chain', 'label' => 'Supervisor / Head', 'kind' => 'approval'],
            ['actor_type' => 'chain', 'label' => 'Manager / Asst. Manager', 'kind' => 'approval'],
            ['actor_type' => 'chain', 'label' => 'Vice President', 'kind' => 'approval'],
        ];
        $it = ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'fulfillment'];
        $owner = ['actor_type' => 'owner', 'label' => 'Resource Owner', 'kind' => 'approval'];

        return [
            RequestType::Mailgroup->value => [
                'name' => 'Email Group Access', 'auto_ticket' => true,
                'steps' => [$owner, $it],
            ],
            RequestType::Fileshare->value => [
                'name' => 'File Share Access', 'auto_ticket' => true,
                'steps' => [$owner, $it],
            ],
            RequestType::Social->value => [
                'name' => 'Social Media Access', 'auto_ticket' => true,
                'steps' => [...$chain3, $it],
            ],
            RequestType::Computer->value => [
                'name' => 'Computer', 'auto_ticket' => true,
                'steps' => [$chain3[0], $chain3[1], $it],
            ],
            // Same chain as Mobile — kept as its own workflow so the two can diverge
            // without touching each other.
            RequestType::Hardware->value => [
                'name' => 'Hardware / Peripheral', 'auto_ticket' => true,
                'steps' => [...$chain3, $it],
            ],
            RequestType::Mobile->value => [
                'name' => 'Mobile Device', 'auto_ticket' => true,
                'steps' => [...$chain3, $it],
            ],
            RequestType::Email->value => [
                'name' => 'Email Account', 'auto_ticket' => true,
                'steps' => [
                    ['actor_type' => 'chain', 'label' => 'Department Manager', 'kind' => 'approval'],
                    $it,
                ],
            ],
            RequestType::Software->value => [
                'name' => 'Software Install', 'auto_ticket' => true,
                'steps' => [...$chain3, $it],
            ],
            RequestType::Recovery->value => [
                'name' => 'Data Recovery', 'auto_ticket' => true,
                'steps' => [$owner, $it],
            ],
            RequestType::Telephone->value => [
                'name' => 'Telephone', 'auto_ticket' => true,
                'steps' => [...$chain3, $it],
            ],
            RequestType::Other->value => [
                'name' => 'General Request', 'auto_ticket' => false,
                'steps' => [...$chain3, $it],
            ],
        ];
    }
}
