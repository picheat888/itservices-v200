<?php

namespace App\Support;

use App\Enums\Request\RequestType;

/**
 * Canonical default workflow per request type, straight from the approved
 * Request & Workflow diagram: chain approvals climb the requester's manager
 * line, owner approvals go to the Access resource owner, and IT Staff performs
 * the final fulfillment. Seeded once by WorkflowSeeder; admins edit from the
 * Workflows page afterwards (re-seeding never overwrites their edits).
 */
class DefaultWorkflows
{
    /**
     * @return array<string, array{name: string, auto_ticket: bool, steps: list<array{actor_type: string, label: string, kind: string, sla_days: float}>}>
     */
    public static function all(): array
    {
        $chain3 = [
            ['actor_type' => 'chain', 'label' => 'Supervisor / Head', 'kind' => 'approval', 'sla_days' => 1],
            ['actor_type' => 'chain', 'label' => 'Manager / Asst. Manager', 'kind' => 'approval', 'sla_days' => 1],
            ['actor_type' => 'chain', 'label' => 'Vice President', 'kind' => 'approval', 'sla_days' => 2],
        ];
        $it = fn (float $sla) => ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'fulfillment', 'sla_days' => $sla];
        $owner = fn (float $sla) => ['actor_type' => 'owner', 'label' => 'Resource Owner', 'kind' => 'approval', 'sla_days' => $sla];

        return [
            RequestType::Mailgroup->value => [
                'name' => 'Email Group Access', 'auto_ticket' => true,
                'steps' => [$owner(1), $it(1)],
            ],
            RequestType::Fileshare->value => [
                'name' => 'File Share Access', 'auto_ticket' => true,
                'steps' => [$owner(1), $it(1)],
            ],
            RequestType::Social->value => [
                'name' => 'Social Media Access', 'auto_ticket' => true,
                'steps' => [...$chain3, $it(1)],
            ],
            RequestType::Computer->value => [
                'name' => 'Computer', 'auto_ticket' => true,
                'steps' => [$chain3[0], $chain3[1], $it(2)],
            ],
            // Same chain as Mobile — kept as its own workflow so the two can diverge
            // without touching each other.
            RequestType::Hardware->value => [
                'name' => 'Hardware / Peripheral', 'auto_ticket' => true,
                'steps' => [...$chain3, $it(2)],
            ],
            RequestType::Mobile->value => [
                'name' => 'Mobile Device', 'auto_ticket' => true,
                'steps' => [...$chain3, $it(2)],
            ],
            RequestType::Email->value => [
                'name' => 'Email Account', 'auto_ticket' => true,
                'steps' => [
                    ['actor_type' => 'chain', 'label' => 'Department Manager', 'kind' => 'approval', 'sla_days' => 1],
                    $it(1),
                ],
            ],
            RequestType::Software->value => [
                'name' => 'Software Install', 'auto_ticket' => true,
                'steps' => [...$chain3, $it(1)],
            ],
            RequestType::Recovery->value => [
                'name' => 'Data Recovery', 'auto_ticket' => true,
                'steps' => [$owner(0.5), $it(1)],
            ],
            RequestType::Telephone->value => [
                'name' => 'Telephone', 'auto_ticket' => true,
                'steps' => [...$chain3, $it(2)],
            ],
            RequestType::Other->value => [
                'name' => 'General Request', 'auto_ticket' => false,
                'steps' => [...$chain3, $it(2)],
            ],
        ];
    }
}
