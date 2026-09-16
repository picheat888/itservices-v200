<?php

namespace App\Http\Requests\Employee;

use App\Enums\Request\RequestType;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\User;
use App\Services\Employee\EmployeeOnboardingService;
use App\Support\RequestSchemas;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreEmployeeRequest extends FormRequest
{
    /**
     * Gate by the granular Employee permission: creating a record requires
     * employees.add, updating an existing one requires employees.edit. The
     * presence of an {employee} route binding distinguishes update from store.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }

        $permission = $this->route('employee') ? 'employees.edit' : 'employees.add';

        return (bool) $user->hasPermission($permission);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $employeeId = $this->route('employee')?->id;

        // A "special position" skips both the department and the report-to (manager)
        // requirements. A normal position (selected, not special) requires both. With no
        // position (legacy/bare records) both stay optional.
        $positionId = $this->input('position_id');
        $position = $positionId ? Position::find($positionId) : null;
        $requireOrg = $position !== null && ! $position->allow_special_position;

        return [
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'first_name_th' => ['nullable', 'string', 'max:255'],
            'last_name_th' => ['nullable', 'string', 'max:255'],
            'department_id' => [$requireOrg ? 'required' : 'nullable', 'exists:departments,id'],
            'section_id' => [$requireOrg ? 'required' : 'nullable', 'exists:sections,id'],
            'position_id' => ['nullable', 'exists:positions,id'],
            'manager_id' => [$requireOrg ? 'required' : 'nullable', 'exists:employees,id'],
            'email' => [
                // email:filter (FILTER_VALIDATE_EMAIL) — stricter than the RFC default,
                // which accepts UTF-8 local parts like "สมชาย@…"; also matches the CSV import check.
                'nullable', 'email:filter', 'max:255',
                // No duplicate addresses anywhere in the system: not on another
                // employee, and not on a login account other than this employee's own.
                Rule::unique('employees', 'email')->ignore($employeeId),
                function (string $attribute, mixed $value, \Closure $fail) use ($employeeId) {
                    $taken = User::where('email', $value)
                        ->where(fn ($q) => $q->whereNull('employee_id')->orWhere('employee_id', '!=', $employeeId ?? 0))
                        ->exists();
                    if ($taken) {
                        $fail('This email is already used by another account.');
                    }
                },
            ],
            // No `username` rule on purpose. The employee's username column is a mirror of the
            // login account's, written only when an account is provisioned or its username is
            // changed (both under employees.set_credentials). Accepting it here let the edit
            // form — which sends username: null on every save — blank the mirror while the real
            // login kept working, taking the list's username column and the group-role
            // fallback match with it.
            // Same shape as a ticket's callback phone: free-form (so "ext. 1305" works) but it
            // has to carry at least three digits, which rules out text that isn't a number.
            'phone' => ['nullable', 'string', 'max:50', 'regex:/(\D*\d){3,}/'],
            // Required when hiring, matching what Step 2 already demands. It was nullable,
            // so the API accepted a new employee the form would have refused — and their
            // onboarding requests then carried no first day, the one fact that tells an
            // approver how urgent they are.
            //
            // Still nullable on update: the same rules serve both, and an employee who
            // arrived through bulk import (a different path, where the column is optional)
            // must not become uneditable because of a date nobody recorded then.
            'joined_at' => [$this->route('employee') ? 'nullable' : 'required', 'date'],
            'status' => ['nullable', Rule::in(['active', 'resigned'])],
            'code' => ['nullable', 'string', 'max:50', Rule::unique('employees', 'code')->ignore($employeeId)],
            'photo' => ['nullable', 'file', 'mimes:png,jpg,jpeg,webp', 'max:2048'],
            // Day-one services to request for a new hire, as service => its submitted
            // fields. Only meaningful on create; EmployeeController files one service
            // request per entry after the employee exists, and ignores them on update.
            'services' => ['sometimes', 'array', 'max:'.count(EmployeeOnboardingService::SERVICES), function (string $attribute, mixed $value, \Closure $fail) {
                $unknown = array_diff(array_keys((array) $value), EmployeeOnboardingService::SERVICES);
                if ($unknown !== []) {
                    $fail('Not a day-one service: '.implode(', ', $unknown).'.');
                }
            }],
            'onboarding_note' => ['nullable', 'string', 'max:500'],
            ...$this->serviceFieldRules(),
        ];
    }

    /**
     * Validation for the detail each ticked service asks for, borrowed wholesale from
     * the Request module's own schema so the two can never disagree about what a
     * computer request needs.
     *
     * This closes a real hole: RequestService::submitFor() is called directly and never
     * passes through StoreServiceRequestRequest, which is the only place those `required`
     * rules used to live. Onboarding therefore filed requests with no device type at all
     * — accepted here, while the identical request typed into the Request form was
     * refused. IT opened "Computer for Somchai" and had to go and ask which kind.
     *
     * @return array<string, mixed>
     */
    private function serviceFieldRules(): array
    {
        $rules = [];

        foreach (array_keys((array) $this->input('services', [])) as $service) {
            if (! in_array($service, EmployeeOnboardingService::SERVICES, true)) {
                continue;
            }

            $prefix = "services.{$service}";
            foreach (RequestSchemas::rules(RequestType::from((string) $service)) as $key => $rule) {
                // RequestSchemas addresses its own form ("fields.device_id"); the same
                // fields sit one level deeper here. Rewritten inside rule strings too,
                // so a cross-field rule such as required_without still points at a real
                // path if a future day-one service uses one.
                $rules[$prefix.'.'.substr($key, strlen('fields.'))] = array_map(
                    fn (mixed $r) => is_string($r) ? str_replace('fields.', $prefix.'.', $r) : $r,
                    (array) $rule,
                );
            }
        }

        return $rules;
    }

    /**
     * A manager may not be the employee itself, nor anyone who already reports
     * (directly or indirectly) to it — either would create a cycle in the tree.
     * Also validates that the chosen section belongs to the employee's department.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            // Validate that the chosen section belongs to the same department as the employee.
            $sectionId = $this->input('section_id');
            if (filled($sectionId)) {
                $section = Section::find($sectionId);
                if ($section && (int) $section->department_id !== (int) $this->input('department_id')) {
                    $v->errors()->add('section_id', 'The selected section is not in the chosen department.');
                }
            }

            $employee = $this->route('employee');
            $managerId = $this->input('manager_id');
            if (! $employee || blank($managerId)) {
                return;
            }
            if ((int) $managerId === $employee->id) {
                $v->errors()->add('manager_id', 'An employee cannot be their own manager.');

                return;
            }
            $manager = Employee::find($managerId);
            if ($manager && $employee->isAncestorOf($manager)) {
                $v->errors()->add('manager_id', 'That person reports to this employee - it would create a loop.');
            }
        });
    }
}
