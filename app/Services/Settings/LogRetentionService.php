<?php

namespace App\Services\Settings;

use App\Models\AuditLog;
use App\Models\Email\EmailLog;
use App\Models\Settings\AppSetting;
use Illuminate\Support\Facades\DB;

/**
 * The nightly prune behind `logs:prune`.
 *
 * Three tables grow without bound and never shrink on their own: email_logs (which keeps
 * the message body of every send), audit_logs, and notifications. Nothing here is business
 * data — it is the record of what the system DID — so the question is not whether to keep
 * it but for how long, and that answer belongs to the administrator, not to this code.
 * Every window is read from app_settings and **0 means keep forever**, the same convention
 * the session-timeout and password-expiry policies use on the same Settings screen.
 *
 * Email bodies are emptied BEFORE their rows are deleted, in two separate windows on
 * purpose. The body is almost all of the weight; the rest of the row (who, when, which
 * template, whether it failed) is a few hundred bytes and feeds the counters on the Email
 * Templates page. So the body goes at 90 days while the row stays for two years: the table
 * stops growing, the statistics stay honest, and the log still answers "was this sent?"
 * long after it stops answering "what did it say?". EmailLogController::show() already
 * renders a null body as "content was not recorded" rather than an empty frame, so nothing
 * on screen has to change for this.
 *
 * Deleting is chunked rather than issued as one statement. A year of rows in a single
 * DELETE holds locks for as long as it takes, and this runs at 02:00 against the same
 * database the night shift uses.
 */
class LogRetentionService
{
    /** Rows touched per statement, so a long sweep never holds one lock for its duration. */
    private const CHUNK = 1000;

    /**
     * Defaults for a fresh install, used until an administrator saves the Security screen.
     *
     * audit_log_days is 0 — and the only one that is. Purging an audit trail is a decision
     * about what the organisation must be able to prove later; a default that quietly starts
     * deleting it would be this code making that decision on their behalf.
     */
    public const DEFAULTS = [
        'email_log_body_days' => 90,
        'email_log_days' => 730,
        'audit_log_days' => 0,
        'notification_days' => 90,
    ];

    /**
     * Runs every window that is switched on. Safe to run twice: each pass only matches rows
     * the previous one left behind.
     *
     * @return array{email_bodies: int, email_logs: int, audit_logs: int, notifications: int}
     */
    public function run(): array
    {
        $removed = [
            // Rows are deleted before bodies are emptied: a row on its way out needs no
            // second write, so the strip below only has to reach what is being kept.
            'email_logs' => $this->pruneEmailLogs(),
            'email_bodies' => $this->stripEmailBodies(),
            'audit_logs' => $this->pruneAuditLogs(),
            'notifications' => $this->pruneNotifications(),
        ];

        // Only when something actually went. A line every night saying "removed nothing" is
        // 365 rows a year of noise in the very table this command exists to keep small.
        if (array_sum($removed) > 0) {
            AuditLog::record('Pruned logs', $this->summary($removed));
        }

        return [
            'email_bodies' => $removed['email_bodies'],
            'email_logs' => $removed['email_logs'],
            'audit_logs' => $removed['audit_logs'],
            'notifications' => $removed['notifications'],
        ];
    }

    /** The retention window for a key, in days. 0 (or anything below) means keep forever. */
    public function days(string $key): int
    {
        return max(0, (int) AppSetting::get($key, (string) (self::DEFAULTS[$key] ?? 0)));
    }

    /**
     * Empties the body of sent messages past the body window, leaving the row itself.
     *
     * `whereNotNull` is what makes this terminate and stay cheap: without it every night
     * would rewrite the same already-empty rows for the rest of the installation's life.
     */
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

    /**
     * Deletes bells that have been read and are past the window.
     *
     * An unread notification is never pruned however old it is — it is still somebody's
     * inbox, and a system that silently empties it is worse than one that keeps a long list.
     */
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
     * Repeats a chunked statement until it stops matching rows, and returns the total.
     *
     * The loop ends on a short chunk rather than on zero, which saves one empty round trip
     * per table on the common night where there is little or nothing to remove.
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
