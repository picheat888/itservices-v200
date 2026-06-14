<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePositionRequest extends FormRequest
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
        $positionId = $this->route('position')?->id;

        return [
            'title' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50', Rule::unique('positions', 'code')->ignore($positionId)],
            // "Special position": employees in it may be saved without a department or a report-to.
            'allow_special_position' => ['sometimes', 'boolean'],
        ];
    }
}
