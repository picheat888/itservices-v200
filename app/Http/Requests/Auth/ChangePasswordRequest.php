<?php

// Self-service password change, voluntary or forced; wrong current passwords count toward the sign-in lockout.

namespace App\Http\Requests\Auth;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rules\Password;

class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** A forced change waives the current password: the person just signed in with it. */
    public function isForced(): bool
    {
        return (bool) $this->user()?->must_change_password;
    }

    public function accountThrottleKey(): string
    {
        return LoginRequest::accountThrottleKey($this->user());
    }

    /** A stolen session cannot guess the current password here once the account is locked out. */
    protected function prepareForValidation(): void
    {
        $key = $this->accountThrottleKey();
        if (! $this->isForced() && RateLimiter::tooManyAttempts($key, LoginRequest::MAX_ATTEMPTS_PER_LOGIN)) {
            $seconds = RateLimiter::availableIn($key);

            throw new HttpResponseException(
                response()->json(['message' => 'too_many_attempts', 'retry_after' => $seconds], 429, ['Retry-After' => $seconds])
            );
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'current_password' => $this->isForced() ? ['nullable'] : [
                'bail', 'required', 'string',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (! Hash::check($value, $this->user()->password)) {
                        LoginRequest::countLoginFailure($this->accountThrottleKey());
                        Log::warning('Wrong current password on a password change', ['user_id' => $this->user()->id, 'ip' => $this->ip()]);
                        $fail('validation.current_password')->translate();
                    }
                },
            ],
            'password' => [
                'required', 'string', 'confirmed', Password::min(8)->mixedCase()->numbers()->symbols(),
                // Reusing the current password would reset the expiry clock or keep the handed-over one
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (is_string($value) && Hash::check($value, $this->user()->password)) {
                        $fail('validation.password_reused')->translate();
                    }
                },
            ],
        ];
    }
}
