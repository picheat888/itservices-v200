<?php

namespace App\Support\Perf;

use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Report\ReportExport;
use App\Models\Report\ReportSchedule;
use App\Models\Request\ServiceRequest;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Ticket\Ticket;
use App\Notifications\AssetAssignedNotification;
use App\Notifications\AssetRecalledNotification;
use App\Notifications\AssetReturnRequestedNotification;
use App\Notifications\ContractExpiryNotification;
use App\Notifications\RequestWorkflowNotification;
use App\Notifications\StockAlertNotification;
use App\Notifications\StockCountDraftNotification;
use App\Notifications\StockRequestNotification;
use App\Notifications\TicketCreatedNotification;
use App\Notifications\TicketForwardedNotification;
use App\Notifications\TicketOwnerNotification;
use App\Notifications\TicketSlaAlertNotification;
use App\Support\ReportCatalogue;
use Carbon\CarbonImmutable;

/** Perf step 9: turns every recorded event into the bell, mail and audit rows the app would have written. */
class Logs implements PerfStep
{
    use FillsRows;

    private const NOUN = ['software' => 'software', 'social_platform' => 'social platform', 'email_group' => 'email group', 'file_share' => 'file share'];

    /** @var array<int, array{email: ?string, name: string}> */
    private array $people = [];

    /** @var array<string, true> */
    private array $templates = [];

    /** @var array<string, int> */
    private array $itemIds = [];

    /** @var list<int> */
    private array $it = [];

    /** @var array<int, int> user id by employee id */
    private array $userOf = [];

    private CarbonImmutable $end;

    private int $audits = 0;

    public function run(PerfContext $ctx): void
    {
        $this->ctx = $ctx;
        $this->end = $ctx->clock->end();
        $reg = $ctx->reg;

        foreach ($reg->get('employees') as $e) {
            if ($e['user_id'] !== null) {
                $this->people[$e['user_id']] = ['email' => $e['email'], 'name' => $e['name']];
            }
        }
        $this->people[$reg->get('admin_user_id')] ??= ['email' => null, 'name' => 'Administrator'];
        $this->templates = array_fill_keys($reg->get('email_template_keys'), true);
        foreach ($reg->get('stock_items') as $i) {
            $this->itemIds[$i['sku']] = $i['id'];
        }
        $this->it = $reg->get('it_user_ids');
        $this->userOf = $reg->get('user_by_employee');

        foreach ($reg->events() as [$kind, $d]) {
            $this->handle($kind, $d);
        }
        $this->signIns();
        $this->reports();
    }

    /** @param list<int|null> $userIds */
    private function notify(array $userIds, string $class, array $data, CarbonImmutable $at): void
    {
        $rng = $this->ctx->rng;
        foreach (array_unique(array_filter($userIds)) as $userId) {
            $readAt = null;
            if ($rng->chance($at > $this->end->subDays(7) ? 0.40 : 0.88)) {
                $read = $at->addMinutes($rng->int(1, 3 * 1440));
                $readAt = $read <= $this->end ? $read : null;
            }
            $this->ctx->sql->insert('notifications', $this->fill('notifications', [
                'id' => $rng->uuid(), 'type' => $class, 'notifiable_type' => 'App\Models\User', 'notifiable_id' => $userId,
                'data' => $data, 'read_at' => $readAt, 'created_at' => $at, 'updated_at' => $at,
            ]));
        }
    }

    private function audit(string $action, ?string $target, ?string $subjectType, ?int $subjectId, ?array $details, CarbonImmutable $at, ?int $userId, ?string $userName = null): void
    {
        $this->audits++;
        $this->ctx->sql->insert('audit_logs', $this->fill('audit_logs', [
            'id' => $this->ctx->reg->nextId('audit_logs'), 'user_id' => $userId, 'user_name' => $userName ?? ($this->people[$userId]['name'] ?? 'System'),
            'action' => $action, 'target' => $target, 'subject_type' => $subjectType, 'subject_id' => $subjectId, 'details' => $details,
            'created_at' => $at, 'updated_at' => $at,
        ]));
    }

    private function email(string $key, ?int $userId, string $subject, string $text, CarbonImmutable $at, float $probability): void
    {
        $rng = $this->ctx->rng;
        if ($userId === null || ! isset($this->templates[$key]) || ! $rng->chance($probability)) {
            return;
        }
        $person = $this->people[$userId] ?? null;
        $status = $person === null || $person['email'] === null ? 'skipped' : $rng->weighted(['sent' => 95, 'failed' => 3, 'skipped' => 2]);
        $this->ctx->sql->insert('email_logs', $this->fill('email_logs', [
            'id' => $this->ctx->reg->nextId('email_logs'), 'template_key' => $key, 'to_email' => $status === 'skipped' ? null : $person['email'],
            'recipient_name' => $person['name'] ?? null, 'subject' => '[IT Service Desk] '.$subject,
            'body_html' => '<p>Hello '.($person['name'] ?? '').',</p><p>'.$text.'</p>', 'status' => $status,
            'error' => match ($status) {
                'skipped' => 'Recipient has no email address',
                'failed' => 'Connection timed out',
                default => null,
            }, 'created_at' => $at,
        ]));
    }

    /** @param array<string, mixed> $d */
    private function handle(string $kind, array $d): void
    {
        $rng = $this->ctx->rng;
        $at = $d['at'] ?? null;
        switch ($kind) {
            case 'ticket.created':
                $ticketData = ['type' => 'ticket_new', 'ticket_id' => $d['ticket_id'], 'ticket_no' => $d['ticket_no'], 'subject' => $d['subject']];
                $others = array_values(array_diff($d['recipient_user_ids'], [$d['owner_user_id']]));
                $this->notify(array_slice($rng->shuffle($others), 0, 2), TicketCreatedNotification::class, $ticketData, $at);
                $auto = str_starts_with($d['subject'], '[RQ-');
                $this->audit('Created ticket', $d['ticket_no'], Ticket::class, $d['ticket_id'], null, $at, $auto ? null : $d['owner_user_id']);
                $this->email('ticket.created', $d['owner_user_id'], 'Ticket '.$d['ticket_no'].' opened', $d['subject'], $at, 0.35);
                break;
            case 'ticket.taken':
                $this->ticketOwner($d, 'taken', $d['assignee_name'], $at, 1.0);
                $this->audit('Took ticket', $d['ticket_no'], Ticket::class, $d['ticket_id'], null, $at, $d['assignee_user_id']);
                break;
            case 'ticket.forwarded':
                $this->notify([$d['to_user_id']], TicketForwardedNotification::class, ['type' => 'ticket_forwarded', 'ticket_id' => $d['ticket_id'], 'ticket_no' => $d['ticket_no'], 'subject' => $d['subject'], 'from' => $d['from_name']], $at);
                $this->ticketOwner($d, 'forwarded', $d['to_name'], $at, 1.0);
                $this->audit('Assigned ticket', $d['ticket_no'], Ticket::class, $d['ticket_id'], ['to' => $d['to_name']], $at, $d['from_user_id']);
                break;
            case 'ticket.updated':
                $this->ticketOwner($d, 'updated', $d['by_name'], $at, 0.3);
                $this->audit('Updated ticket progress', $d['ticket_no'], Ticket::class, $d['ticket_id'], null, $at, $d['by_user_id']);
                break;
            case 'ticket.resolved':
            case 'ticket.cancelled':
                $done = $kind === 'ticket.resolved';
                $this->ticketOwner($d, $done ? 'resolved' : 'cancelled', $d['by_name'], $at, 1.0);
                $this->audit('Resolved ticket', $d['ticket_no'], Ticket::class, $d['ticket_id'], ['status' => $done ? 'completed' : 'canceled', 'resolution' => $d['resolution']], $at, $d['by_user_id']);
                $done && $this->email('ticket.resolved', $d['owner_user_id'], 'Ticket '.$d['ticket_no'].' resolved', (string) $d['resolution'], $at, 0.5);
                break;
            case 'ticket.sla':
                $this->notify($d['recipient_user_ids'], TicketSlaAlertNotification::class, ['type' => 'ticket_sla', 'subtype' => $d['subtype'], 'ticket_id' => $d['ticket_id'], 'ticket_no' => $d['ticket_no'], 'subject' => $d['subject']], $at);
                break;

            case 'request.submitted':
            case 'request.waiting':
            case 'request.approved_step':
            case 'request.approved_final':
            case 'request.ready_to_complete':
            case 'request.rejected':
            case 'request.completed':
            case 'request.cancelled':
                $this->request($kind, $d, $at);
                break;

            case 'asset.registered':
                $this->audit('Registered asset', $d['code'], Asset::class, $d['asset_id'], null, $at, $d['by_user_id']);
                break;
            case 'asset.handover':
                $this->audit('Transferred asset', $d['code'], Asset::class, $d['asset_id'], ['from' => $d['from']], $at, $d['by_user_id']);
                if ($d['employee_id'] !== null) {
                    $this->notify([$this->userOf[$d['employee_id']] ?? null], AssetAssignedNotification::class, $this->assetData('asset_assigned', $d) + ['from' => $d['from']], $at);
                    $this->email('asset.assigned', $this->userOf[$d['employee_id']] ?? null, 'Asset '.$d['code'].' assigned to you', $d['model'], $at, 0.5);
                }
                break;
            case 'asset.accepted':
                $this->audit('Accepted asset', $d['code'], Asset::class, $d['asset_id'], null, $at, $this->userOf[$d['employee_id']] ?? null);
                break;
            case 'asset.return_requested':
                $this->audit('Requested asset return', $d['code'], Asset::class, $d['asset_id'], null, $at, $d['by_user_id']);
                $this->notify(array_slice($rng->shuffle($this->it), 0, 2), AssetReturnRequestedNotification::class, $this->assetData('asset_return_requested', $d) + ['from' => $d['by_name']], $at);
                break;
            case 'asset.received':
                $this->audit('Received asset', $d['code'], Asset::class, $d['asset_id'], ['warehouse' => $d['warehouse']], $at, $d['by_user_id']);
                break;
            case 'asset.recalled':
                $this->audit('Transferred asset', $d['code'], Asset::class, $d['asset_id'], ['reason' => 'Recalled'], $at, $d['by_user_id']);
                $this->notify([$this->userOf[$d['employee_id']] ?? null], AssetRecalledNotification::class, $this->assetData('asset_recalled', $d) + ['subtype' => 'cancelled'], $at);
                break;
            case 'asset.relocated':
                $this->audit('Updated asset location', $d['code'], Asset::class, $d['asset_id'], null, $at, $d['by_user_id']);
                break;
            case 'asset.writeoff':
                $this->audit('Bulk asset writeoff', $d['code'], Asset::class, $d['asset_id'], ['returned_to_vendor' => $d['returned']], $at, $d['by_user_id']);
                break;

            case 'contract.created':
                $this->audit('Created contract', $d['code'], Contract::class, $d['contract_id'], null, $at, $d['by_user_id']);
                break;
            case 'contract.expired':
                $this->audit('Expired contract', $d['code'], Contract::class, $d['contract_id'], null, $at, $d['by_user_id']);
                break;
            case 'contract.cancelled':
                $this->audit('Cancelled contract', $d['code'], Contract::class, $d['contract_id'], null, $at, $d['by_user_id']);
                break;
            case 'contract.alert':
                $data = ['type' => 'contract_expiring', 'subtype' => 'expiry', 'contract_id' => $d['contract_id'], 'contract_code' => $d['code'],
                    'contract_vendor' => $this->ctx->reg->get('vendor_names')[$d['vendor_id']] ?? null, 'contract_name' => $d['name'], 'days_remaining' => $d['threshold']];
                $this->notify(array_slice($rng->shuffle($this->it), 0, 2), ContractExpiryNotification::class, $data, $at);
                $this->email($d['threshold'] === 0 ? 'contract.expired_alert' : 'contract.expiry_alert', $this->it[0] ?? null, 'Contract '.$d['code'].' expiry', $d['name'], $at, 0.5);
                break;

            case 'stock.movement':
                $this->audit('Stock '.$d['type'], $d['sku'].' ×'.$d['qty'], StockItem::class, $this->itemIds[$d['sku']] ?? null, null, $at, $d['user_id'], $d['by_name']);
                break;
            case 'stock.request':
                $this->stockRequest($d, $at);
                break;
            case 'stock.alert':
                $this->notify(array_slice($rng->shuffle($this->it), 0, 2), StockAlertNotification::class, ['type' => 'stock_alert', 'subtype' => $d['subtype'], 'stock_item_id' => $d['stock_item_id'], 'sku' => $d['sku'], 'name' => $d['name'], 'qty' => $d['qty']], $at);
                break;
            case 'stock.count_opened':
                $this->audit('Opened stock count', $d['reference'], StockCount::class, $d['stock_count_id'], null, $at, $d['user_id'], $d['by_name']);
                $d['draft'] && $this->notify(array_slice($rng->shuffle($this->it), 0, 2), StockCountDraftNotification::class, ['type' => 'stock_count', 'subtype' => 'draft', 'stock_count_id' => $d['stock_count_id'], 'reference' => $d['reference']], $at);
                break;
            case 'stock.count_committed':
                $this->audit('Committed stock count', $d['reference'], StockCount::class, $d['stock_count_id'], null, $at, $d['user_id'], $d['by_name']);
                break;

            case 'access.resource_created':
                $this->audit('Created '.self::NOUN[$d['type']], $d['name'], $d['type'], $d['id'], null, $at, $d['by_user_id']);
                break;
            case 'access.granted':
                $this->audit('Added member to '.self::NOUN[$d['type']], $d['resource_name'], $d['type'], $d['resource_id'], ['employee' => $d['employee_name']], $at, $d['by_user_id'], $d['by_name']);
                break;
            case 'access.revoked':
                $this->audit('Removed member from '.self::NOUN[$d['type']], $d['resource_name'], $d['type'], $d['resource_id'], ['employee' => $d['employee_name']], $at, $d['by_user_id'], $d['by_name']);
                break;
        }
    }

    /** @param array<string, mixed> $d */
    private function ticketOwner(array $d, string $event, ?string $by, CarbonImmutable $at, float $probability): void
    {
        if ($d['owner_user_id'] === null || ! $this->ctx->rng->chance($probability)) {
            return;
        }
        $this->notify([$d['owner_user_id']], TicketOwnerNotification::class, ['type' => 'ticket_owner', 'event' => $event, 'ticket_id' => $d['ticket_id'], 'ticket_no' => $d['ticket_no'], 'subject' => $d['subject'], 'by' => $by], $at);
    }

    /** @param array<string, mixed> $d */
    private function assetData(string $type, array $d): array
    {
        return ['type' => $type, 'asset_id' => $d['asset_id'], 'asset_tag' => $d['code'], 'asset_model' => $d['model'] ?? null, 'asset_nickname' => null];
    }

    /** @param array<string, mixed> $d */
    private function request(string $kind, array $d, CarbonImmutable $at): void
    {
        $rng = $this->ctx->rng;
        $subtype = substr($kind, strlen('request.'));
        $followers = array_values(array_unique(array_filter([$d['owner_user_id'], $d['submitter_user_id'] ?? null])));
        $toApprovers = in_array($subtype, ['waiting', 'ready_to_complete'], true);
        $recipients = $toApprovers ? array_slice($rng->shuffle($d['approver_user_ids'] ?? []), 0, 3) : $followers;

        $this->notify($recipients, RequestWorkflowNotification::class, [
            'type' => 'request', 'subtype' => $subtype, 'service_request_id' => $d['request_id'], 'reference' => $d['reference'], 'title' => $d['title'],
            'request_type' => $d['request_type'], 'origin' => $d['origin'], 'requester_name' => $d['requester_name'], 'step_label' => $d['step_label'] ?? null,
            'actor_name' => $d['actor_name'] ?? $d['requester_name'], 'remark' => $d['remark'] ?? null, 'ticket_id' => null, 'ticket_no' => null,
            'employee_id' => $d['employee_id'], 'employee_name' => $d['requester_name'], 'stalled_days' => null,
        ], $at);

        $subjectId = $d['request_id'];
        switch ($subtype) {
            case 'submitted':
                $this->audit('Submitted service request', $d['reference'], ServiceRequest::class, $subjectId, null, $at, $d['submitter_user_id']);
                $this->email('request.submitted', $d['owner_user_id'], 'Request '.$d['reference'].' submitted', $d['title'], $at, 0.3);
                break;
            case 'waiting':
                $this->email('request.approval_needed', $recipients[0] ?? null, 'Request '.$d['reference'].' needs your approval', $d['title'], $at, 0.25);
                break;
            case 'approved_step':
                $this->audit('Approved service request step', $d['reference'], ServiceRequest::class, $subjectId, ['step' => $d['step_label']], $at, $d['actor_user_id'], $d['actor_name']);
                break;
            case 'approved_final':
                $this->email('request.approved', $d['owner_user_id'], 'Request '.$d['reference'].' approved', $d['title'], $at, 0.4);
                break;
            case 'rejected':
                $this->audit('Rejected service request', $d['reference'], ServiceRequest::class, $subjectId, ['step' => $d['step_label'], 'remark' => $d['remark']], $at, $d['actor_user_id'], $d['actor_name']);
                $this->email('request.rejected', $d['owner_user_id'], 'Request '.$d['reference'].' rejected', (string) $d['remark'], $at, 1.0);
                break;
            case 'completed':
                $this->audit('Completed service request', $d['reference'], ServiceRequest::class, $subjectId, null, $at, $d['actor_user_id'], $d['actor_name']);
                $this->email('request.completed', $d['owner_user_id'], 'Request '.$d['reference'].' completed', $d['title'], $at, 0.5);
                break;
            case 'cancelled':
                $this->audit($d['delivered'] ? 'Cancelled request via ticket' : 'Cancelled service request', $d['reference'], ServiceRequest::class, $subjectId, null, $at, $d['actor_user_id'], $d['actor_name']);
                break;
        }
    }

    /** @param array<string, mixed> $d */
    private function stockRequest(array $d, CarbonImmutable $at): void
    {
        $rng = $this->ctx->rng;
        $subtype = $d['subtype'];
        $itemId = $this->itemIds[$d['sku']] ?? null;
        $label = ['created' => 'Submitted stock request', 'approved' => 'Approved stock request', 'rejected' => 'Rejected stock request', 'fulfilled' => 'Fulfilled stock request'][$subtype] ?? null;
        $label !== null && $this->audit($label, $d['reference'], StockItem::class, $itemId, null, $at, $d['actor_user_id'], $d['actor_name']);

        if ($subtype === 'created') {
            return;
        }
        $recipients = $subtype === 'waiting' ? array_slice($rng->shuffle($d['approver_user_ids']), 0, 2) : [$d['requester_user_id']];
        $this->notify($recipients, StockRequestNotification::class, [
            'type' => 'stock_request', 'subtype' => $subtype, 'stock_request_id' => $d['request_id'], 'reference' => $d['reference'],
            'sku' => $d['sku'], 'name' => $d['name'], 'qty' => $d['qty'],
        ], $at);
    }

    // Sign-in and sign-out make up about 40 percent of the audit trail
    private function signIns(): void
    {
        $rng = $this->ctx->rng;
        $userIds = array_keys($this->people);
        $logins = (int) round(($this->audits * 0.4 / 0.6) / 1.65);
        for ($i = 0; $i < $logins; $i++) {
            $userId = $rng->pick($userIds);
            $in = $this->ctx->clock->moment($rng)->setTime($rng->int(7, 10), $rng->int(0, 59));
            $this->audit('Signed in', null, null, null, null, $in, $userId);
            if ($rng->chance(0.65)) {
                $out = $in->addMinutes($rng->int(240, 600));
                $this->audit('Signed out', null, null, null, null, min($out, $this->end), $userId);
            }
        }
    }

    private function reports(): void
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $sql = $this->ctx->sql;
        $keys = array_keys(ReportCatalogue::definitions());
        $users = array_merge($this->it, [$reg->get('admin_user_id')]);

        for ($i = 0; $i < $this->ctx->targets->of('report_exports'); $i++) {
            $key = $rng->pick($keys);
            $format = $rng->pick(ReportCatalogue::definitions()[$key]['formats']);
            $created = $this->ctx->clock->moment($rng);
            $status = $rng->weighted([ReportExport::READY => 93, ReportExport::FAILED => 7]);
            $finished = $created->addSeconds($rng->int(3, 90));
            $name = str_replace('.', '-', $key).'-'.$created->format('Ymd').'.'.$format;
            $sql->insert('report_exports', $this->fill('report_exports', [
                'id' => $reg->nextId('report_exports'), 'user_id' => $rng->pick($users), 'report_key' => $key, 'format' => $format,
                'filters' => ['from' => $created->subDays(30)->toDateString(), 'to' => $created->toDateString()], 'columns' => null, 'status' => $status,
                'file_name' => $status === ReportExport::READY ? $name : null, 'file_path' => $status === ReportExport::READY ? 'exports/'.$name : null,
                'rows_count' => $status === ReportExport::READY ? $rng->int(5, 20000) : null, 'size_bytes' => $status === ReportExport::READY ? $rng->int(8000, 6000000) : null,
                'error' => $status === ReportExport::FAILED ? 'timeout' : null, 'started_at' => $created, 'finished_at' => $finished,
                'expires_at' => $finished->addDays(ReportExport::KEEP_DAYS), 'created_at' => $created, 'updated_at' => $finished,
            ]));
        }

        for ($i = 0; $i < $this->ctx->targets->of('report_schedules'); $i++) {
            $key = $rng->pick($keys);
            $frequency = $rng->pick(ReportSchedule::FREQUENCIES);
            $hour = $rng->int(6, 9);
            $created = $this->ctx->clock->moment($rng);
            $active = $rng->chance(0.85);
            $last = $this->end->subDays($rng->int(1, 7))->setTime($hour, 0);
            $sql->insert('report_schedules', $this->fill('report_schedules', [
                'id' => $reg->nextId('report_schedules'), 'user_id' => $rng->pick($users), 'report_key' => $key, 'format' => 'xlsx', 'filters' => null, 'columns' => null,
                'frequency' => $frequency, 'send_hour' => $hour, 'recipients' => [strtolower(NamePool::first($rng)).'@perf.local'], 'active' => $active,
                'next_run_at' => $active ? $this->end->addDay()->setTime($hour, 0) : null, 'last_run_at' => $last,
                'last_status' => $rng->weighted([ReportSchedule::SENT => 95, ReportSchedule::FAILED => 5]), 'last_error' => null,
                'created_at' => $created, 'updated_at' => $last,
            ]));
        }
    }
}
