<?php

namespace App\Http\Requests\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Enums\Auth\LoginEventType;
use App\Models\Auth\LoginEvent;
use App\Models\User;
use App\Services\Auth\LoginEventRecorder;
use App\Services\Auth\PendingLogin;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Support\Timebox;
use Illuminate\Validation\ValidationException;

class LoginRequest extends FormRequest
{
    /** Failed attempts on one login from one IP before a lockout of about a minute. */
    private const MAX_ATTEMPTS_PER_IP = 5;

    /** Failed attempts on one login from every IP together before a 15-minute lockout. */
    public const MAX_ATTEMPTS_PER_LOGIN = 10;

    public const LOGIN_LOCKOUT_SECONDS = 900;

    /** An IP the account signed in from within this many days is exempt from the cross-IP lock. */
    public const KNOWN_IP_DAYS = 90;

    public const STAND_IN_HASH_KEY = 'login-stand-in-hash';

    private ?User $namedAccount = null;

    private bool $namedAccountLookedUp = false;

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
            'login' => ['required_without:pending', 'nullable', 'string', 'max:255'],
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

        $user = $this->account();
        $credentials = ['password' => (string) $this->string('password')];
        if (! $this->passwordMatches($user, $credentials)) {
            $this->recordFailure($user);

            throw ValidationException::withMessages([
                'login' => __('auth.failed'),
            ]);
        }

        $this->ensureAccountIsOpen($user);

        RateLimiter::clear($this->throttleKey());
        RateLimiter::clear($this->loginThrottleKey());

        if (config('hashing.rehash_on_login', true)) {
            Auth::guard('web')->getProvider()->rehashPasswordIfRequired($user, $credentials);
        }

        return $user;
    }

    /**
     * An unknown login is checked against a stand-in hash, so it costs the same hash check as a wrong password
     * however busy the server is; the timebox (auth.timebox_duration) evens out what is left.
     *
     * @param  array{password: string}  $credentials
     *
     * @phpstan-assert-if-true User $user
     */
    private function passwordMatches(?User $user, array $credentials): bool
    {
        $provider = Auth::guard('web')->getProvider();

        return app(Timebox::class)->call(function (Timebox $timebox) use ($user, $credentials, $provider): bool {
            if ($user === null) {
                Hash::check($credentials['password'], self::standInHash());

                return false;
            }

            $matches = $provider->validateCredentials($user, $credentials);
            if ($matches) {
                $timebox->returnEarly();
            }

            return $matches;
        }, (int) config('auth.timebox_duration', 200000));
    }

    /** A hash of a password nobody types, made once at the current hashing cost and made again when that cost changes. */
    public static function standInHash(): string
    {
        $hash = Cache::get(self::STAND_IN_HASH_KEY);
        if (! is_string($hash) || Hash::needsRehash($hash)) {
            $hash = Hash::make(Str::random(40));
            Cache::forever(self::STAND_IN_HASH_KEY, $hash);
        }

        return $hash;
    }

    /** The account the typed login names, looked up once per request; null when none. */
    private function account(): ?User
    {
        if (! $this->namedAccountLookedUp) {
            $login = $this->cleanLoginName();
            $found = $login === null ? null : Auth::guard('web')->getProvider()->retrieveByCredentials([$this->loginField() => $login]);
            $this->namedAccount = $found instanceof User ? $found : null;
            $this->namedAccountLookedUp = true;
        }

        return $this->namedAccount;
    }

    /** Whether this account signed in from this IP within the last 90 days. */
    private function fromKnownIp(): bool
    {
        $user = $this->account();

        return $user !== null && LoginEvent::query()
            ->where('user_id', $user->id)
            ->where('event', LoginEventType::SignedIn)
            ->where('ip', $this->ip())
            ->where('created_at', '>=', now()->subDays(self::KNOWN_IP_DAYS))
            ->exists();
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
        $loginLocked = self::countLoginFailure($this->loginThrottleKey());

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

    /** @return array<string, int> throttle key => failed attempts allowed; an IP the account signed in from skips the cross-IP lock */
    private function throttles(): array
    {
        $throttles = [$this->throttleKey() => self::MAX_ATTEMPTS_PER_IP];
        if (! $this->fromKnownIp()) {
            $throttles[$this->loginThrottleKey()] = self::MAX_ATTEMPTS_PER_LOGIN;
        }

        return $throttles;
    }

    /** An account's cross-IP counter, shared by sign-in and the current-password check of a password change. */
    public static function accountThrottleKey(User $user): string
    {
        return 'login-user:id:'.$user->id;
    }

    /** One failure on a cross-IP counter; true when it trips the lock, which then runs a full 15 minutes from this failure. */
    public static function countLoginFailure(string $loginKey): bool
    {
        $wasLocked = RateLimiter::tooManyAttempts($loginKey, self::MAX_ATTEMPTS_PER_LOGIN);
        RateLimiter::hit($loginKey, self::LOGIN_LOCKOUT_SECONDS);

        $locked = ! $wasLocked && RateLimiter::tooManyAttempts($loginKey, self::MAX_ATTEMPTS_PER_LOGIN);
        if ($locked) {
            RateLimiter::clear($loginKey);
            RateLimiter::increment($loginKey, self::LOGIN_LOCKOUT_SECONDS, self::MAX_ATTEMPTS_PER_LOGIN);
        }

        return $locked;
    }

    /**
     * Per-IP counter: one per account however its name was typed (the database collation ignores some invisible
     * characters), else per normalised typed name; hashed, so a long name never outgrows the cache key column.
     */
    public function throttleKey(): string
    {
        $user = $this->account();
        $who = $user !== null ? 'id:'.$user->id : 'name:'.hash('sha256', $this->normalisedLoginName());

        return 'login-ip:'.$who.'|'.$this->ip();
    }

    /** Cross-IP counter: one per account (email and username alike), else per normalised typed name, hashed so no name can match an account key. */
    public function loginThrottleKey(): string
    {
        $user = $this->account();
        if ($user !== null) {
            return self::accountThrottleKey($user);
        }

        return 'login-user:name:'.hash('sha256', $this->normalisedLoginName());
    }

    /** The typed login without invisible format characters (zero-width spaces and the like), which no username or email holds. */
    private function cleanLoginName(): ?string
    {
        $clean = preg_replace('/\p{Cf}+/u', '', (string) $this->loginName()) ?? '';

        return $clean === '' ? null : $clean;
    }

    /** The cleaned login as one key: lower case, trimmed, transliterated. */
    private function normalisedLoginName(): string
    {
        return Str::transliterate(Str::lower(trim((string) $this->cleanLoginName())));
    }

    private function loginName(): ?string
    {
        $login = $this->input('login');

        return is_string($login) && $login !== '' ? $login : null;
    }

    private function loginField(): string
    {
        return filter_var($this->cleanLoginName(), FILTER_VALIDATE_EMAIL) ? 'email' : 'username';
    }
}
