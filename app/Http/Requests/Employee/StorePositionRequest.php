<?php

namespace App\Http\Requests\Employee;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePositionRequest extends FormRequest
{
    /**
     * Store requires employees.position_add; update requires employees.position_edit.
     * The allow_special_position field is additionally gated in the controller by
     * employees.position_special.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }
        $permission = $this->route('position') ? 'employees.position_edit' : 'employees.position_add';

        return (bool) $user->hasPermission($permission);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $positionId = $this->route('position')?->id;

        return [
            'title' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50', Rule::unique('positions', 'code')->ignore($positionId)],
            // "Special position": employees in it may be saved without a department or a report-to.
            'allow_special_position' => ['sometimes', 'boolean'],
        ];
    }
}
