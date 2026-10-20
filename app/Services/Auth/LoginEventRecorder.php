<?php

// Writes one login_events row: IP, place and device from the request, or from the device the event is about.

namespace App\Services\Auth;

use App\Enums\Auth\DeviceEndReason;
use App\Enums\Auth\LoginEventType;
use App\Models\Auth\LoginEvent;
use App\Models\Auth\UserDevice;
use App\Models\User;
use Illuminate\Http\Request;

class LoginEventRecorder
{
    private const LOGIN_NAME_MAX = 255;

    private const LOCATION_MAX = 120;

    public const MASKED_TAIL = 4;

    public function __construct(private readonly LocationResolver $locations) {}

    /**
     * @param  array{login_name?: ?string, reason?: ?DeviceEndReason, remembered?: bool, device?: ?UserDevice}  $extra
     */
    public function record(LoginEventType $event, ?User $user, Request $request, array $extra = []): LoginEvent
    {
        $device = $extra['device'] ?? null;
        $userId = $user?->getKey() ?? $device?->user_id;
        $loginName = $extra['login_name'] ?? null;
        if ($loginName !== null) {
            $loginName = mb_substr($loginName, 0, self::LOGIN_NAME_MAX);
            // A name matching no account may be a password typed into the wrong box
            $loginName = $userId === null ? self::maskTail($loginName) : $loginName;
        }

        return LoginEvent::create([
            'user_id' => $userId,
            'login_name' => $loginName,
            'event' => $event,
            'reason' => $extra['reason'] ?? null,
            'remembered' => (bool) ($extra['remembered'] ?? false),
            'device_id' => $device?->getKey(),
            ...($device === null ? $this->describe($request) : $this->detailsOf($device)),
        ]);
    }

    /**
     * Where and on what the request comes from; the touch hint tells an iPad from a Mac.
     *
     * @return array{ip: ?string, location: ?string, os: string, browser: string}
     */
    public function describe(Request $request, bool $touchHint = false): array
    {
        $ip = $request->ip();
        $location = $this->locations->resolve($ip);
        $labels = UserAgentLabel::parse($request->userAgent(), $touchHint || $request->boolean('touch'));

        return [
            'ip' => $ip,
            'location' => $location === null ? null : mb_substr($location, 0, self::LOCATION_MAX),
            'os' => $labels['os'],
            'browser' => $labels['browser'],
        ];
    }

    /** The typed text with its last 4 characters hidden (all of it when it is 4 or shorter). */
    public static function maskTail(string $text): string
    {
        $length = mb_strlen($text);
        $shown = max(0, $length - self::MASKED_TAIL);

        return mb_substr($text, 0, $shown).str_repeat('•', $length - $shown);
    }

    /** @return array{ip: ?string, location: ?string, os: string, browser: string} */
    private function detailsOf(UserDevice $device): array
    {
        return ['ip' => $device->ip, 'location' => $device->location, 'os' => $device->os, 'browser' => $device->browser];
    }
}
