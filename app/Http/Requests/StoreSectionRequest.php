<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->canManageOrg();
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
