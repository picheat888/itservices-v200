<?php

namespace App\Support\Perf;

use App\Enums\Ticket\TicketCategory;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\AppSetting;
use App\Models\Ticket\Ticket;
use App\Support\TicketSla;
use Carbon\CarbonImmutable;

/** Perf step 8: tickets (opened by requests and by hand), their updates and attachments, with real SLA deadlines. */
class Tickets implements PerfStep
{
    use FillsRows;

    private const PROBLEMS = [
        'hardware' => ['Laptop will not boot', 'Monitor flickering', 'Keyboard keys not working', 'Mouse not detected', 'Laptop battery drains fast', 'Desktop makes loud noise', 'Docking station not charging', 'Printer paper jam', 'Printer offline', 'Scanner not working'],
        'software' => ['Cannot open Excel files', 'Outlook keeps asking for password', 'Windows update failed', 'Application crashes on start', 'Need licence activation', 'VPN will not connect', 'Antivirus alert on my PC', 'Teams audio not working', 'ERP login error', 'Browser very slow'],
        'network' => ['No internet at my desk', 'Wi-Fi keeps disconnecting', 'Cannot reach the shared drive', 'Network drive is slow', 'Switch port not working', 'VPN drops every hour', 'Cannot reach the server', 'Access point offline', 'IP conflict warning', 'Slow download speed'],
        'cctv' => ['Camera offline', 'Playback not available', 'Camera image blurry', 'NVR disk full', 'Need footage export', 'Camera moved by accident'],
        'telephone' => ['IP phone has no dial tone', 'Extension cannot receive calls', 'Headset not working', 'Voicemail not working', 'Need call forwarding', 'Phone display blank'],
        'other' => ['Need help with the projector', 'Meeting room display not working', 'Request for a cable', 'Badge reader problem', 'Shared mailbox question', 'General IT question'],
    ];

    private const PLACES = ['Production Line 1', 'the Accounting office', 'Warehouse A', 'Meeting Room 2', 'Reception', 'the HR office', 'the QC lab', 'the maintenance workshop', 'the sales floor', 'the server room'];

    private const WHEN = ['since this morning', 'since yesterday', 'after the weekend', 'after a Windows update', 'this week', 'a few days ago'];

    private const NOTES = [
        'Checked the device and found the cause', 'Called the user and confirmed the issue', 'Replaced the cable and tested', 'Escalated to the vendor',
        'Updated the driver', 'Asked the user to restart and retest', 'Remote session completed', 'Part ordered, delivery in 3 days', 'Following up with the user',
    ];

    private const RESOLUTIONS = ['Fixed and confirmed with the user', 'Replaced the faulty part', 'Reinstalled the software', 'Configuration corrected', 'Done as requested', 'Vendor repaired the unit'];

    private const CANCEL_REASONS = ['Duplicate case', 'User resolved it themselves', 'No longer needed', 'Opened by mistake'];

    private const TAKE_NOTES = ['Will check today', 'Visiting your desk', 'Remote support started'];

    private const CATEGORY_WEIGHTS = ['hardware' => 35, 'software' => 30, 'network' => 15, 'telephone' => 8, 'cctv' => 5, 'other' => 7];

    /** @var list<array<string, mixed>> */
    private array $employees = [];

    /** @var list<array{0: int, 1: string}> */
    private array $it = [];

    /** @var list<array<string, mixed>> employees with a login */
    private array $users = [];

    /** @var array<int, ?int> user id by employee id */
    private array $userOf = [];

    /** @var list<int> */
    private array $assetIds = [];

    private CarbonImmutable $end;

    public function run(PerfContext $ctx): void
    {
        $this->ctx = $ctx;
        $this->end = $ctx->clock->end();
        TicketSla::flush();
        AppSetting::flushCache();

        $this->employees = $ctx->reg->get('employees');
        foreach ($this->employees as $e) {
            $this->userOf[$e['id']] = $e['user_id'];
            $e['user_id'] !== null && $this->users[] = $e;
            if ($e['kind'] === 'it') {
                $this->it[] = [$e['user_id'], $e['name']];
            }
        }
        $this->assetIds = array_column(array_filter($ctx->reg->get('assets'), fn (array $a): bool => $a['status'] !== 'writeoff'), 'id');

        $drafts = $this->drafts();
        foreach ($drafts as $draft) {
            $this->buildTicket($draft);
        }
    }

    /** @return list<array<string, mixed>> */
    private function drafts(): array
    {
        $rng = $this->ctx->rng;
        $plans = $this->ctx->reg->get('auto_tickets');
        $drafts = [];
        foreach ($plans as $plan) {
            $drafts[] = ['at' => $plan['opened_at'], 'plan' => $plan];
        }
        $manual = max(0, $this->ctx->targets->of('tickets') - count($plans));
        for ($i = 0; $i < $manual; $i++) {
            $drafts[] = ['at' => $this->ctx->clock->moment($rng), 'plan' => null];
        }
        usort($drafts, fn (array $a, array $b): int => $a['at'] <=> $b['at']);

        return $drafts;
    }

    /** @return array<string, mixed> */
    private function requesterAt(CarbonImmutable $at): array
    {
        // Most cases come from people with a login; the rest were opened for them by IT
        $pool = $this->ctx->rng->chance(0.7) ? $this->users : $this->employees;
        for ($try = 0; $try < 12; $try++) {
            $e = $this->ctx->rng->pick($pool);
            if ($e['joined_at'] <= $at && ($e['last_day'] === null || $e['last_day'] > $at)) {
                return $e;
            }
        }

        return $this->employees[0];
    }

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} response and resolve deadlines from the real SLA rules */
    private function deadlines(array $attrs, ?string $requestType): array
    {
        $ticket = (new Ticket)->forceFill($attrs);
        $ticket->setRelation('serviceRequest', $requestType === null ? null : (new ServiceRequest)->forceFill(['type' => $requestType]));

        return [CarbonImmutable::instance(TicketSla::responseDueAt($ticket)), CarbonImmutable::instance(TicketSla::resolveDueAt($ticket))];
    }

    private function alertLevel(CarbonImmutable $start, CarbonImmutable $due, ?CarbonImmutable $doneAt): ?string
    {
        $stop = $doneAt ?? $this->end;
        if ($stop > $due) {
            return 'over_sla';
        }
        $window = $start->diffInSeconds($due);

        return $window > 0 && $start->diffInSeconds($stop) / $window >= 0.8 ? 'near_due' : null;
    }

    /** @param array<string, mixed> $d */
    private function buildTicket(array $d): void
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $sql = $this->ctx->sql;
        $plan = $d['plan'];
        $created = $d['at'];

        $category = $plan !== null ? $plan['category'] : $rng->weighted(self::CATEGORY_WEIGHTS);
        $short = TicketCategory::from($category)->shortCode();
        $requester = $plan !== null ? $this->employees[array_search($plan['employee_id'], array_column($this->employees, 'id'), true)] : $this->requesterAt($created);
        $id = $reg->nextId('tickets');
        $ticketNo = $reg->ticketNo($short, $created);
        [$subject, $description] = $plan !== null ? $this->autoText($plan) : $this->manualText($category);
        $ownerUser = $requester['user_id'];

        // The shape of its life
        $outcome = $plan !== null ? $plan['outcome'] : $rng->weighted(['completed' => 94, 'canceled' => 6]);
        $settledAt = $plan['settled_at'] ?? null;
        $takenAt = null;
        if ($plan === null || $outcome !== 'open' || $rng->chance(0.6)) {
            $takenAt = $created->addMinutes($rng->int(10, 2 * 1440));
            if ($settledAt !== null && $takenAt >= $settledAt) {
                $takenAt = $created->addSeconds((int) ($created->diffInSeconds($settledAt) / 2));
            }
            if ($takenAt > $this->end) {
                $takenAt = null;
            }
        }

        $priority = $takenAt ? $rng->weighted(['critical' => 5, 'high' => 20, 'medium' => 50, 'low' => 25]) : null;
        $workClass = $takenAt ? $rng->weighted(['standard' => 85, 'repair_internal' => 10, 'repair_vendor' => 5]) : 'standard';
        [$assigneeId, $assigneeName] = $takenAt ? $rng->pick($this->it) : [null, null];

        $attrs = ['created_at' => $created, 'responded_at' => $takenAt, 'priority' => $priority, 'work_class' => $workClass, 'category' => $category, 'status' => $takenAt ? 'in_progress' : 'open'];
        [$responseDue, $resolveDue] = $this->deadlines($attrs, $plan['type'] ?? null);

        $resolvedAt = null;
        $status = $takenAt ? 'in_progress' : 'open';
        $resolution = null;
        if ($takenAt && $plan !== null && $settledAt !== null) {
            $resolvedAt = $settledAt;
        } elseif ($takenAt && $plan === null) {
            if ($outcome === 'completed') {
                $window = max(1800, $takenAt->diffInSeconds($resolveDue));
                $ratio = $rng->chance(0.8) ? 0.05 + 0.9 * $rng->float() : 1.05 + 1.95 * $rng->float();
                $at = $takenAt->addSeconds((int) max(1800, $ratio * $window));
            } else {
                $at = $takenAt->addMinutes($rng->int(30, 3 * 1440));
            }
            $resolvedAt = $at <= $this->end ? $at : null;
        }
        if ($resolvedAt !== null) {
            $status = $outcome === 'completed' ? 'completed' : 'canceled';
            $resolution = $status === 'completed' ? ($plan['reason'] ?? $rng->pick(self::RESOLUTIONS)) : 'Cancelled: '.($plan['reason'] ?? $rng->pick(self::CANCEL_REASONS));
        }

        // Updates: notes by the assignee or the requester, sometimes one forward
        $updates = [];
        $forwardedTo = null;
        if ($takenAt) {
            $until = $resolvedAt ?? $this->end;
            $span = max(60, $takenAt->diffInSeconds($until));
            $notes = $rng->weighted([0 => 10, 1 => 20, 2 => 25, 3 => 20, 4 => 15, 5 => 10]);
            for ($i = 0; $i < $notes; $i++) {
                $at = $takenAt->addSeconds($rng->int(30, $span));
                $byStaff = $rng->chance(0.7);
                $updates[] = ['at' => $at, 'kind' => 'note', 'body' => $rng->pick(self::NOTES), 'user_id' => $byStaff ? $assigneeId : $ownerUser, 'author' => $byStaff ? $assigneeName : $requester['name'], 'meta' => null, 'staff' => $byStaff];
            }
            if ($rng->chance(0.10) && count($this->it) > 1) {
                do {
                    [$toId, $toName] = $rng->pick($this->it);
                } while ($toId === $assigneeId);
                $forwardedTo = [$toId, $toName];
                $updates[] = ['at' => $takenAt->addSeconds($rng->int(60, $span)), 'kind' => 'forwarded', 'body' => 'Forwarded to '.$toName, 'user_id' => $assigneeId, 'author' => $assigneeName, 'meta' => ['from' => $assigneeName, 'to' => $toName], 'staff' => true];
            }
            usort($updates, fn (array $a, array $b): int => $a['at'] <=> $b['at']);
        }
        $finalAssignee = $forwardedTo[0] ?? $assigneeId;
        $updatedAt = $resolvedAt ?? ($updates === [] ? ($takenAt ?? $created) : max(array_column($updates, 'at')));

        // SLA alert levels as the sweep would have left them
        $responseLevel = $this->alertLevel($created, $responseDue, $takenAt);
        $resolveLevel = $takenAt ? $this->alertLevel($takenAt, $resolveDue, $resolvedAt) : null;

        $sql->insert('tickets', $this->fill('tickets', [
            'id' => $id, 'ticket_no' => $ticketNo, 'subject' => $subject, 'description' => $description, 'category' => $category, 'priority' => $priority,
            'work_class' => $workClass, 'status' => $status, 'source' => $plan !== null ? 'auto_request' : 'manual', 'requester_id' => $requester['id'],
            'assignee_id' => $finalAssignee, 'callback_phone' => $rng->chance(0.5) ? sprintf('08%d-%03d-%04d', $rng->int(0, 9), $rng->int(100, 999), $rng->int(1000, 9999)) : null,
            'related_asset_id' => $plan === null && $this->assetIds !== [] && $rng->chance(0.3) ? $rng->pick($this->assetIds) : null,
            'take_note' => $takenAt && $rng->chance(0.3) ? $rng->pick(self::TAKE_NOTES) : null, 'resolution' => $resolution, 'resolved_at' => $resolvedAt,
            'responded_at' => $takenAt, 'sla_response_due_at' => $responseDue, 'sla_resolve_due_at' => $resolveDue,
            'sla_response_alert_level' => $responseLevel, 'sla_resolve_alert_level' => $resolveLevel, 'created_at' => $created, 'updated_at' => $updatedAt,
        ]));
        foreach ($updates as $u) {
            $sql->insert('ticket_updates', $this->fill('ticket_updates', [
                'id' => $reg->nextId('ticket_updates'), 'ticket_id' => $id, 'user_id' => $u['user_id'], 'author_name' => $u['author'], 'kind' => $u['kind'],
                'body' => $u['body'], 'meta' => $u['meta'], 'created_at' => $u['at'], 'updated_at' => $u['at'],
            ]));
        }
        $this->attachments($id, $created, $plan);

        if ($plan !== null) {
            $sql->update('service_requests', ['ticket_id' => $id], ['id' => $plan['request_id']]);
        }
        $this->events($id, $ticketNo, $subject, $category, $created, $ownerUser, $takenAt, [$assigneeId, $assigneeName], $forwardedTo, $updates, $resolvedAt, $status, $resolution, $responseLevel, $resolveLevel, [$responseDue, $resolveDue], $takenAt);
    }

    /** @return array{0: string, 1: string} */
    private function autoText(array $plan): array
    {
        $marker = $plan['origin'] === 'onboarding' ? ' (New employee)' : '';
        $subject = mb_substr('['.$plan['reference'].'] '.$plan['title'], 0, 200 - mb_strlen($marker)).$marker;
        $lines = [];
        foreach ($plan['display'] as $row) {
            $lines[] = $row['label_en'].': '.$row['value'];
        }
        $description = "Auto-opened{$marker}\n-----\nService request {$plan['reference']} (Approved).\nType: {$plan['type_label']}\nRequester: {$plan['requester_name']} ({$plan['department_name']})\n"
            .($lines === [] ? '' : implode("\n", $lines)."\n")."\nReason:\n".$plan['request_reason'];

        return [$subject, $description];
    }

    /** @return array{0: string, 1: string} */
    private function manualText(string $category): array
    {
        $rng = $this->ctx->rng;
        $problem = $rng->pick(self::PROBLEMS[$category]);
        $place = $rng->pick(self::PLACES);

        return [$problem.' at '.$place, $problem.' at '.$place.'. It started '.$rng->pick(self::WHEN).'. Please check as soon as possible.'];
    }

    private function attachments(int $ticketId, CarbonImmutable $created, ?array $plan): void
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        if ($plan !== null && $plan['attachment'] !== null) {
            $a = $plan['attachment'];
            $this->ctx->sql->insert('ticket_attachments', $this->fill('ticket_attachments', [
                'id' => $reg->nextId('ticket_attachments'), 'ticket_id' => $ticketId, 'request_attachment_id' => $a['id'], 'original_name' => $a['original_name'],
                'path' => 'tickets/'.$ticketId.'/'.$a['original_name'], 'size' => $a['size'], 'mime' => $a['mime'], 'created_at' => $created, 'updated_at' => $created,
            ]));

            return;
        }
        if ($plan === null && $rng->chance(0.15)) {
            $name = $rng->pick(['screenshot.png', 'error-message.png', 'photo.jpg']);
            $this->ctx->sql->insert('ticket_attachments', $this->fill('ticket_attachments', [
                'id' => $reg->nextId('ticket_attachments'), 'ticket_id' => $ticketId, 'request_attachment_id' => null, 'original_name' => $name,
                'path' => 'tickets/'.$ticketId.'/'.$name, 'size' => $rng->int(30000, 3000000), 'mime' => str_ends_with($name, '.jpg') ? 'image/jpeg' : 'image/png',
                'created_at' => $created, 'updated_at' => $created,
            ]));
        }
    }

    /** @param array{0: ?int, 1: ?string} $assignee */
    private function events(int $id, string $no, string $subject, string $category, CarbonImmutable $created, ?int $ownerUser, ?CarbonImmutable $takenAt, array $assignee, ?array $forwardedTo, array $updates, ?CarbonImmutable $resolvedAt, string $status, ?string $resolution, ?string $responseLevel, ?string $resolveLevel, array $dues, ?CarbonImmutable $start): void
    {
        $reg = $this->ctx->reg;
        $base = ['ticket_id' => $id, 'ticket_no' => $no, 'subject' => $subject, 'owner_user_id' => $ownerUser];
        $recipients = array_column($this->it, 0);
        $reg->event('ticket.created', $base + ['category' => $category, 'at' => $created, 'recipient_user_ids' => $recipients]);

        if ($takenAt) {
            $reg->event('ticket.taken', $base + ['at' => $takenAt, 'assignee_user_id' => $assignee[0], 'assignee_name' => $assignee[1]]);
            if ($forwardedTo !== null) {
                foreach ($updates as $u) {
                    if ($u['kind'] === 'forwarded') {
                        $reg->event('ticket.forwarded', $base + ['at' => $u['at'], 'from_user_id' => $assignee[0], 'from_name' => $assignee[1], 'to_user_id' => $forwardedTo[0], 'to_name' => $forwardedTo[1]]);
                    }
                }
            }
            foreach ($updates as $u) {
                if ($u['kind'] === 'note' && $u['staff']) {
                    $reg->event('ticket.updated', $base + ['at' => $u['at'], 'by_user_id' => $u['user_id'], 'by_name' => $u['author']]);
                }
            }
        }
        if ($resolvedAt !== null) {
            $by = $forwardedTo ?? $assignee;
            $reg->event($status === 'completed' ? 'ticket.resolved' : 'ticket.cancelled', $base + ['at' => $resolvedAt, 'by_user_id' => $by[0], 'by_name' => $by[1], 'resolution' => $resolution]);
        }
        foreach ([['response', $responseLevel, $dues[0], $this->ctx->clock->start()], ['resolve', $resolveLevel, $dues[1], $start]] as [$clock, $level, $due, $from]) {
            if ($level === null || $from === null) {
                continue;
            }
            $at = $level === 'over_sla' ? min($due, $this->end) : min($from->addSeconds((int) (0.8 * $from->diffInSeconds($due))), $this->end);
            $reg->event('ticket.sla', $base + ['subtype' => $clock.'_'.$level, 'at' => max($at, $created), 'recipient_user_ids' => array_values(array_filter([$assignee[0]])) ?: $recipients]);
        }
    }
}
