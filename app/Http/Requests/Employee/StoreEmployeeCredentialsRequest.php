<?php

// A first login for an employee who has none: username, confirmed password, and whether to force a change.

namespace App\Http\Requests\Employee;

use Illuminate\Auth\Access\Response;
use Illuminate\Validation\Rule;

class StoreEmployeeCredentialsRequest extends EmployeeCredentialsRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canCreateLogin($this->user(), $this->employee());
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'username' => [...self::USERNAME_RULES, 'unique:users,username', Rule::unique('employees', 'username')->ignore($this->employee()->id)],
            'password' => ['required', 'string', 'confirmed', $this->passwordRule()],
            'force_change' => ['sometimes', 'boolean'],
        ];
    }
}
