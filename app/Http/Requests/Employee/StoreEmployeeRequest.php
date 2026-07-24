<?php

namespace App\Http\Requests\Employee;

use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\User;
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
            'username' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'joined_at' => ['nullable', 'date'],
            'status' => ['nullable', Rule::in(['active', 'resigned'])],
            'code' => ['nullable', 'string', 'max:50', Rule::unique('employees', 'code')->ignore($employeeId)],
            'photo' => ['nullable', 'file', 'mimes:png,jpg,jpeg,webp', 'max:2048'],
        ];
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
                $v->errors()->add('manager_id', 'That person reports to this employee — it would create a loop.');
            }
        });
    }
}
