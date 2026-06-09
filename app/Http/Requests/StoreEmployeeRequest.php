<?php

namespace App\Http\Requests;

use App\Models\Employee;
use App\Models\Section;
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

        return [
            'name' => ['required', 'string', 'max:255'],
            'name_th' => ['nullable', 'string', 'max:255'],
            'department_id' => ['nullable', 'exists:departments,id'],
            'section_id' => ['nullable', 'exists:sections,id'],
            'position_id' => ['nullable', 'exists:positions,id'],
            'manager_id' => ['nullable', 'exists:employees,id'],
            'email' => ['nullable', 'email', 'max:255'],
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
