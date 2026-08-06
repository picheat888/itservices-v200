<?php

namespace App\Services\Request;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestOrigin;
use App\Enums\Request\RequestPriority;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\RequestType;
use App\Enums\Request\WorkflowStepKind;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\AuditLog;
use App\Models\Employee\Employee;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\Location;
use App\Models\Settings\RequestOption;
use App\Models\User;
use App\Models\Workflow\Workflow;
use App\Services\Ticket\TicketService;
use App\Support\RequestSchemas;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * State machine of a service request. Every transition runs in a transaction
 * with the request row locked (the serialization point that makes concurrent
 * double-decisions impossible), guards its precondition with a 422 and its
 * actor with a 403, and notifies AFTER the transaction committed.
 *
 * Decision authority is person-scoped: only the resolved approver of the
 * current step may approve/reject — deliberately no super-admin override, so
 * every decision stays attributable. Unactionable approvers are prevented
 * upstream (the resolver skips ineligible people at submit time).
 */
class RequestService
{
    public function __construct(
        private readonly WorkflowResolverService $resolver,
        private readonly RequestNotificationService $notifications,
        private readonly TicketService $tickets,
    ) {}

    /**
     * Create a request the submitting user is asking for themselves.
     *
     * @param  array<string, mixed>  $data  validated StoreServiceRequestRequest payload
     */
    public function submit(User $user, array $data): ServiceRequest
    {
        $employee = $user->employee;
        if ($employee === null) {
            throw ValidationException::withMessages([
                'requester' => 'Your account is not linked to an employee record, so a request cannot be routed.',
            ]);
        }

        return $this->create($employee, $user, $user, $data, RequestOrigin::Direct);
    }

    /**
     * Create a request that BELONGS to $subject but was filed by somebody else —
     * the onboarding services ticked while adding an employee.
     *
     * The chain resolves against $subject, so approvals climb the new employee's
     * reporting line rather than the filer's. $subject normally has no login yet,
     * which is the whole reason the request has to remember who submitted it.
     *
     * @param  array<string, mixed>  $data
     */
    public function submitFor(
        Employee $subject,
        User $actor,
        array $data,
        RequestOrigin $origin = RequestOrigin::Onboarding,
    ): ServiceRequest {
        return $this->create($subject, $subject->user, $actor, $data, $origin);
    }

    /**
     * Freeze the approval chain and activate the first step.
     *
     * @param  Employee  $employee  whose request this is — the chain climbs their managers
     * @param  User|null  $owner  that employee's login, when they have one
     * @param  User  $actor  the account that pressed Save
     * @param  array<string, mixed>  $data
     */
    private function create(Employee $employee, ?User $owner, User $actor, array $data, RequestOrigin $origin): ServiceRequest
    {
        $type = RequestType::from((string) $data['type']);
        $workflow = Workflow::where('request_type', $type->value)->first();
        if ($workflow === null || ! $workflow->active) {
            throw ValidationException::withMessages([
                'type' => 'This request type is not accepting submissions right now.',
            ]);
        }

        // Keep only the keys this type's schema knows about, then snapshot the
        // human-readable form (labels + resolved source names) under _display —
        // the detail view renders point-in-time labels, never re-resolved ids.
        $submitted = $this->castReferences($type, array_intersect_key($data['fields'] ?? [], array_flip(RequestSchemas::keys($type))));
        $display = $this->buildDisplayRows($type, $submitted);

        // Every reference moves into its own foreign-keyed column; the json keeps
        // what has no table behind it, plus the snapshot.
        [$references, $fields] = $this->splitReferences($type, $submitted);
        $fields['_display'] = $display;

        $request = DB::transaction(function () use ($owner, $actor, $origin, $employee, $type, $workflow, $data, $fields, $references, $submitted) {
            $request = ServiceRequest::create([
                'type' => $type->value,
                'origin' => $origin->value,
                'workflow_id' => $workflow->id,
                'auto_ticket' => $workflow->auto_ticket,
                'user_id' => $owner?->id,
                'submitted_by_user_id' => $actor->id,
                'submitted_by_name' => $actor->name,
                'employee_id' => $employee->id,
                'requester_name' => $employee->name,
                'department_name' => $employee->department?->name,
                'title' => $data['title'],
                'reason' => $data['reason'],
                'priority' => $data['priority'] ?? RequestPriority::Medium->value,
                'estimated_value' => $data['estimated_value'] ?? null,
                'fields' => $fields,
                'status' => RequestStatus::Pending->value,
                ...$references,
            ]);

            // The resolver looks resources up by their schema key, so it sees the
            // whole submitted set — column-backed or not.
            foreach ($this->resolver->resolve($workflow, $employee, $submitted) as $row) {
                $request->approvals()->create($row);
            }

            // Everything may have been skipped (no manager + no owner): the
            // request finalizes on the spot instead of waiting on nobody.
            if ($this->activateNextApproval($request) === null) {
                $this->finalize($request);
            }

            return $request;
        });

        $request->refresh()->load('approvals');
        $this->notifications->submitted($request);
        if ($request->status === RequestStatus::Approved) {
            $this->notifications->finalApproved($request);
        }

        return $request;
    }

    /** Approve the current step as its resolved approver. */
    public function approve(ServiceRequest $request, User $actor, ?string $note): ServiceRequest
    {
        [$request, $decided, $isFinal] = DB::transaction(function () use ($request, $actor, $note) {
            $fresh = ServiceRequest::lockForUpdate()->findOrFail($request->id);
            $this->assertStatus($fresh, RequestStatus::Pending);
            $row = $this->currentActionableRow($fresh);
            $this->assertActorIsApprover($actor, $row);

            $row->update([
                'status' => ApprovalStatus::Approved->value,
                'note' => $note ?: null,
                'acted_by_user_id' => $actor->id,
                'acted_by_name' => $actor->name,
                'acted_at' => now(),
            ]);

            $next = $this->activateNextApproval($fresh);
            if ($next === null) {
                $this->finalize($fresh);
            }

            return [$fresh, $row, $next === null];
        });

        $request->refresh()->load('approvals');
        $isFinal
            ? $this->notifications->finalApproved($request)
            : $this->notifications->advanced($request, $decided);

        return $request;
    }

    /** Reject the current step (remark required — enforced at the HTTP layer). */
    public function reject(ServiceRequest $request, User $actor, string $note): ServiceRequest
    {
        [$request, $row] = DB::transaction(function () use ($request, $actor, $note) {
            $fresh = ServiceRequest::lockForUpdate()->findOrFail($request->id);
            $this->assertStatus($fresh, RequestStatus::Pending);
            $row = $this->currentActionableRow($fresh);
            $this->assertActorIsApprover($actor, $row);

            $row->update([
                'status' => ApprovalStatus::Rejected->value,
                'note' => $note,
                'acted_by_user_id' => $actor->id,
                'acted_by_name' => $actor->name,
                'acted_at' => now(),
            ]);
            $fresh->update([
                'status' => RequestStatus::Rejected->value,
                'rejected_at' => now(),
            ]);

            return [$fresh, $row];
        });

        $request->refresh()->load('approvals');
        $this->notifications->rejected($request, $row);

        return $request;
    }

    /** Mark an approved request done (the requests.fulfill queue's action). */
    public function fulfill(ServiceRequest $request, User $actor): ServiceRequest
    {
        abort_unless((bool) $actor->hasPermission('requests.fulfill'), 403);

        $request = DB::transaction(function () use ($request, $actor) {
            $fresh = ServiceRequest::lockForUpdate()->findOrFail($request->id);
            $this->assertStatus($fresh, RequestStatus::Approved);

            $fresh->approvals()
                ->where('kind', WorkflowStepKind::Fulfillment->value)
                ->where('status', ApprovalStatus::Current->value)
                ->first()?->update([
                    'status' => ApprovalStatus::Approved->value,
                    'acted_by_user_id' => $actor->id,
                    'acted_by_name' => $actor->name,
                    'acted_at' => now(),
                ]);
            $fresh->update([
                'status' => RequestStatus::Fulfilled->value,
                'fulfilled_at' => now(),
            ]);

            return $fresh;
        });

        $request->refresh()->load('approvals');
        $this->notifications->fulfilled($request);

        return $request;
    }

    /** Requester withdraws their own still-pending request. */
    public function cancel(ServiceRequest $request, User $actor): ServiceRequest
    {
        // The owner withdraws their own request; for one filed on somebody's behalf
        // the filer may too, since the owner has no login to withdraw it with.
        abort_unless(
            $request->user_id === $actor->id || $request->submitted_by_user_id === $actor->id,
            403,
        );

        [$request, $wasCurrent] = DB::transaction(function () use ($request) {
            $fresh = ServiceRequest::lockForUpdate()->findOrFail($request->id);
            $this->assertStatus($fresh, RequestStatus::Pending);
            $wasCurrent = $fresh->currentApproval();

            $fresh->update([
                'status' => RequestStatus::Cancelled->value,
                'cancelled_at' => now(),
            ]);

            return [$fresh, $wasCurrent];
        });

        $request->refresh()->load('approvals');
        $this->notifications->cancelled($request, $wasCurrent);

        return $request;
    }

    /**
     * Flip the first waiting approval row to current and stamp its SLA clock.
     * Returns null when no approval step remains to wait on.
     */
    private function activateNextApproval(ServiceRequest $request): ?RequestApproval
    {
        $next = $request->approvals()
            ->where('kind', WorkflowStepKind::Approval->value)
            ->where('status', ApprovalStatus::Waiting->value)
            ->orderBy('position')
            ->first();

        // became_current_at starts the clock we measure afterwards; there is no
        // deadline to compare it against.
        $next?->update([
            'status' => ApprovalStatus::Current->value,
            'became_current_at' => now(),
        ]);

        return $next;
    }

    /**
     * Final approval reached: flip the request, activate the fulfillment queue
     * row, and open the IT ticket when the submit-time snapshot asked for one.
     * Runs inside the caller's transaction — a ticket failure rolls the whole
     * approval back, so the approver can simply retry.
     */
    private function finalize(ServiceRequest $request): void
    {
        $request->update([
            'status' => RequestStatus::Approved->value,
            'approved_at' => now(),
        ]);

        $queueRow = $request->approvals()
            ->where('kind', WorkflowStepKind::Fulfillment->value)
            ->where('status', ApprovalStatus::Waiting->value)
            ->orderBy('position')
            ->first();
        $queueRow?->update([
            'status' => ApprovalStatus::Current->value,
            'became_current_at' => now(),
        ]);

        if (! $request->auto_ticket || $request->ticket_id !== null) {
            return;
        }

        $employee = $request->employee;
        if ($employee === null) {
            // The requester's employee record vanished mid-flight; the approval
            // still completes — IT just won't get an auto-opened case.
            AuditLog::record('Auto-ticket skipped', $request->reference, ['reason' => 'requester employee record missing']);

            return;
        }

        $ticket = $this->tickets->create([
            'subject' => mb_substr("[{$request->reference}] {$request->title}", 0, 200),
            'description' => $this->ticketDescription($request),
            'category' => $request->type->ticketCategory()->value,
        ], $employee);

        $request->update(['ticket_id' => $ticket->id]);
    }

    /** Compose the auto-ticket body from the request's summary + typed fields. */
    private function ticketDescription(ServiceRequest $request): string
    {
        $lines = [
            "Auto-opened from service request {$request->reference} (fully approved).",
            '',
            'Type: '.$request->type->label(),
            "Requester: {$request->requester_name}".($request->department_name ? " ({$request->department_name})" : ''),
            'Priority: '.$request->priority->value,
        ];
        if ($request->estimated_value) {
            $lines[] = "Estimated value: {$request->estimated_value}";
        }

        foreach ($this->fieldLines($request) as $line) {
            $lines[] = $line;
        }

        return implode("\n", [...$lines, '', 'Reason:', $request->reason]);
    }

    /**
     * Human-readable "Label: value" lines for the typed fields — read from the
     * _display snapshot taken at submit.
     *
     * @return list<string>
     */
    private function fieldLines(ServiceRequest $request): array
    {
        $rows = ($request->fields ?? [])['_display'] ?? [];

        return array_map(fn (array $row) => "{$row['label_en']}: {$row['value']}", $rows);
    }

    /**
     * Store every reference field as a real id. The form posts its selects as
     * strings, and a foreign key kept as "7" reads as data of the wrong kind and
     * breaks any later comparison against an integer id.
     *
     * @param  array<string, mixed>  $fields
     * @return array<string, mixed>
     */
    private function castReferences(RequestType $type, array $fields): array
    {
        foreach (RequestSchemas::for($type) as $field) {
            $key = $field['key'];
            $isReference = ($field['managed'] ?? false) || $field['input'] === 'source';

            if ($isReference && isset($fields[$key]) && $fields[$key] !== '') {
                $fields[$key] = (int) $fields[$key];
            }
        }

        return $fields;
    }

    /**
     * Split the submitted fields into the foreign-keyed columns and the json
     * remainder. Two schema keys can share a column (device_id/device_type_id
     * both reference request_options), which is why the column is looked up per
     * field rather than assumed from its name.
     *
     * @param  array<string, mixed>  $fields
     * @return array{0: array<string, int|null>, 1: array<string, mixed>}
     */
    private function splitReferences(RequestType $type, array $fields): array
    {
        $references = [];

        foreach (RequestSchemas::referenceColumns($type) as $key => $column) {
            $value = $fields[$key] ?? null;
            $references[$column] = $value === '' ? null : $value;
            unset($fields[$key]);
        }

        return [$references, $fields];
    }

    /**
     * The point-in-time display snapshot of the typed fields: bilingual labels
     * plus resolved values (managed/source ids → names, select values → labels).
     *
     * @param  array<string, mixed>  $fields
     * @return list<array{key: string, label_en: string, label_th: string, value: string, mono: bool}>
     */
    private function buildDisplayRows(RequestType $type, array $fields): array
    {
        $rows = [];

        foreach (RequestSchemas::for($type) as $field) {
            $raw = $fields[$field['key']] ?? null;
            if ($raw === null || $raw === '') {
                continue;
            }

            $value = match (true) {
                ($field['managed'] ?? false) => RequestOption::find((int) $raw)?->label_en ?? (string) $raw,
                $field['input'] === 'select' => collect($field['options'] ?? [])->firstWhere('value', $raw)['label_en'] ?? (string) $raw,
                $field['input'] === 'source' => $this->sourceName((string) $field['source'], (int) $raw) ?? (string) $raw,
                default => (string) $raw,
            };
            $rows[] = [
                'key' => $field['key'],
                'label_en' => $field['label_en'],
                'label_th' => $field['label_th'],
                'value' => $value,
                'mono' => (bool) ($field['mono'] ?? false),
            ];
        }

        return $rows;
    }

    /** Display name of a source-backed field value. */
    private function sourceName(string $source, int $id): ?string
    {
        $group = fn () => EmailGroup::find($id);
        $software = fn () => Software::with('brand')->find($id);

        return match ($source) {
            'email_groups' => ($g = $group()) !== null ? ($g->email ?: $g->name) : null,
            'file_shares' => FileShare::find($id)?->path,
            'social_platforms' => SocialPlatform::find($id)?->name,
            'softwares' => ($s = $software()) !== null ? trim(($s->brand?->name ? $s->brand->name.' ' : '').$s->name) : null,
            'locations' => Location::find($id)?->name,
            default => null,
        };
    }

    /** Guard a workflow transition, 422 when the request isn't in the expected state. */
    private function assertStatus(ServiceRequest $request, RequestStatus $expected): void
    {
        if ($request->status !== $expected) {
            throw ValidationException::withMessages([
                'status' => "Request must be {$expected->value} (currently {$request->status->value}).",
            ]);
        }
    }

    /** The current approval-kind row, 422 when the request waits on fulfillment instead. */
    private function currentActionableRow(ServiceRequest $request): RequestApproval
    {
        $row = $request->currentApproval();
        if ($row === null || $row->kind !== WorkflowStepKind::Approval) {
            throw ValidationException::withMessages([
                'status' => 'No approval step is waiting on a decision.',
            ]);
        }

        return $row;
    }

    /** Only the resolved approver of the current step may decide — no stand-ins. */
    private function assertActorIsApprover(User $actor, RequestApproval $row): void
    {
        abort_unless(
            $actor->employee_id !== null && (int) $actor->employee_id === (int) $row->approver_employee_id,
            403,
            'It is not your turn to act on this request.',
        );
    }
}
