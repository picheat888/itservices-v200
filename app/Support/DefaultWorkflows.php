<?php

namespace App\Support;

use App\Enums\Request\RequestType;

/**
 * Canonical default workflow per request type — a copy of the routes this organisation
 * actually runs, so a fresh install starts where the live system already is rather than at
 * a generic template somebody then has to re-edit by hand.
 *
 * Seeded once by WorkflowSeeder; admins edit from the Workflows page afterwards, and
 * re-seeding never overwrites their edits.
 *
 * A chain step names the POSITIONS allowed to sign it (see RUNGS): resolution climbs the
 * requester's reporting line until it finds a holder, so a Staff member's Supervisor step
 * reaches an actual Supervisor rather than whichever manager happens to sit one level up.
 *
 * A step carries no SLA. How long each route actually takes is measured from the requests
 * that ran through it, not declared here.
 */
class DefaultWorkflows
{
    /**
     * The rungs of the ladder a chain step can ask for, by position title. A rung accepts
     * every title at that level — "Supervisor" and "Senior Supervisor" are the same rung,
     * and somebody below it (Leader and down) is not an approver at all.
     *
     * `executive` is Vice President alone. Director sits at the same level on the org chart
     * but is not on this rung in practice, and every chain route here reflects that.
     *
     * @var array<string, list<string>>
     */
    public const RUNGS = [
        'supervisor' => ['Asst. Supervisor', 'Supervisor', 'Senior Supervisor'],
        'manager' => ['Asst. Manager', 'Manager', 'Senior Manager'],
        'executive' => ['Vice President'],
    ];

    /**
     * @return array<string, array{name: string, auto_ticket: bool, steps: list<array{actor_type: string, label: string, kind: string, positions?: list<string>}>}>
     */
    public static function all(): array
    {
        $chain3 = [
            ['actor_type' => 'chain', 'label' => 'Supervisor', 'kind' => 'approval', 'positions' => self::RUNGS['supervisor']],
            ['actor_type' => 'chain', 'label' => 'Manager / Asst. Manager', 'kind' => 'approval', 'positions' => self::RUNGS['manager']],
            ['actor_type' => 'chain', 'label' => 'Vice President', 'kind' => 'approval', 'positions' => self::RUNGS['executive']],
        ];
        $it = ['actor_type' => 'it_staff', 'label' => 'IT Staff', 'kind' => 'fulfillment'];
        $owner = ['actor_type' => 'owner', 'label' => 'Resource Owner', 'kind' => 'approval'];

        return [
            // The one route that stops at Manager — a computer is standard issue, so it does
            // not climb to the executive rung the way the others do.
            RequestType::Computer->value => [
                'name' => 'คำขอใช้งานคอมพิวเตอร์', 'auto_ticket' => true,
                'steps' => [$chain3[0], $chain3[1], $it],
            ],
            // Same chain as Mobile — kept as its own workflow so the two can diverge
            // without touching each other.
            RequestType::Hardware->value => [
                'name' => 'คำขอใช้งานอุปกรณ์ Hardware / อุปกรณ์ต่อพ่วง', 'auto_ticket' => true,
                'steps' => [...$chain3, $it],
            ],
            RequestType::Mobile->value => [
                'name' => 'คำขอใช้งานอุปกรณ์มือถือ', 'auto_ticket' => true,
                'steps' => [...$chain3, $it],
            ],
            RequestType::Email->value => [
                'name' => 'คำขอใช้งานบัญชี Email', 'auto_ticket' => true,
                'steps' => [...$chain3, $it],
            ],
            RequestType::Social->value => [
                'name' => 'คำขอสิทธิ์เข้าใช้งาน Social Media', 'auto_ticket' => true,
                'steps' => [...$chain3, $it],
            ],
            // Access to something that already has a custodian: the owner decides and IT
            // carries out, with no chain at all. Email Group below is the same shape.
            RequestType::Fileshare->value => [
                'name' => 'คำขอสิทธิ์เข้าใช้งาน File Share', 'auto_ticket' => true,
                'steps' => [$owner, $it],
            ],
            RequestType::Software->value => [
                'name' => 'คำขอใช้งาน / ติดตั้ง Software', 'auto_ticket' => true,
                'steps' => [...$chain3, $it],
            ],
            // Narrower than the supervisor rung on purpose: recovering someone's data is
            // signed by their own Supervisor, not by an Asst. or Senior standing in.
            RequestType::Recovery->value => [
                'name' => 'คำขอ Data Recovery', 'auto_ticket' => true,
                'steps' => [
                    ['actor_type' => 'chain', 'label' => 'Supervisor', 'kind' => 'approval', 'positions' => ['Supervisor']],
                    $it,
                ],
            ],
            // Owner-approved, like File Share above.
            RequestType::Mailgroup->value => [
                'name' => 'คำขอสิทธิ์เข้าใช้งาน Email Group', 'auto_ticket' => true,
                'steps' => [$owner, $it],
            ],
            RequestType::Telephone->value => [
                'name' => 'คำขอโทรศัพท์สำนักงาน', 'auto_ticket' => true,
                'steps' => [...$chain3, $it],
            ],
            // The only route that does not open a ticket by itself: "other" covers work
            // nobody has typed yet, so what it becomes is decided after it is approved.
            RequestType::Other->value => [
                'name' => 'คำขอใช้งานอื่น ๆ', 'auto_ticket' => false,
                'steps' => [...$chain3, $it],
            ],
        ];
    }
}
