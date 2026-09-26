<?php

namespace Database\Seeders\Demo;

use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketWorkClass;
use App\Services\Ticket\TicketService;

/**
 * ~60 cases over six months, walked through the real service in the controller's order:
 * reported → taken or assigned → progress notes → resolved or cancelled. The newest few
 * stay Open (one past its response target), several are In Progress (the older ones past
 * their resolve target), a few repairs go to the vendor or stay in-house, and some
 * completions are late — so the SLA dashboard and the Ticket report have both sides.
 *
 * TicketService checks no permissions (the controller does), so the controller's rules
 * are kept by hand here: IT staff never take their own case, only In Progress cases are
 * resolved, and every resolution says what was done.
 */
final class DemoTickets implements DemoStep
{
    private const TOTAL = 60;

    /** Indexes at or above this stay Open; the band below it stays In Progress. */
    private const FIRST_OPEN = 56;

    private const FIRST_IN_PROGRESS = 48;

    /** Indexes resolved as cancelled rather than completed. */
    private const CANCELLED = [11, 26, 41];

    /** [category, subject, description, resolution] */
    private const CASES = [
        [TicketCategory::Hardware, 'Laptop does not power on', 'The laptop shows no lights after charging overnight.', 'Replaced the battery and DC jack; tested OK.'],
        [TicketCategory::Hardware, 'Printer paper jam every page', 'The office printer jams on every second page.', 'Cleaned the rollers and replaced the pickup roller.'],
        [TicketCategory::Software, 'Outlook keeps asking for password', 'Outlook prompts for the password every few minutes.', 'Cleared cached credentials and re-created the profile.'],
        [TicketCategory::Software, 'ERP report export error', 'Exporting the monthly report to Excel fails with an error.', 'Installed the ERP client patch 4.2.1.'],
        [TicketCategory::Network, 'No internet at production line 2', 'Terminals on line 2 cannot reach the internet.', 'Replaced a faulty patch cord at the access switch.'],
        [TicketCategory::Network, 'Wi-Fi drops in meeting room', 'Wi-Fi disconnects every 10 minutes in meeting room B.', 'Moved the AP channel and updated its firmware.'],
        [TicketCategory::Cctv, 'Camera 12 shows no image', 'Warehouse camera 12 shows a black screen.', 'Replaced the PoE injector for camera 12.'],
        [TicketCategory::Telephone, 'IP phone has no dial tone', 'The desk phone shows registered but has no dial tone.', 'Re-provisioned the phone on the PBX.'],
        [TicketCategory::Other, 'Projector needed for training', 'Please set up a projector for the Friday training.', 'Projector set up and tested in the training room.'],
        [TicketCategory::Hardware, 'Monitor flickering', 'The second monitor flickers once it warms up.', 'Swapped the monitor for one from the spare pool.'],
    ];

    /** Employees who report cases (none of them IT staff). */
    private const REQUESTERS = ['staff', 'pd.4', 'sup.pd', 'qc.2', 'se.2', 'hr.staff', 'acc.2', 'acc.3', 'sale.2', 'lg.3', 'mn.2', 'pu.2', 'ga.2', 'mgr.pd', 'hr.2'];

    public function __construct(private readonly TicketService $tickets) {}

    public function run(DemoContext $ctx, DemoClock $clock): void
    {
        $lead = $ctx->user('it.lead');
        $tech = $ctx->user('it.tech');
        $priorities = [TicketPriority::Medium, TicketPriority::High, TicketPriority::Low, TicketPriority::Critical];

        for ($i = 0; $i < self::TOTAL; $i++) {
            [$category, $subject, $description, $resolution] = self::CASES[$i % count(self::CASES)];
            $requester = $ctx->employee(self::REQUESTERS[$i % count(self::REQUESTERS)]);
            $payload = [
                'subject' => $subject,
                'description' => $description,
                'category' => $category->value,
                'callback_phone' => sprintf('Ext. %d', 2100 + $i),
            ];

            // The newest stay Open, never taken: one two days old (past its response target), the rest hours old.
            if ($i >= self::FIRST_OPEN) {
                $clock->at($i === self::FIRST_OPEN ? $clock->daysAgo(2, 9) : $clock->hoursAgo(self::TOTAL - $i));
                $this->tickets->create($payload, $requester);

                continue;
            }

            $daysAgo = 180 - $i * 3; // oldest first; index 55 → 15 days ago
            $staff = $i % 3 === 0 ? $lead : $tech;

            $clock->at($clock->daysAgo($daysAgo, 9 + $i % 6));
            $ticket = $this->tickets->create($payload, $requester);

            $clock->at($clock->daysAgo($daysAgo, 10 + $i % 6));
            $ctx->actAs($staff);
            $ticket = $i % 2 === 0
                ? $this->tickets->take($ticket, $staff, $priorities[$i % 4], 'Checking now', null)
                : $this->tickets->assign($ticket, $staff, $priorities[$i % 4], $lead);

            if ($i % 9 === 4) {
                $ticket = $this->tickets->setWorkClass($ticket, $staff, TicketWorkClass::RepairVendor, 'Under warranty - sent to the vendor');
            } elseif ($i % 9 === 7) {
                $ticket = $this->tickets->setWorkClass($ticket, $staff, TicketWorkClass::RepairInternal, 'Needs a part from stock');
            }

            if ($i >= self::FIRST_IN_PROGRESS) {
                $clock->at($clock->daysAgo(max(0, $daysAgo - 1), 11));
                $this->tickets->addUpdate($ticket, $staff, 'Waiting for the replacement part to arrive.');

                continue;
            }

            $clock->at($clock->daysAgo($daysAgo, 15));
            $this->tickets->addUpdate($ticket, $staff, 'Diagnosed the problem, working on the fix.');

            // Most close the next day; every seventh drags on for a week.
            $late = $i % 7 === 3;
            $cancelled = in_array($i, self::CANCELLED, true);
            $clock->at($clock->daysAgo(max(0, $daysAgo - ($late ? 7 : 1)), 16));
            $this->tickets->resolve(
                $ticket->fresh(),
                ! $cancelled,
                $cancelled ? 'Cancelled - the requester solved it themselves.' : $resolution,
            );
        }
    }
}
