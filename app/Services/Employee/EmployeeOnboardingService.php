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
     * @param  list<string>  $services  values from self::SERVICES
     * @return array{
     *     created: list<array{service: string, id: int, reference: string|null}>,
     *     failed: list<array{service: string, message: string}>
     * }
     */
    public function fileRequests(Employee $employee, User $actor, array $services, ?string $note = null): array
    {
        $created = [];
        $failed = [];

        foreach (array_unique($services) as $service) {
            if (! in_array($service, self::SERVICES, true)) {
                continue;
            }

            $type = RequestType::from($service);

            try {
                $request = $this->requests->submitFor($employee, $actor, [
                    'type' => $type->value,
                    'title' => $this->title($type, $employee),
                    'reason' => $this->reason($employee, $note),
                    // The form asks for no type-specific detail (no model, no size):
                    // the fulfilling team works that out with the new employee's
                    // manager, which is what the reason line says.
                    'fields' => [],
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

    /** The HR note when there is one; otherwise say plainly why the request exists. */
    private function reason(Employee $employee, ?string $note): string
    {
        $note = trim((string) $note);
        if ($note !== '') {
            return $note;
        }

        $start = $employee->joined_at?->format('Y-m-d');

        return 'Onboarding request filed with the new employee record'
            .($start !== null ? ", first day {$start}" : '')
            .'. Details to be confirmed with their manager.';
    }
}
