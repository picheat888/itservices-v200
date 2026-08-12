<?php

namespace App\Http\Requests\Auth;

use Illuminate\Auth\Events\Lockout;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'login' => ['required', 'string'],
            'password' => ['required', 'string'],
        ];
    }

    /**
     * Attempt to authenticate using either an email address or a username.
     *
     * @throws ValidationException
     */
    public function authenticate(): void
    {
        $this->ensureIsNotRateLimited();

        $login = (string) $this->string('login');
        $field = filter_var($login, FILTER_VALIDATE_EMAIL) ? 'email' : 'username';

        if (! Auth::attempt([$field => $login, 'password' => $this->string('password')], $this->boolean('remember'))) {
            RateLimiter::hit($this->throttleKey());

            throw ValidationException::withMessages([
                'login' => __('auth.failed'),
            ]);
        }

        $this->ensureEmployeeHasNotResigned();

        RateLimiter::clear($this->throttleKey());
    }

    /**
     * The credentials were right, but the person behind them has left the company.
     *
     * Resigning flips employees.status and leaves the login row alone — there is no
     * "disabled" flag on an account to set — so without this the password of somebody who
     * resigned keeps working, with their role and every permission on it. The session
     * opened by Auth::attempt a moment ago is dropped again here.
     *
     * Answers 403 with a code rather than a 422: the sign-in form renders its own copy per
     * status, and 422 is the "wrong username or password" case — which would send a person
     * whose account is simply closed off to hunt for a typo, and support after them.
     *
     * An account with no employee record (the administrator the system ships with) is left
     * alone: no directory record means nothing to resign.
     *
     * @throws HttpResponseException
     */
    private function ensureEmployeeHasNotResigned(): void
    {
        // hasLeft(), not the raw status: a resignation recorded for a last day still to
        // come leaves the account working until that day is behind them.
        if (Auth::user()?->employee?->hasLeft() !== true) {
            return;
        }

        Auth::guard('web')->logout();

        throw new HttpResponseException(response()->json(['message' => 'account_closed'], 403));
    }

    /**
     * Blocks further attempts after 5 failures on the same login + IP.
     *
     * Answers 429 with a message code and the remaining wait instead of a validation
     * error: the SPA renders its own localized copy (the UI can be Thai while the API
     * locale is English), and it must be able to tell "locked out" from "wrong password".
     *
     * @throws HttpResponseException
     */
    public function ensureIsNotRateLimited(): void
    {
        if (! RateLimiter::tooManyAttempts($this->throttleKey(), 5)) {
            return;
        }

        event(new Lockout($this));

        $seconds = RateLimiter::availableIn($this->throttleKey());

        throw new HttpResponseException(response()->json([
            'message' => 'too_many_attempts',
            'retry_after' => $seconds,
        ], 429, ['Retry-After' => $seconds]));
    }

    public function throttleKey(): string
    {
        return Str::transliterate(Str::lower($this->string('login')).'|'.$this->ip());
    }
}
