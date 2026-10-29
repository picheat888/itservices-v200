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
 * Files the day-one service requests ticked on the Add Employee form, one per service, owned by the new employee.
 * A service that fails is reported back and skipped, never undoing the hire.
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
                    'reason' => $this->reason($employee, $note),
                    // Step 3's detail, validated against the Request form's schema
                    'fields' => (array) $fields,
                ], RequestOrigin::Onboarding);

                $created[] = ['service' => $service, 'id' => $request->id, 'reference' => $request->reference];
            } catch (ValidationException $e) {
                $failed[] = ['service' => $service, 'message' => collect($e->errors())->flatten()->first() ?? $e->getMessage()];
            } catch (Throwable $e) {
                report($e);
                $failed[] = ['service' => $service, 'message' => 'request_failed'];
            }
        }

        return ['created' => $created, 'failed' => $failed];
    }

    /** Why the request exists (with the first day), then HR's note on its own line behind `**`. */
    private function reason(Employee $employee, ?string $note): string
    {
        $start = $employee->joined_at?->format('Y-m-d');
        // No date means no second line
        $generated = $start === null
            ? 'Onboarding request with the new employee.'
            : "Onboarding request with the new employee,\nfirst day {$start}.";

        $note = trim((string) $note);

        return $note === '' ? $generated : $generated."\n**".$note;
    }
}
