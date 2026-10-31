<?php

// Rename an existing login and/or reset its password; each part needs its own right.

namespace App\Http\Requests\Employee;

use Illuminate\Auth\Access\Response;
use Illuminate\Validation\Rule;

class UpdateEmployeeCredentialsRequest extends EmployeeCredentialsRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canManageLogin($this->user(), $this->employee());
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'username' => [
                'sometimes',
                ...self::USERNAME_RULES,
                Rule::unique('users', 'username')->ignore($this->employee()->user->id),
                Rule::unique('employees', 'username')->ignore($this->employee()->id),
            ],
            'reset_password' => ['sometimes', 'boolean'],
            'password' => ['nullable', 'string', $this->passwordRule()],
            'force_change' => ['sometimes', 'boolean'],
        ];
    }

    public function renaming(): bool
    {
        return $this->has('username');
    }

    public function resetting(): bool
    {
        return $this->boolean('reset_password');
    }

    protected function passedValidation(): void
    {
        $this->guard()->canChangeLogin($this->user(), $this->renaming(), $this->resetting())->authorize();
    }
}
