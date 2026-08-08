<?php

namespace App\Services\Employee;

use App\Enums\Request\RequestOrigin;
use App\Enums\Request\RequestType;
use App\Models\Employee\Employee;
use App\Models\User;
use App\Services\Request\RequestService;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Files the day-one service requests ticked on the Add Employee form.
 *
 * One request per service, each owned by the new employee (so it climbs THEIR
 * reporting line) and stamped with the account that filed it. The services are
 * limited to the three a new hire needs before anything else exists for them.
 *
 * Nothing here may cost us the employee: a service whose workflow is closed, or
 * that fails for any other reason, is reported back and skipped — the person has
 * already been hired by the time this runs, and a closed workflow is not a reason
 * to undo that. The caller surfaces the failures so nobody assumes a request went
 * out when it did not.
 */
class EmployeeOnboardingService
{
    /** The services offered on the Add Employee form. */
    public const SERVICES = ['computer', 'mobile', 'email'];

    public function __construct(private readonly RequestService $requests) {}

    /**
     * @param  array<string, array<string, mixed>>  $services  service from self::SERVICES => the fields Step 3 collected for it
     * @return array{
     *     created: list<array{service: string, id: int, reference: string|null}>,
     *     failed: list<array{service: string, message: string}>
     * }
     */
    public function fileRequests(Employee $employee, User $actor, array $services, ?string $note = null): array
    {
        $created = [];
        $failed = [];

        foreach ($services as $service => $fields) {
            if (! in_array($service, self::SERVICES, true)) {
                continue;
            }

            $type = RequestType::from($service);

            try {
                $request = $this->requests->submitFor($employee, $actor, [
                    'type' => $type->value,
                    'title' => $this->title($type, $employee),
                    'reason' => $this->reason($employee, $note),
                    // The detail this service asks for — device type, mailbox address —
                    // collected on Step 3 and validated against the same schema the
                    // Request form uses. It used to be sent empty, which left IT with a
                    // request that did not say which kind of machine it was for.
                    'fields' => (array) $fields,
                ], RequestOrigin::Onboarding);

                $created[] = ['service' => $service, 'id' => $request->id, 'reference' => $request->reference];
            } catch (ValidationException $e) {
                $failed[] = ['service' => $service, 'message' => collect($e->errors())->flatten()->first() ?? $e->getMessage()];
            } catch (Throwable $e) {
                report($e);
                $failed[] = ['service' => $service, 'message' => $e->getMessage()];
            }
        }

        return ['created' => $created, 'failed' => $failed];
    }

    /** e.g. "Computer for Somchai Jaidee" — an approver reads the list, not the detail. */
    private function title(RequestType $type, Employee $employee): string
    {
        return mb_substr("{$type->label()} for {$employee->name}", 0, 200);
    }

    /**
     * Why the request exists, plus whatever HR added.
     *
     * The generated line always stays: it carries the first day, which is the one fact
     * an approver needs and the one nobody retypes. The note is appended on its own line
     * behind `**` so an approver can see at a glance which half a person wrote — it used
     * to REPLACE this text, so writing a note silently deleted the start date.
     */
    private function reason(Employee $employee, ?string $note): string
    {
        $start = $employee->joined_at?->format('Y-m-d');
        // Two short lines rather than one long one: the first day is the fact an approver
        // acts on, and on its own line it is read rather than scanned past. The detail
        // view renders the reason with whitespace-pre-wrap, so the break survives.
        //
        // No date means no second line at all — never a dangling "first day ."
        $generated = $start === null
            ? 'Onboarding request with the new employee.'
            : "Onboarding request with the new employee,\nfirst day {$start}.";

        $note = trim((string) $note);

        return $note === '' ? $generated : $generated."\n**".$note;
    }
}
