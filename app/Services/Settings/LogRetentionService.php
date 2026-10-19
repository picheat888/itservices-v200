<?php

namespace App\Services\Settings;

use App\Models\AuditLog;
use App\Models\Auth\LoginEvent;
use App\Models\Email\EmailLog;
use App\Models\Settings\AppSetting;
use Illuminate\Support\Facades\DB;

/** The nightly prune behind `logs:prune`; every window is read from app_settings and 0 means keep forever. */
class LogRetentionService
{
    // Rows touched per statement, so a long sweep never holds one lock for its duration
    private const CHUNK = 1000;

    // Defaults for a fresh install; audit_log_days stays 0 on purpose, the audit trail is never purged unless an admin decides
    public const DEFAULTS = [
        'email_log_body_days' => 90,
        'email_log_days' => 730,
        'audit_log_days' => 0,
        'notification_days' => 90,
        'login_log_days' => 365,
    ];

    /**
     * Runs every window that is switched on; safe to run twice.
     *
     * @return array{email_bodies: int, email_logs: int, audit_logs: int, notifications: int, login_events: int}
     */
    public function run(): array
    {
        $removed = [
            // Rows go before bodies are emptied, so the strip only reaches what is kept
            'email_logs' => $this->pruneEmailLogs(),
            'email_bodies' => $this->stripEmailBodies(),
            'audit_logs' => $this->pruneAuditLogs(),
            'notifications' => $this->pruneNotifications(),
            'login_events' => $this->pruneLoginEvents(),
        ];

        // Logged only when something went, so an empty night adds no audit row
        if (array_sum($removed) > 0) {
            AuditLog::record('Pruned logs', $this->summary($removed));
        }

        return [
            'email_bodies' => $removed['email_bodies'],
            'email_logs' => $removed['email_logs'],
            'audit_logs' => $removed['audit_logs'],
            'notifications' => $removed['notifications'],
            'login_events' => $removed['login_events'],
        ];
    }

    /** The retention window for a key, in days; 0 (or below) means keep forever. */
    public function days(string $key): int
    {
        return max(0, (int) AppSetting::get($key, (string) (self::DEFAULTS[$key] ?? 0)));
    }

    // Empties the body of messages past the body window and leaves the row
    private function stripEmailBodies(): int
    {
        $days = $this->days('email_log_body_days');
        if ($days === 0) {
            return 0;
        }

        $cutoff = now()->subDays($days);

        return $this->inChunks(fn () => EmailLog::query()
            ->whereNotNull('body_html')
            ->where('created_at', '<', $cutoff)
            ->limit(self::CHUNK)
            ->update(['body_html' => null]));
    }

    private function pruneEmailLogs(): int
    {
        $days = $this->days('email_log_days');
        if ($days === 0) {
            return 0;
        }

        $cutoff = now()->subDays($days);

        return $this->inChunks(fn () => EmailLog::query()
            ->where('created_at', '<', $cutoff)
            ->limit(self::CHUNK)
            ->delete());
    }

    private function pruneAuditLogs(): int
    {
        $days = $this->days('audit_log_days');
        if ($days === 0) {
            return 0;
        }

        $cutoff = now()->subDays($days);

        return $this->inChunks(fn () => AuditLog::query()
            ->where('created_at', '<', $cutoff)
            ->limit(self::CHUNK)
            ->delete());
    }

    private function pruneLoginEvents(): int
    {
        $days = $this->days('login_log_days');
        if ($days === 0) {
            return 0;
        }

        $cutoff = now()->subDays($days);

        return $this->inChunks(fn () => LoginEvent::query()
            ->where('created_at', '<', $cutoff)
            ->limit(self::CHUNK)
            ->delete());
    }

    // Deletes read bells past the window; an unread one is never pruned
    private function pruneNotifications(): int
    {
        $days = $this->days('notification_days');
        if ($days === 0) {
            return 0;
        }

        $cutoff = now()->subDays($days);

        return $this->inChunks(fn () => DB::table('notifications')
            ->whereNotNull('read_at')
            ->where('created_at', '<', $cutoff)
            ->limit(self::CHUNK)
            ->delete());
    }

    /**
     * Repeats a chunked statement until a short chunk comes back; returns the total.
     *
     * @param  callable(): int  $statement
     */
    private function inChunks(callable $statement): int
    {
        $total = 0;

        do {
            $affected = (int) $statement();
            $total += $affected;
        } while ($affected === self::CHUNK);

        return $total;
    }

    /** @param  array<string, int>  $removed */
    private function summary(array $removed): string
    {
        $parts = [];
        foreach ($removed as $what => $count) {
            if ($count > 0) {
                $parts[] = "{$what}: {$count}";
            }
        }

        return implode(', ', $parts);
    }
}
