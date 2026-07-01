<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSectionRequest extends FormRequest
{
    /**
     * Store requires employees.section_add; update requires employees.section_edit.
     * The presence of a {section} route binding distinguishes update from store.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }
        $permission = $this->route('section') ? 'employees.section_edit' : 'employees.section_add';

        return (bool) $user->hasPermission($permission);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'department_id' => ['required', 'exists:departments,id'],
            'name' => ['required', 'string', 'max:255'],
            'name_th' => ['nullable', 'string', 'max:255'],
        ];
    }
}
