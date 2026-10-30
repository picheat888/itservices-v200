<?php

// The signed-in account's own profile; the Thai name, phone and photo live on the employee, so an unlinked account cannot send them.

namespace App\Http\Requests\Auth;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('profile.edit');
    }

    /** A plain 403 with no message, so the form shows its own words. */
    protected function failedAuthorization(): void
    {
        abort(403);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $employeeOnly = $this->user()?->linkedEmployee() ? [] : ['prohibited'];

        return [
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'first_name_th' => [...$employeeOnly, 'nullable', 'string', 'max:255'],
            'last_name_th' => [...$employeeOnly, 'nullable', 'string', 'max:255'],
            'phone' => [...$employeeOnly, 'nullable', 'string', 'max:50'],
            'photo' => [...$employeeOnly, 'nullable', 'image', 'max:2048'],
        ];
    }
}
