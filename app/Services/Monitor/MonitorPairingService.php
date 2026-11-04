<?php

// Pairs the one monitor TV: the TV shows a short-lived 6-digit code, an admin types it in Settings and the TV gets a device token.

namespace App\Services\Monitor;

use App\Models\AuditLog;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Auth\UserAgentLabel;
use App\Support\Refusal;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class MonitorPairingService
{
    public const DEVICE_KEY = 'monitor_device';

    /** Pairing and unpairing run one at a time, so two admins typing the same code never both use it. */
    public const PAIR_LOCK = 'monitor:pair';

    private const LOCK_SECONDS = 10;

    private const LOCK_WAIT_SECONDS = 5;

    private const CODE_SECONDS = 300;

    private const LAST_SEEN_KEY = 'monitor:last_seen';

    private const HANDOVER_KEY = 'monitor:handover';

    private const HANDOVER_SECONDS = 120;

    /**
     * A fresh code for a TV waiting to be paired.
     *
     * @return array{pairing_id: string, code: string, expires_at: string, expires_in: int}
     */
    public function issueCode(string $userAgent): array
    {
        do {
            $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        } while (Cache::has($this->codeKey($code)));

        $pairingId = Str::random(40);
        $expiresAt = now()->addSeconds(self::CODE_SECONDS);

        Cache::put($this->codeKey($code), $pairingId, $expiresAt);
        Cache::put($this->pairingKey($pairingId), [
            'code' => $code,
            'status' => 'pending',
            'user_agent' => Str::limit($userAgent, 500, ''),
        ], $expiresAt);

        // expires_in lets a TV with a wrong clock count down from when the reply arrived
        return ['pairing_id' => $pairingId, 'code' => $code, 'expires_at' => $expiresAt->toIso8601String(), 'expires_in' => self::CODE_SECONDS];
    }

    /**
     * Where the TV's pairing stands; once paired, the device token can be collected until the short hand-over window ends.
     *
     * @return array{status: string, device_token?: string}
     */
    public function pollPairing(string $pairingId): array
    {
        $pairing = Cache::get($this->pairingKey($pairingId));
        if (! is_array($pairing)) {
            return ['status' => 'expired'];
        }

        if ($pairing['status'] !== 'paired') {
            return ['status' => 'pending'];
        }

        return ['status' => 'paired', 'device_token' => $pairing['token']];
    }

    /**
     * Pairs the TV showing $code; any previously paired TV stops working at once.
     *
     * @return array<string, mixed>
     */
    public function pair(string $code, User $by): array
    {
        return Cache::lock(self::PAIR_LOCK, self::LOCK_SECONDS)->block(self::LOCK_WAIT_SECONDS, fn () => $this->pairLocked($code, $by));
    }

    public function unpair(): void
    {
        Cache::lock(self::PAIR_LOCK, self::LOCK_SECONDS)->block(self::LOCK_WAIT_SECONDS, fn () => $this->unpairLocked());
    }

    /** @return array<string, mixed> */
    private function pairLocked(string $code, User $by): array
    {
        $pairingId = Cache::pull($this->codeKey($code));
        $pairing = is_string($pairingId) ? Cache::get($this->pairingKey($pairingId)) : null;
        if (! is_array($pairing) || $pairing['status'] !== 'pending') {
            Refusal::fail('monitor_code_invalid', field: 'code');
        }

        $token = Str::random(64);
        $agent = UserAgentLabel::parse($pairing['user_agent']);

        AppSetting::put(self::DEVICE_KEY, json_encode([
            'token_hash' => hash('sha256', $token),
            'paired_at' => now()->toIso8601String(),
            'paired_by' => $by->name,
            'browser' => $agent['browser'],
            'os' => $agent['os'],
        ], JSON_UNESCAPED_UNICODE));
        Cache::forget(self::LAST_SEEN_KEY);

        // Short window for the TV's next poll to collect the token; an earlier hand-over ends now
        $this->endHandover();
        Cache::put($this->pairingKey($pairingId), [...$pairing, 'status' => 'paired', 'token' => $token], self::HANDOVER_SECONDS);
        Cache::put(self::HANDOVER_KEY, $pairingId, self::HANDOVER_SECONDS);

        AuditLog::record('Paired monitor screen', "{$agent['browser']} on {$agent['os']}");

        return $this->status();
    }

    private function unpairLocked(): void
    {
        $device = $this->device();
        AppSetting::put(self::DEVICE_KEY, null);
        Cache::forget(self::LAST_SEEN_KEY);
        $this->endHandover();

        if ($device !== null) {
            AuditLog::record('Unpaired monitor screen', "{$device['browser']} on {$device['os']}");
        }
    }

    /**
     * @return array{paired: bool, paired_at: ?string, paired_by: ?string, browser: ?string, os: ?string, last_seen_at: ?string}
     */
    public function status(): array
    {
        $device = $this->device();

        return [
            'paired' => $device !== null,
            'paired_at' => $device['paired_at'] ?? null,
            'paired_by' => $device['paired_by'] ?? null,
            'browser' => $device['browser'] ?? null,
            'os' => $device['os'] ?? null,
            'last_seen_at' => $device !== null ? Cache::get(self::LAST_SEEN_KEY) : null,
        ];
    }

    public function deviceMatches(?string $token): bool
    {
        $device = $this->device();

        return $device !== null && is_string($token) && $token !== ''
            && hash_equals($device['token_hash'], hash('sha256', $token));
    }

    public function touchLastSeen(): void
    {
        Cache::forever(self::LAST_SEEN_KEY, now()->toIso8601String());
    }

    /** @return array{token_hash: string, paired_at: string, paired_by: string, browser: string, os: string}|null */
    private function device(): ?array
    {
        $stored = AppSetting::get(self::DEVICE_KEY);
        $device = is_string($stored) && $stored !== '' ? json_decode($stored, true) : null;

        return is_array($device) && isset($device['token_hash']) ? $device : null;
    }

    /** A TV still able to collect an old token would bounce between screens, so its hand-over is dropped. */
    private function endHandover(): void
    {
        $pairingId = Cache::pull(self::HANDOVER_KEY);
        if (is_string($pairingId)) {
            Cache::forget($this->pairingKey($pairingId));
        }
    }

    private function codeKey(string $code): string
    {
        return "monitor:code:{$code}";
    }

    private function pairingKey(string $pairingId): string
    {
        return "monitor:pairing:{$pairingId}";
    }
}
