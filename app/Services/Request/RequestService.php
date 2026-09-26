<?php

namespace App\Services\Request;

use App\Enums\Request\ApprovalStatus;
use App\Enums\Request\RequestOrigin;
use App\Enums\Request\RequestStatus;
use App\Enums\Request\RequestType;
use App\Enums\Request\WorkflowStepKind;
use App\Enums\Ticket\TicketStatus;
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
use App\Models\Ticket\Ticket;
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
        private readonly RequestAttachmentService $attachments,
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
     * The one string stored in `service_requests.title`, in one language.
     *
     * It is a derived label, not something anybody types: the service names it, and an
     * onboarding request adds who it is for because an approver reads the list before the
     * detail. English, matching the auto-ticket body it ends up in — switching the whole
     * system to Thai subjects is `labelTh()` here and nowhere else.
     *
     * Static so the normalize command can rewrite old rows through the same rule.
     */
    public static function canonicalTitle(RequestType $type, RequestOrigin $origin, ?string $requesterName): string
    {
        $title = $origin->isOnBehalf() && $requesterName !== null
            ? "{$type->label()} for {$requesterName}"
            : "Request: {$type->label()}";

        return mb_substr($title, 0, 200);
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

        // A reporting line that cannot carry the request — or a workflow step that names
        // nobody — stops it here. Filing it anyway would skip the approval steps and hand
        // it to IT as if everyone above had signed — see ChainBlockReason for the cases and why a line that
        // simply lacks a rank is NOT one of them. The code travels to the SPA, which
        // writes it out in the reader's language.
        $block = $this->resolver->blockReason($workflow, $employee);
        if ($block !== null) {
            throw ValidationException::withMessages(['requester' => [$block->value, $block->message()]]);
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
                // Composed here, never taken from the client. The wizard used to render
                // "Request: Mail group" / "คำขอ: กลุ่มเมล" in the requester's own language and
                // post that, and this column is what the case subject, the approval email and
                // the search box read — so all three spoke the requester's language instead of
                // the reader's. One canonical string; the SPA writes its own wording from
                // `type` for whoever is looking.
                'title' => self::canonicalTitle($type, $origin, $employee->name),
                'reason' => $data['reason'],
                'fields' => $fields,
                'status' => RequestStatus::Pending->value,
                // Filing is the first movement; the activity feed orders on this column, and
                // nothing else stored says when a request last moved (updated_at bumps on any
                // write at all, and a rung signed mid-chain never touches this row).
                'last_activity_at' => now(),
                ...$references,
            ]);

            // Inside the transaction with the row: a service that requires a file was
            // validated on the files that arrived, so the request must not survive
            // without them. (Binaries written before a rollback are orphaned on disk,
            // which costs nothing — no row points at them.)
            $this->attachments->store($request, $data['files'] ?? []);

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
            $this->claimForActor($actor, $row);

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
            } else {
                // finalize() stamps the rest; a signature that only advances the chain has to
                // stamp for itself, or the feed would never show it.
                $fresh->update(['last_activity_at' => now()]);
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
            $this->claimForActor($actor, $row);

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
                'last_activity_at' => now(),
            ]);

            return [$fresh, $row];
        });

        $request->refresh()->load('approvals');
        $this->notifications->rejected($request, $row);

        return $request;
    }

    /**
     * Mark an approved request done (the requests.fulfill queue's action).
     *
     * The button is the whole delivery record only when no case was opened — a
     * workflow with auto_ticket off, or one whose case could not be opened. Where a
     * case exists, closing it is what fulfils the request (settleFromTicket), so
     * this refuses while that case is still in flight.
     */
    public function fulfill(ServiceRequest $request, User $actor): ServiceRequest
    {
        abort_unless((bool) $actor->hasPermission('requests.fulfill'), 403);

        $request = DB::transaction(function () use ($request, $actor) {
            $fresh = ServiceRequest::lockForUpdate()->findOrFail($request->id);
            $this->assertStatus($fresh, RequestStatus::Approved);
            // Pressing this while the technician is mid-delivery would finish the request
            // behind them and leave the case open — the same split settleFromTicket exists
            // to close, from the other side. Whoever cannot close a stalled case hands it
            // on (POST tickets/{ticket}/forward) instead of finishing the request without it.
            //
            // Read from the case's state, not from "has a case": a request whose ticket was
            // closed before settleFromTicket existed still sits here as Approved, and those
            // rows have nothing left to close.
            abort_if(
                in_array($fresh->ticket?->status, TicketStatus::live(), true),
                422,
                "Ticket {$fresh->ticket?->ticket_no} is still open - closing that case fulfils this request.",
            );

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
                'last_activity_at' => now(),
            ]);

            return $fresh;
        });

        $request->refresh()->load('approvals');
        $this->notifications->fulfilled($request);

        return $request;
    }

    /** Requester withdraws their own still-pending request. */
    /**
     * The ticket a request auto-opened has been closed, so the request follows it.
     *
     * Closing that ticket IS the delivery: the technician who resolves it is the person
     * who handed the laptop over, and the resolution text they had to write is already
     * the record of what happened. Asking them to go and press Fulfil afterwards was a
     * second act of bookkeeping for one real event, and a request whose work was finished
     * days ago would sit in the queue until somebody remembered.
     *
     * A cancelled ticket cancels the request rather than rejecting it: no approver
     * refused this one — it cleared every step and then could not be delivered, so
     * counting it as a rejection would misreport the approval chain. The ticket's own
     * resolution is stamped on the fulfilment row, which is the same words on both sides
     * for whoever checks later.
     *
     * Deliberately not gated by requests.fulfill. The gate that matters already fired:
     * only the ticket's assignee may resolve it. Refusing here would leave the ticket
     * closed and the request stranded, which is the state this exists to prevent.
     *
     * Does nothing when the ticket belongs to no request, or when that request has
     * already settled — closing a ticket twice must not rewrite a decided request.
     */
    public function settleFromTicket(Ticket $ticket, User $actor, bool $completed, string $resolution): void
    {
        $request = ServiceRequest::where('ticket_id', $ticket->id)->first();
        if ($request === null || $request->status !== RequestStatus::Approved) {
            return;
        }

        $settled = DB::transaction(function () use ($request, $actor, $completed, $resolution) {
            $fresh = ServiceRequest::lockForUpdate()->findOrFail($request->id);
            if ($fresh->status !== RequestStatus::Approved) {
                return null;
            }

            $queueRow = $fresh->approvals()
                ->where('kind', WorkflowStepKind::Fulfillment->value)
                ->where('status', ApprovalStatus::Current->value)
                ->first();

            $queueRow?->update([
                'status' => ($completed ? ApprovalStatus::Approved : ApprovalStatus::Rejected)->value,
                'note' => $resolution,
                'acted_by_user_id' => $actor->id,
                'acted_by_name' => $actor->name,
                'acted_at' => now(),
            ]);

            $fresh->update($completed
                ? ['status' => RequestStatus::Fulfilled->value, 'fulfilled_at' => now(), 'last_activity_at' => now()]
                : ['status' => RequestStatus::Cancelled->value, 'cancelled_at' => now(), 'last_activity_at' => now()]);

            return [$fresh, $queueRow];
        });

        if ($settled === null) {
            return;
        }

        [$fresh, $queueRow] = $settled;
        // Named for how it happened, so the trail says the ticket closed this and not
        // that somebody went and pressed the button.
        AuditLog::record(
            $completed ? 'Fulfilled request via ticket' : 'Cancelled request via ticket',
            $fresh->reference,
            ['ticket' => $ticket->ticket_no],
        );

        $fresh->refresh()->load('approvals');
        // Both go to the requester and whoever filed it for them. NOT cancelled(), which
        // speaks to an approver still holding a pending request — there is none here, so
        // that route reached nobody and the request closed in silence.
        $completed
            ? $this->notifications->fulfilled($fresh)
            : $this->notifications->notDelivered($fresh, $queueRow?->note);
    }

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
                'last_activity_at' => now(),
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
            'last_activity_at' => now(),
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

        // A case for somebody who does not work here yet reads the same as any other once
        // it is in the queue: a ticket has no field for where it came from, so the marker
        // has to be in the words. Appended after the cut so a long title cannot eat it.
        $marker = $this->newHireMarker($request);
        $subject = mb_substr("[{$request->reference}] {$request->title}", 0, 200 - mb_strlen($marker)).$marker;

        $ticket = $this->tickets->create([
            'subject' => $subject,
            'description' => $this->ticketDescription($request),
            'category' => $request->type->ticketCategory()->value,
        ], $employee);

        $request->update(['ticket_id' => $ticket->id]);
        $this->mirrorFilesOntoTicket($request, $ticket);
    }

    /**
     * Show the request's files on the case it opened, by reference rather than by copy.
     *
     * The auto-ticket is a snapshot of the request in words; the evidence is the one
     * part that would be wasteful to snapshot, so the ticket row carries the same
     * `path` and names the request attachment it mirrors. Reading it needs no Request
     * permission — the ticket's own file route gates on the case.
     *
     * Only ever runs here, at the moment the case is opened. The request's files are
     * fixed at submit (nothing adds or removes them afterwards), so the pair cannot drift.
     */
    private function mirrorFilesOntoTicket(ServiceRequest $request, Ticket $ticket): void
    {
        foreach ($request->attachments()->orderBy('id')->get() as $file) {
            $ticket->attachments()->create([
                'request_attachment_id' => $file->id,
                'original_name' => $file->original_name,
                'path' => $file->path,
                'size' => $file->size,
                'mime' => $file->mime,
            ]);
        }
    }

    /**
     * " (New employee)" for a request filed on behalf of a new hire, or nothing.
     *
     * Written on the two lines a technician reads without opening anything — the subject in
     * their queue and the first line of the body. In parentheses because it qualifies the
     * person the case is for, and it is deliberately NOT appended to the "Requester:" line,
     * which already carries the department in brackets.
     */
    private function newHireMarker(ServiceRequest $request): string
    {
        return $request->origin?->isOnBehalf() ? ' (New employee)' : '';
    }

    /** Compose the auto-ticket body from the request's summary + typed fields. */
    private function ticketDescription(ServiceRequest $request): string
    {
        $lines = [
            'Auto-opened'.$this->newHireMarker($request),
            '-----',
            "Service request {$request->reference} (Approved).",
            'Type: '.$request->type->label(),
            "Requester: {$request->requester_name}".($request->department_name ? " ({$request->department_name})" : ''),
        ];

        // What this service actually asked for — device type, mailbox address, access
        // level. A case that says only "Computer" sends the technician back to the request
        // to find out which kind of machine.
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
     * @return list<array{key: string, label_en: string, label_th: string, value: string, value_th: string|null, mono: bool}>
     */
    private function buildDisplayRows(RequestType $type, array $fields): array
    {
        $rows = [];

        foreach (RequestSchemas::for($type) as $field) {
            $raw = $fields[$field['key']] ?? null;
            if ($raw === null || $raw === '') {
                continue;
            }

            [$value, $valueTh] = $this->displayValue($field, $raw);
            $rows[] = [
                'key' => $field['key'],
                'label_en' => $field['label_en'],
                'label_th' => $field['label_th'],
                'value' => $value,
                'value_th' => $valueTh,
                'mono' => (bool) ($field['mono'] ?? false),
            ];
        }

        return $rows;
    }

    /**
     * One field's value, snapshotted in both languages.
     *
     * `value` stays the English form every other reader of this snapshot already
     * expects — the auto-ticket body, exports, the row a technician reads. `value_th`
     * is added only where the choice HAS a Thai form to freeze: a managed option's
     * label_th, a schema option's label_th. It is null for what the requester typed and
     * for names that exist in one language only (a share path, a software title), and
     * the SPA falls back to `value` there — which is also how rows written before this
     * key existed keep rendering.
     *
     * Snapshotting both is the point: re-resolving the id at render time would show
     * today's label on a request decided months ago, which is what _display exists to
     * prevent. A label that was half-translated (Thai on the field, English on its
     * value) read like a bug rather than like a policy.
     *
     * @param  array<string, mixed>  $field
     * @return array{0: string, 1: string|null}
     */
    private function displayValue(array $field, mixed $raw): array
    {
        if ($field['managed'] ?? false) {
            $option = RequestOption::find((int) $raw);

            return [$option?->label_en ?? (string) $raw, $option?->label_th ?: null];
        }

        if ($field['input'] === 'select') {
            $option = collect($field['options'] ?? [])->firstWhere('value', $raw);

            return [$option['label_en'] ?? (string) $raw, ($option['label_th'] ?? null) ?: null];
        }

        if ($field['input'] === 'source') {
            return [$this->sourceName((string) $field['source'], (int) $raw) ?? (string) $raw, null];
        }

        return [(string) $raw, null];
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

    /**
     * Only the approver of the current step may decide — no stand-ins.
     *
     * A step open to a group has no single approver: anybody it accepts — the people it
     * names, or the department's holders of one of its positions — may act, and the first
     * to do so takes the row (see claimForActor). Everything else answers to one named id.
     */
    private function assertActorIsApprover(User $actor, RequestApproval $row): void
    {
        if ($actor->employee_id !== null && (int) $actor->employee_id === (int) $row->approver_employee_id) {
            return;
        }

        abort_unless(
            $row->acceptsEmployee($actor->employee),
            403,
            'It is not your turn to act on this request.',
        );
    }

    /**
     * Write the actor into a group step, so a decided row reads like any other.
     *
     * Without this the row would keep saying "somebody in QC" after a named person had
     * signed it, and every report that counts approvals per person would have to learn
     * about group rows to answer correctly.
     */
    private function claimForActor(User $actor, RequestApproval $row): void
    {
        if ($row->approver_employee_id !== null || $actor->employee === null) {
            return;
        }

        $row->approver_employee_id = $actor->employee->id;
        $row->approver_name = $actor->employee->name;
    }
}
