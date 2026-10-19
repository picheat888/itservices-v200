<?php

namespace App\Http\Requests\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Enums\Auth\LoginEventType;
use App\Models\User;
use App\Services\Auth\LoginEventRecorder;
use App\Services\Auth\PendingLogin;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Auth\SessionGuard;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LoginRequest extends FormRequest
{
    /** Failed attempts on one login from one IP before a lockout of about a minute. */
    private const MAX_ATTEMPTS_PER_IP = 5;

    /** Failed attempts on one login from every IP together before a 15-minute lockout. */
    private const MAX_ATTEMPTS_PER_LOGIN = 10;

    private const LOGIN_LOCKOUT_SECONDS = 900;

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
            'login' => ['required_without:pending', 'nullable', 'string'],
            'password' => ['required_without:pending', 'nullable', 'string'],
            'pending' => ['nullable', 'string', 'max:100'],
            'touch' => ['nullable', 'boolean'],
        ];
    }

    /** The token from the device-limit dialog, when this request completes one. */
    public function pendingToken(): ?string
    {
        $token = $this->input('pending');

        return is_string($token) && $token !== '' ? $token : null;
    }

    /**
     * The account signing in, from the pending token or from the login and password; no session is started here.
     *
     * @throws HttpResponseException
     * @throws ValidationException
     */
    public function resolveUser(): User
    {
        $pending = $this->pendingToken();
        if ($pending !== null) {
            $user = app(PendingLogin::class)->user($pending, $this) ?? throw self::pendingExpired();
            $this->ensureAccountIsOpen($user);

            return $user;
        }

        $this->ensureIsNotRateLimited();

        /** @var SessionGuard $guard */
        $guard = Auth::guard('web');
        $credentials = [$this->loginField() => $this->loginName(), 'password' => (string) $this->string('password')];
        $valid = $guard->validate($credentials);
        $user = $guard->getLastAttempted();

        if (! $valid || ! $user instanceof User) {
            $this->recordFailure($user instanceof User ? $user : null);

            throw ValidationException::withMessages([
                'login' => __('auth.failed'),
            ]);
        }

        $this->ensureAccountIsOpen($user);

        RateLimiter::clear($this->throttleKey());
        RateLimiter::clear($this->loginThrottleKey());

        if (config('hashing.rehash_on_login', true)) {
            $guard->getProvider()->rehashPasswordIfRequired($user, $credentials);
        }

        return $user;
    }

    /** The 403 for a pending token that expired, was used, or belongs to another browser. */
    public static function pendingExpired(): HttpResponseException
    {
        return new HttpResponseException(response()->json(['message' => 'pending_expired'], 403));
    }

    /**
     * A resigned person gets 403 account_closed before any session exists; no employee record means nothing to resign.
     *
     * @throws HttpResponseException
     */
    private function ensureAccountIsOpen(User $user): void
    {
        // hasLeft(), not the raw status: the last working day itself still signs in
        if ($user->employee?->hasLeft() !== true) {
            return;
        }

        app(LoginEventRecorder::class)->record(LoginEventType::Failed, $user, $this, [
            'login_name' => $this->loginName(),
            'reason' => DeviceEndReason::AccountClosed,
        ]);

        throw new HttpResponseException(response()->json(['message' => 'account_closed'], 403));
    }

    /** Counts the failure on both throttles and logs it; the failure that trips a throttle also logs Locked. */
    private function recordFailure(?User $user): void
    {
        RateLimiter::hit($this->throttleKey());
        RateLimiter::hit($this->loginThrottleKey(), self::LOGIN_LOCKOUT_SECONDS);

        $loginLocked = RateLimiter::tooManyAttempts($this->loginThrottleKey(), self::MAX_ATTEMPTS_PER_LOGIN);
        if ($loginLocked) {
            // The lock runs a full 15 minutes from this failure
            RateLimiter::clear($this->loginThrottleKey());
            RateLimiter::increment($this->loginThrottleKey(), self::LOGIN_LOCKOUT_SECONDS, self::MAX_ATTEMPTS_PER_LOGIN);
        }

        $events = app(LoginEventRecorder::class);
        $extra = ['login_name' => $this->loginName()];
        $events->record(LoginEventType::Failed, $user, $this, $extra);

        if ($loginLocked || RateLimiter::tooManyAttempts($this->throttleKey(), self::MAX_ATTEMPTS_PER_IP)) {
            $events->record(LoginEventType::Locked, $user, $this, $extra);
        }
    }

    /**
     * 429 too_many_attempts with the longest remaining wait once either throttle is full.
     *
     * @throws HttpResponseException
     */
    public function ensureIsNotRateLimited(): void
    {
        $tripped = array_filter(
            $this->throttles(),
            fn (int $maxAttempts, string $key) => RateLimiter::tooManyAttempts($key, $maxAttempts),
            ARRAY_FILTER_USE_BOTH,
        );

        if ($tripped === []) {
            return;
        }

        event(new Lockout($this));

        $seconds = max(array_map(fn (string $key) => RateLimiter::availableIn($key), array_keys($tripped)));

        throw new HttpResponseException(response()->json([
            'message' => 'too_many_attempts',
            'retry_after' => $seconds,
        ], 429, ['Retry-After' => $seconds]));
    }

    /** @return array<string, int> throttle key => failed attempts allowed */
    private function throttles(): array
    {
        return [
            $this->throttleKey() => self::MAX_ATTEMPTS_PER_IP,
            $this->loginThrottleKey() => self::MAX_ATTEMPTS_PER_LOGIN,
        ];
    }

    public function throttleKey(): string
    {
        return Str::transliterate(Str::lower($this->string('login')).'|'.$this->ip());
    }

    public function loginThrottleKey(): string
    {
        return 'login-user:'.Str::transliterate(Str::lower($this->string('login')));
    }

    private function loginName(): ?string
    {
        $login = $this->input('login');

        return is_string($login) && $login !== '' ? $login : null;
    }

    private function loginField(): string
    {
        return filter_var($this->loginName(), FILTER_VALIDATE_EMAIL) ? 'email' : 'username';
    }
}
