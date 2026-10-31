<?php

namespace App\Services\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Enums\Request\ChainBlockReason;
use App\Enums\Request\RequestOrigin;
use App\Enums\Request\RequestType;
use App\Models\Employee\Employee;
use App\Models\User;
use App\Models\Workflow\Workflow;
use App\Services\Request\RequestService;
use App\Services\Request\WorkflowResolverService;
use Illuminate\Support\Collection;
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

    /** A day-one service whose workflow is missing or off; sits beside the ChainBlockReason codes. */
    public const WORKFLOW_INACTIVE = 'workflow_inactive';

    public function __construct(
        private readonly RequestService $requests,
        private readonly WorkflowResolverService $resolver,
        private readonly ApprovalChainService $chain,
    ) {}

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

    /**
     * Whether the day-one requests could be filed for a person with this manager and position; advisory, submit checks again.
     *
     * @return array{can_request: bool, reason: ?string, blocked_services: list<string>, resigned_in_chain: Collection<int, Employee>}
     */
    public function precheck(?int $managerId, ?int $positionId): array
    {
        $prospect = new Employee([
            'manager_id' => $managerId,
            'position_id' => $positionId,
        ]);

        /** @var array<string, string> $codes service => block code */
        $codes = [];
        foreach (self::SERVICES as $service) {
            $workflow = Workflow::where('request_type', $service)->first();
            $code = $workflow === null || ! $workflow->active
                ? self::WORKFLOW_INACTIVE
                : $this->resolver->blockReason($workflow, $prospect)?->value;

            if ($code !== null) {
                $codes[$service] = $code;
            }
        }

        // One banner for all three services: a fixable reporting line beats a closed workflow
        $reason = collect([
            ChainBlockReason::ApproverResigned->value,
            ChainBlockReason::NoManager->value,
            self::WORKFLOW_INACTIVE,
            ChainBlockReason::WorkflowIncomplete->value,
        ])->first(fn (string $candidate) => in_array($candidate, $codes, true));

        // Named only for the resigned case, which is useless without whose record to fix
        $resigned = $reason === ChainBlockReason::ApproverResigned->value
            ? $this->chain->chainFor($prospect)->filter(fn (Employee $manager) => $manager->status === EmployeeStatus::Resigned)->values()
            : collect();

        return [
            'can_request' => $codes === [],
            'reason' => $reason,
            'blocked_services' => array_keys($codes),
            'resigned_in_chain' => $resigned,
        ];
    }
}
