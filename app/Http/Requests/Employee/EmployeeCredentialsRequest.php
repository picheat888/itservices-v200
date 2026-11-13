<?php

// Base for setting or changing an employee's login: the username and password rules both forms share.

namespace App\Http\Requests\Employee;

use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

abstract class EmployeeCredentialsRequest extends EmployeeActionRequest
{
    /**
     * English letters only: starts with a letter, ends with a letter or digit, . _ - in between (the forms mirror it).
     *
     * @var list<string>
     */
    protected const USERNAME_RULES = ['required', 'string', 'max:30', 'regex:/^[A-Za-z][A-Za-z0-9._-]*[A-Za-z0-9]$/'];

    /** The complexity set Active Directory uses; the forms mirror it as a live checklist. */
    protected function passwordRule(): Password
    {
        return Password::min(8)->mixedCase()->numbers()->symbols();
    }

    /** Logins are case-insensitive, so "John_Do" must not slip past an existing "john_do". */
    protected function prepareForValidation(): void
    {
        $username = $this->input('username');
        if (is_string($username)) {
            $this->merge(['username' => Str::lower(trim($username))]);
        }
    }
}
