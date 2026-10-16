<?php

namespace App\Support\Perf;

use App\Enums\Request\RequestType;
use Carbon\CarbonImmutable;

/** Perf step 7: service requests with approval chains resolved from the manager line, played out over time. */
class Requests implements PerfStep
{
    use FillsRows;

    private const TYPE_WEIGHTS = [
        'computer' => 12, 'hardware' => 14, 'mobile' => 6, 'email' => 8, 'social' => 3, 'fileshare' => 12, 'software' => 14,
        'recovery' => 3, 'mailgroup' => 6, 'telephone' => 4, 'network' => 6, 'cctv' => 2, 'other' => 10,
    ];

    private const ONBOARDING_TYPES = ['computer', 'email', 'mobile', 'software'];

    private const REASONS = [
        'Needed for daily work', 'Replacing a broken item', 'New project requirement', 'Requested by my manager', 'Moving to a new team',
        'Current one is too slow', 'Needed for customer visit', 'Audit requirement',
    ];

    private const RESOLUTIONS = ['Done as requested', 'Installed and tested with the user', 'Account created and sent to the requester', 'Completed, user confirmed', 'Access granted'];

    private const REJECT_NOTES = ['Not justified', 'Please use the shared equipment', 'Budget not available', 'Duplicate of an earlier request'];

    private const LABELS = [
        'device_id' => ['Device type', 'อุปกรณ์ที่ต้องการ'], 'sim' => ['SIM & data plan', 'ต้องการซิม / แพ็กเกจดาต้า'], 'address' => ['Address', 'อีเมล'],
        'social_platform_id' => ['Platform', 'แพลตฟอร์ม'], 'file_share_id' => ['Share path', 'โฟลเดอร์ที่ต้องเข้าถึง'], 'access_level' => ['Access level', 'ระดับสิทธิ์'],
        'email_group_id' => ['Mail group', 'กลุ่มเมล'], 'software_id' => ['Software', 'ซอฟต์แวร์'], 'software_other' => ['Other software', 'ซอฟต์แวร์อื่น ๆ'],
        'device_type_id' => ['Device', 'ประเภทเครื่อง'], 'location_id' => ['Install location', 'สถานที่ติดตั้ง'],
    ];

    /** @var array<int, array<string, mixed>> employees by id */
    private array $emp = [];

    /** @var list<array<string, mixed>> */
    private array $users = [];

    /** @var list<array<string, mixed>> */
    private array $hr = [];

    /** @var list<array<string, mixed>> */
    private array $it = [];

    /** @var array<int, list<array<string, mixed>>> users who lead a department, by department id */
    private array $deptUsers = [];

    /** @var array<string, list<array<string, mixed>>> */
    private array $options = [];

    private CarbonImmutable $end;

    public function run(PerfContext $ctx): void
    {
        $this->ctx = $ctx;
        $this->end = $ctx->clock->end();
        $reg = $ctx->reg;

        foreach ($reg->get('employees') as $e) {
            $this->emp[$e['id']] = $e + ['position_id' => $reg->get('position_by_title')[$e['position_title']]];
            if ($e['user_id'] !== null) {
                $this->users[] = $this->emp[$e['id']];
                if (in_array($e['kind'], ['manager', 'supervisor'], true)) {
                    $this->deptUsers[$e['dept_id']][] = $this->emp[$e['id']];
                }
            }
            $e['kind'] === 'hr' && $this->hr[] = $this->emp[$e['id']];
            $e['kind'] === 'it' && $this->it[] = $this->emp[$e['id']];
        }
        foreach ($reg->get('request_options') as $o) {
            $this->options[$o['request_type'].'|'.$o['field_key']][] = $o;
        }

        $plans = [];
        foreach ($this->draftRequests() as $draft) {
            $plan = $this->buildRequest($draft);
            if ($plan !== null) {
                $plans[] = $plan;
            }
        }
        $reg->remember('auto_tickets', $plans);
    }

    /** @return list<array<string, mixed>> drafts in creation order */
    private function draftRequests(): array
    {
        $rng = $this->ctx->rng;
        $clock = $this->ctx->clock;
        $windowJoiners = array_values(array_filter($this->emp, fn (array $e): bool => $e['kind'] === 'staff' && $e['status'] === 'active' && $e['joined_at'] >= $clock->start()));

        $drafts = [];
        for ($i = 0; $i < $this->ctx->targets->of('service_requests'); $i++) {
            $type = $rng->weighted(self::TYPE_WEIGHTS);
            $draft = null;
            if (in_array($type, self::ONBOARDING_TYPES, true) && $windowJoiners !== [] && $rng->chance(0.375)) {
                $joiner = $rng->pick($windowJoiners);
                $at = $joiner['joined_at']->addDays($rng->int(1, 3))->setTime($rng->int(9, 16), $rng->int(0, 59));
                if ($at <= $this->end) {
                    $submitter = $rng->pick($this->hr);
                    $draft = ['type' => $type, 'origin' => 'onboarding', 'at' => $at, 'employee' => $joiner, 'owner_user' => null, 'submitter' => $submitter];
                }
            }
            if ($draft === null) {
                $at = $clock->moment($rng);
                $who = $this->userAt($at);
                $draft = ['type' => $type, 'origin' => 'direct', 'at' => $at, 'employee' => $who, 'owner_user' => $who['user_id'], 'submitter' => $who];
            }
            $drafts[] = $draft;
        }
        usort($drafts, fn (array $a, array $b): int => $a['at'] <=> $b['at']);

        return $drafts;
    }

    /** @return array<string, mixed> */
    private function userAt(CarbonImmutable $at): array
    {
        for ($try = 0; $try < 12; $try++) {
            $e = $this->ctx->rng->pick($this->users);
            if ($e['joined_at'] <= $at && ($e['last_day'] === null || $e['last_day'] > $at)) {
                return $e;
            }
        }

        return $this->users[0];
    }

    /** @return list<array<string, mixed>> active managers above the employee, nearest first */
    private function managerLine(array $employee): array
    {
        $line = [];
        $cur = $employee;
        for ($i = 0; $i < 12 && $cur['manager_id'] !== null; $i++) {
            $cur = $this->emp[$cur['manager_id']];
            if ($cur['status'] === 'active') {
                $line[] = $cur;
            }
        }

        return $line;
    }

    /** @return array{0: list<array<string, mixed>>, 1: array<string, mixed>, 2: array<string, mixed>, 3: ?int} display rows, raw fields, columns, resource owner */
    private function fieldsFor(string $type): array
    {
        $rng = $this->ctx->rng;
        $resources = $this->ctx->reg->get('resources');
        $display = [];
        $raw = [];
        $columns = [];
        $owner = null;
        $add = function (string $key, string $value, ?string $valueTh = null) use (&$display): void {
            $display[] = ['key' => $key, 'label_en' => self::LABELS[$key][0], 'label_th' => self::LABELS[$key][1], 'value' => $value, 'value_th' => $valueTh, 'mono' => false];
        };
        $managed = function (string $field) use ($type, $rng, &$columns, $add): void {
            $options = $this->options[$type.'|'.$field] ?? [];
            if ($options !== []) {
                $o = $rng->pick($options);
                $columns['request_option_id'] = $o['id'];
                $add($field, $o['label_en'], $o['label_th'] ?: $o['label_en']);
            }
        };

        switch ($type) {
            case 'computer':
            case 'hardware':
                $managed('device_id');
                break;
            case 'mobile':
                $managed('device_id');
                $sim = $rng->pick(['yes', 'no']);
                $raw['sim'] = $sim;
                $add('sim', $sim === 'yes' ? 'Yes' : 'No', $sim === 'yes' ? 'ต้องการ' : 'ไม่ต้องการ');
                break;
            case 'email':
                $raw['address'] = strtolower(NamePool::first($rng)).'.'.strtolower(substr(NamePool::last($rng), 0, 1)).$rng->int(1, 99).'@perf.local';
                $add('address', $raw['address'], $raw['address']);
                break;
            case 'social':
                $s = $rng->pick($resources['social_platform']);
                $columns['social_platform_id'] = $s['id'];
                $add('social_platform_id', $s['name']);
                break;
            case 'fileshare':
                $f = $rng->pick($resources['file_share']);
                $columns['file_share_id'] = $f['id'];
                $owner = $f['owner'];
                $add('file_share_id', $f['path']);
                $level = $rng->pick(['read', 'write']);
                $raw['access_level'] = $level;
                $add('access_level', $level === 'read' ? 'Read' : 'Read/Write', $level === 'read' ? 'อ่านอย่างเดียว' : 'อ่าน-เขียน');
                break;
            case 'mailgroup':
                $g = $rng->pick($resources['email_group']);
                $columns['email_group_id'] = $g['id'];
                $owner = $g['owner'];
                $add('email_group_id', $g['email']);
                break;
            case 'software':
                if ($rng->chance(0.85)) {
                    $s = $rng->pick($resources['software']);
                    $columns['software_id'] = $s['id'];
                    $add('software_id', $s['name']);
                } else {
                    $raw['software_other'] = 'AutoCAD LT 2026';
                    $add('software_other', 'AutoCAD LT 2026');
                }
                break;
            case 'telephone':
                $managed('device_type_id');
                $locationId = $rng->pick($this->ctx->reg->get('location_ids'));
                $columns['location_id'] = $locationId;
                $add('location_id', $this->ctx->reg->get('location_names')[$locationId]);
                break;
        }

        return [$display, $raw, $columns, $owner];
    }

    /** @return list<array<string, mixed>> */
    private function resolveSteps(string $type, array $employee, ?int $resourceOwner): array
    {
        $steps = $this->ctx->reg->get('workflow_steps')[$type] ?? [];
        $line = $this->managerLine($employee);
        $rows = [];
        $cursor = 0;
        $chainResolved = 0;
        $lastChain = null;
        $noManagerRowDone = false;

        foreach ($steps as $step) {
            $row = [
                'actor_type' => $step['actor_type'], 'kind' => $step['kind'], 'label' => $step['label'], 'approver_employee_id' => null, 'approver_name' => null,
                'approver_department_id' => null, 'approver_position_ids' => null, 'approver_employee_ids' => null, 'status' => 'waiting', 'skip_reason' => null,
            ];
            if ($step['actor_type'] === 'chain') {
                if ($line === []) {
                    if ($noManagerRowDone) {
                        continue;
                    }
                    $noManagerRowDone = true;
                    $row['label'] = implode(', ', array_column(array_filter($steps, fn (array $s): bool => $s['actor_type'] === 'chain'), 'label'));
                    $row['status'] = 'skipped';
                    $row['skip_reason'] = 'no_manager';
                } else {
                    $found = null;
                    for ($i = $cursor; $i < count($line); $i++) {
                        if (in_array($line[$i]['position_id'], $step['position_ids'], true)) {
                            $found = $i;
                            break;
                        }
                    }
                    if ($found === null) {
                        $row['status'] = 'skipped';
                        $row['skip_reason'] = 'no_matching_position';
                    } else {
                        $cursor = $found + 1;
                        $chainResolved++;
                        $row['approver_employee_id'] = $line[$found]['id'];
                        $row['approver_name'] = $line[$found]['name'];
                    }
                    $lastChain = count($rows);
                }
            } elseif ($step['actor_type'] === 'owner') {
                if ($resourceOwner === null) {
                    $row['status'] = 'skipped';
                    $row['skip_reason'] = 'no_resource_owner';
                } elseif ($resourceOwner === $employee['id']) {
                    $row['status'] = 'skipped';
                    $row['skip_reason'] = 'requester_is_owner';
                } else {
                    $row['approver_employee_id'] = $resourceOwner;
                    $row['approver_name'] = $this->emp[$resourceOwner]['name'];
                }
            } elseif ($step['actor_type'] === 'department') {
                if (count($step['approver_employee_ids']) === 1) {
                    $row['approver_employee_id'] = $step['approver_employee_ids'][0];
                    $row['approver_name'] = $this->emp[$step['approver_employee_ids'][0]]['name'] ?? null;
                } elseif ($step['approver_employee_ids'] !== []) {
                    $row['approver_employee_ids'] = $step['approver_employee_ids'];
                } elseif ($step['department_id'] !== null) {
                    $row['approver_department_id'] = $step['department_id'];
                    $row['approver_position_ids'] = $step['position_ids'];
                } else {
                    $row['status'] = 'skipped';
                    $row['skip_reason'] = 'no_department_approver';
                }
            }
            $rows[] = $row;
        }

        // Nobody on the line held a rung: the top manager approves instead
        if ($chainResolved === 0 && $line !== [] && $lastChain !== null) {
            $top = $line[array_key_last($line)];
            $rows[$lastChain]['status'] = 'waiting';
            $rows[$lastChain]['skip_reason'] = null;
            $rows[$lastChain]['approver_employee_id'] = $top['id'];
            $rows[$lastChain]['approver_name'] = $top['name'];
        }

        // Neighbouring steps held by the same person become one
        $merged = [];
        foreach ($rows as $row) {
            $prev = $merged === [] ? null : $merged[array_key_last($merged)];
            if ($prev !== null && $row['approver_employee_id'] !== null && $prev['approver_employee_id'] === $row['approver_employee_id'] && $prev['kind'] === $row['kind']) {
                $merged[array_key_last($merged)]['label'] .= ', '.$row['label'];

                continue;
            }
            $merged[] = $row;
        }

        return $merged;
    }

    /** @return list<int> user ids of whoever may act on the row */
    private function approverUsers(array $row): array
    {
        if ($row['kind'] === 'completion') {
            return array_column($this->it, 'user_id');
        }
        if ($row['approver_employee_id'] !== null) {
            return array_values(array_filter([$this->emp[$row['approver_employee_id']]['user_id'] ?? null]));
        }
        $pool = $this->deptUsers[$row['approver_department_id'] ?? 0] ?? $this->users;

        return array_values(array_unique(array_column($pool, 'user_id')));
    }

    /** @return array<string, mixed>|null the auto-ticket plan, if the request opens one */
    private function buildRequest(array $d): ?array
    {
        $rng = $this->ctx->rng;
        $reg = $this->ctx->reg;
        $sql = $this->ctx->sql;
        $type = $d['type'];
        $employee = $d['employee'];
        $created = $d['at'];
        $requestType = RequestType::from($type);
        $autoTicket = (bool) ($reg->get('workflow_auto_ticket')[$type] ?? false);

        $id = $reg->nextId('service_requests');
        $reference = $reg->yearNo('RQ', $created->year, 4);
        [$display, $raw, $columns, $owner] = $this->fieldsFor($type);
        $rows = $this->resolveSteps($type, $employee, $owner);
        $title = $d['origin'] === 'onboarding' ? $requestType->label().' for '.$employee['name'] : 'Request: '.$requestType->label();
        $itUser = $rng->pick($this->it);

        $base = [
            'request_id' => $id, 'reference' => $reference, 'title' => $title, 'request_type' => $type, 'origin' => $d['origin'], 'requester_name' => $employee['name'],
            'owner_user_id' => $d['owner_user'], 'submitter_user_id' => $d['submitter']['user_id'], 'submitter_name' => $d['submitter']['name'], 'employee_id' => $employee['id'],
        ];
        $reg->event('request.submitted', $base + ['at' => $created]);

        // What happens to it: completed mostly; some rejected or cancelled; a few sit with an approver for weeks
        $plan = $rng->weighted(['completed' => 90, 'rejected' => 6, 'cancelled' => 4]);
        $stalled = $rng->chance(0.04);
        $approvalIdx = array_keys(array_filter($rows, fn (array $r): bool => $r['kind'] === 'approval' && $r['status'] !== 'skipped'));
        $completionIdx = array_key_last(array_filter($rows, fn (array $r): bool => $r['kind'] === 'completion'));
        if ($plan === 'rejected' && $approvalIdx === []) {
            $plan = 'completed';
        }
        $rejectStage = $plan === 'rejected' ? $rng->int(0, count($approvalIdx) - 1) : null;
        $cancelPre = $plan === 'cancelled' && (! $autoTicket || $rng->chance(0.5));
        $cancelStage = $cancelPre && $approvalIdx !== [] ? $rng->int(0, count($approvalIdx) - 1) : null;
        $cancelPre = $cancelPre && $cancelStage !== null;
        if ($plan === 'cancelled' && ! $cancelPre && ! $autoTicket) {
            $plan = 'completed';
        }

        $status = 'pending';
        $t = $created;
        $last = $created;
        $times = ['approved' => null, 'rejected' => null, 'completed' => null, 'cancelled' => null];
        $cancel = null;
        $reason = null;

        foreach ($approvalIdx as $n => $idx) {
            $rows[$idx]['status'] = 'current';
            $rows[$idx]['became_current_at'] = $t;
            $reg->event('request.waiting', $base + ['at' => $t, 'step_label' => $rows[$idx]['label'], 'approver_user_ids' => $this->approverUsers($rows[$idx])]);

            if ($cancelPre && $n === $cancelStage) {
                $at = $this->ctx->clock->after($t, $rng, 60, 3 * 1440);
                if ($at > $t) {
                    $rows[$idx]['status'] = 'waiting';
                    $rows[$idx]['became_current_at'] = null;
                    $status = 'cancelled';
                    $times['cancelled'] = $at;
                    $cancel = [$d['submitter']['user_id'], $d['submitter']['name']];
                    $reason = 'No longer needed';
                    $last = $at;
                    $reg->event('request.cancelled', $base + ['at' => $at, 'actor_user_id' => $cancel[0], 'actor_name' => $cancel[1], 'delivered' => false]);
                }
                break;
            }
            $actAt = $t->addMinutes($stalled ? $rng->int(10 * 1440, 30 * 1440) : $rng->int(60, 4 * 1440));
            if ($actAt > $this->end) {
                break;
            }
            $actors = $this->approverUsers($rows[$idx]);
            $actorId = $actors === [] ? $itUser['user_id'] : $actors[$rng->int(0, count($actors) - 1)];
            $actorName = $this->userName($actorId, $itUser);
            if ($rows[$idx]['approver_employee_id'] === null) {
                $rows[$idx]['approver_employee_id'] = $this->employeeOfUser($actorId)['id'] ?? null;
                $rows[$idx]['approver_name'] = $actorName;
            }
            $rows[$idx]['acted_by_user_id'] = $actorId;
            $rows[$idx]['acted_by_name'] = $actorName;
            $rows[$idx]['acted_at'] = $actAt;
            $last = $actAt;
            if ($rejectStage === $n) {
                $rows[$idx]['status'] = 'rejected';
                $rows[$idx]['note'] = $rng->pick(self::REJECT_NOTES);
                $status = 'rejected';
                $times['rejected'] = $actAt;
                $reg->event('request.rejected', $base + ['at' => $actAt, 'step_label' => $rows[$idx]['label'], 'actor_user_id' => $actorId, 'actor_name' => $actorName, 'remark' => $rows[$idx]['note']]);
                break;
            }
            $rows[$idx]['status'] = 'approved';
            $rows[$idx]['note'] = $rng->chance(0.15) ? 'Approved' : null;
            $t = $actAt;
            $reg->event('request.approved_step', $base + ['at' => $actAt, 'step_label' => $rows[$idx]['label'], 'actor_user_id' => $actorId, 'actor_name' => $actorName]);
            if ($n === count($approvalIdx) - 1) {
                $status = 'approved';
            }
        }
        if ($approvalIdx === []) {
            $status = 'approved';
        }

        $ticketOutcome = null;
        $settledAt = null;
        if ($status === 'approved') {
            $times['approved'] = $t;
            $rows[$completionIdx]['status'] = 'current';
            $rows[$completionIdx]['became_current_at'] = $t;
            $reg->event('request.approved_final', $base + ['at' => $t, 'step_label' => $rows[$completionIdx]['label']]);
            $reg->event('request.ready_to_complete', $base + ['at' => $t, 'approver_user_ids' => array_column($this->it, 'user_id')]);
            $ticketOutcome = 'open';

            $doneAt = $t->addMinutes($rng->int(60, 10 * 1440));
            if ($doneAt <= $this->end && $plan !== 'rejected') {
                $rows[$completionIdx]['acted_by_user_id'] = $itUser['user_id'];
                $rows[$completionIdx]['acted_by_name'] = $itUser['name'];
                $rows[$completionIdx]['acted_at'] = $doneAt;
                $last = $doneAt;
                $settledAt = $doneAt;
                if ($plan === 'cancelled') {
                    $rows[$completionIdx]['status'] = 'rejected';
                    $rows[$completionIdx]['note'] = 'Cancelled by IT';
                    $status = 'cancelled';
                    $times['cancelled'] = $doneAt;
                    $cancel = [$itUser['user_id'], $itUser['name']];
                    $reason = 'Cancelled by IT';
                    $ticketOutcome = 'cancelled';
                    $reg->event('request.cancelled', $base + ['at' => $doneAt, 'actor_user_id' => $itUser['user_id'], 'actor_name' => $itUser['name'], 'delivered' => true]);
                } else {
                    $resolution = $rng->pick(self::RESOLUTIONS);
                    $rows[$completionIdx]['status'] = 'approved';
                    $rows[$completionIdx]['note'] = $resolution;
                    $status = 'completed';
                    $times['completed'] = $doneAt;
                    $ticketOutcome = 'completed';
                    $reason = $resolution;
                    $reg->event('request.completed', $base + ['at' => $doneAt, 'actor_user_id' => $itUser['user_id'], 'actor_name' => $itUser['name']]);
                }
            }
        }

        $attachments = $rng->chance(0.25) ? $this->attachment($id, $created) : null;
        $sql->insert('service_requests', $this->fill('service_requests', [
            'id' => $id, 'reference' => $reference, 'type' => $type, 'origin' => $d['origin'], 'workflow_id' => $reg->get('workflow_ids')[$type] ?? null,
            'auto_ticket' => $autoTicket, 'user_id' => $d['owner_user'], 'submitted_by_user_id' => $d['submitter']['user_id'], 'submitted_by_name' => $d['submitter']['name'],
            'employee_id' => $employee['id'], 'requester_name' => $employee['name'], 'department_name' => $reg->get('department_names')[$employee['dept_id']],
            'title' => $title, 'reason' => $rng->pick(self::REASONS), 'fields' => $display === [] ? null : ($raw + ['_display' => $display]),
            'location_id' => $columns['location_id'] ?? null, 'software_id' => $columns['software_id'] ?? null, 'social_platform_id' => $columns['social_platform_id'] ?? null,
            'email_group_id' => $columns['email_group_id'] ?? null, 'file_share_id' => $columns['file_share_id'] ?? null, 'request_option_id' => $columns['request_option_id'] ?? null,
            'status' => $status, 'ticket_id' => null, 'approved_at' => $times['approved'], 'rejected_at' => $times['rejected'], 'completed_at' => $times['completed'],
            'cancelled_at' => $times['cancelled'], 'cancel_reason' => $times['cancelled'] ? $reason : null,
            'cancelled_by_user_id' => $cancel[0] ?? null, 'cancelled_by_name' => $cancel[1] ?? null, 'last_activity_at' => $last,
            'created_at' => $created, 'updated_at' => $last,
        ]));
        foreach ($rows as $i => $row) {
            $sql->insert('request_approvals', $this->fill('request_approvals', [
                'id' => $reg->nextId('request_approvals'), 'service_request_id' => $id, 'position' => $i + 1, 'actor_type' => $row['actor_type'], 'kind' => $row['kind'],
                'label' => $row['label'], 'approver_employee_id' => $row['approver_employee_id'], 'approver_name' => $row['approver_name'],
                'approver_department_id' => $row['approver_department_id'], 'approver_position_ids' => $row['approver_position_ids'], 'approver_employee_ids' => $row['approver_employee_ids'],
                'status' => $row['status'], 'note' => $row['note'] ?? null, 'skip_reason' => $row['skip_reason'],
                'acted_by_user_id' => $row['acted_by_user_id'] ?? null, 'acted_by_name' => $row['acted_by_name'] ?? null,
                'became_current_at' => $row['became_current_at'] ?? null, 'acted_at' => $row['acted_at'] ?? null, 'created_at' => $created, 'updated_at' => $row['acted_at'] ?? $created,
            ]));
        }

        if (! $autoTicket || $ticketOutcome === null) {
            return null;
        }

        return [
            'request_id' => $id, 'reference' => $reference, 'title' => $title, 'type' => $type, 'category' => $requestType->ticketCategory()->value,
            'employee_id' => $employee['id'], 'requester_name' => $employee['name'], 'department_name' => $reg->get('department_names')[$employee['dept_id']],
            'origin' => $d['origin'], 'opened_at' => $times['approved'], 'outcome' => $ticketOutcome, 'settled_at' => $settledAt, 'reason' => $reason,
            'display' => $display, 'attachment' => $attachments,
        ];
    }

    private function userName(int $userId, array $fallback): string
    {
        return $this->employeeOfUser($userId)['name'] ?? $fallback['name'];
    }

    /** @return array<string, mixed>|null */
    private function employeeOfUser(int $userId): ?array
    {
        foreach ($this->users as $u) {
            if ($u['user_id'] === $userId) {
                return $u;
            }
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function attachment(int $requestId, CarbonImmutable $at): array
    {
        $rng = $this->ctx->rng;
        $id = $this->ctx->reg->nextId('request_attachments');
        $name = $rng->pick(['quote.pdf', 'screenshot.png', 'approval-form.pdf', 'spec.xlsx']);
        $mime = str_ends_with($name, '.pdf') ? 'application/pdf' : (str_ends_with($name, '.png') ? 'image/png' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $row = ['id' => $id, 'original_name' => $name, 'path' => 'requests/'.$requestId.'/'.$name, 'size' => $rng->int(20000, 2500000), 'mime' => $mime];
        $this->ctx->sql->insert('request_attachments', $this->fill('request_attachments', $row + ['service_request_id' => $requestId, 'created_at' => $at, 'updated_at' => $at]));

        return $row;
    }
}
