<?php

namespace App\Services\Contract;

use App\Models\Contract\Contract;
use App\Models\Contract\ContractAlertLog;
use App\Models\Contract\ContractBellLog;
use App\Models\User;
use App\Notifications\ContractExpiryNotification;
use App\Services\Email\EmailNotificationService;
use App\Support\DateDisplay;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;

/**
 * Contract expiry alerts: a daily bell (contract_bell_logs) and one email per crossed threshold
 * plus one when overdue (contract_alert_logs), only for contracts with a reminder switched on.
 */
class ContractExpiryAlertService
{
    /** Sentinel "threshold" recorded in contract_alert_logs once the expired email has been sent. */
    private const EXPIRED_EMAIL_MARKER = 0;

    public function __construct(private readonly EmailNotificationService $email) {}

    /**
     * Evaluate all contracts and fire any due bell/email alerts.
     *
     * @param  bool  $force  Re-fire the in-app bell even if today's was already sent (testing).
     * @return int number of contracts that fired a bell on this run
     */
    public function run(bool $force = false): int
    {
        $recipients = User::holdingPermission('contracts.alerts')->holdingPermission('contracts.view')->stillWorking()->orderBy('id')->get();

        // No recipients = no ledger rows written
        if ($recipients->isEmpty()) {
            return 0;
        }

        $contracts = Contract::whereNull('cancelled_at')
            ->whereNull('expired_at')
            ->get()
            ->filter(fn (Contract $c) => $c->enabledReminderDays() !== [])
            ->filter(fn (Contract $c) => $c->isInReminder() || $c->isOverdue());

        $belled = 0;

        foreach ($contracts as $contract) {
            $days = $contract->daysRemaining();

            if ($this->fireDailyBell($contract, $days, $recipients, $force)) {
                $belled++;
            }

            $this->sendDueEmails($contract, $days, $recipients);
        }

        return $belled;
    }

    /** Clears a contract's alert ledgers and bells: a renewed or reopened term alerts afresh, a closed or deleted one stops. */
    public function resetForContract(Contract $contract): void
    {
        ContractAlertLog::where('contract_id', $contract->id)->delete();
        ContractBellLog::where('contract_id', $contract->id)->delete();

        DatabaseNotification::where('type', ContractExpiryNotification::class)
            ->where('data->contract_id', $contract->id)
            ->delete();
    }

    /**
     * Sends the in-app bell to all recipients at most once per calendar day.
     *
     * @param  Collection<int, User>  $recipients
     * @param  bool  $force  Skip the once-per-day guard (testing).
     * @return bool whether a bell was sent on this run
     */
    private function fireDailyBell(Contract $contract, int $days, Collection $recipients, bool $force = false): bool
    {
        $today = now()->toDateString();

        $alreadyBelledToday = ContractBellLog::where('contract_id', $contract->id)
            ->whereDate('bell_date', $today)
            ->exists();

        if ($alreadyBelledToday && ! $force) {
            return false;
        }

        // Replace, not stack: one unread bell per contract
        $this->clearBellNotifications($contract, $recipients);

        Notification::send($recipients, new ContractExpiryNotification($contract, $days));
        // firstOrCreate: a forced resend keeps the one row per contract and day
        ContractBellLog::firstOrCreate(['contract_id' => $contract->id, 'bell_date' => $today]);

        return true;
    }

    /**
     * Removes any existing in-app bell notifications for this contract from the
     * given recipients, leaving the daily resend to recreate exactly one each.
     *
     * @param  Collection<int, User>  $recipients
     */
    private function clearBellNotifications(Contract $contract, Collection $recipients): void
    {
        foreach ($recipients as $recipient) {
            $recipient->notifications()
                ->where('type', ContractExpiryNotification::class)
                ->where('data->contract_id', $contract->id)
                ->delete();
        }
    }

    /**
     * Sends the quieter email channel: each newly-crossed reminder threshold once
     * while still active, and a single mail when the contract first expires.
     *
     * @param  Collection<int, User>  $recipients
     */
    private function sendDueEmails(Contract $contract, int $days, Collection $recipients): void
    {
        $alreadyEmailed = ContractAlertLog::where('contract_id', $contract->id)
            ->pluck('threshold')->all();

        if ($days < 0) {
            if (in_array(self::EXPIRED_EMAIL_MARKER, $alreadyEmailed, true)) {
                return;
            }

            $this->emailRecipients($contract, $recipients, 'contract.expired_alert', [
                'contract.days_overdue' => abs($days),
            ]);
            $this->logEmailed($contract, [self::EXPIRED_EMAIL_MARKER]);

            return;
        }

        $crossed = array_filter($contract->enabledReminderDays(), fn (int $d) => $days <= $d);
        $newCrossed = array_values(array_diff($crossed, $alreadyEmailed));
        if ($newCrossed === []) {
            return;
        }

        $this->emailRecipients($contract, $recipients, 'contract.expiry_alert', [
            'contract.days_remaining' => $days,
            'contract.expires_in' => match ($days) {
                0 => 'today',
                1 => 'in 1 day',
                default => "in {$days} days",
            },
        ]);

        // Log every crossed threshold so skipped ones never mail later
        $this->logEmailed($contract, $newCrossed);
    }

    /**
     * Queues a templated email to every recipient that has an address, merging
     * the shared contract variables with the channel-specific extras.
     *
     * @param  Collection<int, User>  $recipients
     * @param  array<string, mixed>  $extraVars
     */
    private function emailRecipients(Contract $contract, Collection $recipients, string $template, array $extraVars): void
    {
        foreach ($recipients as $recipient) {
            $this->email->sendTemplate($template, $recipient->email, array_merge([
                // Escaped: the body is HTML and these are typed by people
                'user.first_name' => e(explode(' ', (string) $recipient->name)[0] ?: 'there'),
                'contract.vendor' => e((string) $contract->vendor?->name),
                'contract.name' => e((string) $contract->name),
                'contract.code' => e((string) $contract->code),
                'contract.end_date' => DateDisplay::emailDate($contract->end_date),
                'contract.details' => e(filled($contract->details) ? $contract->details : '-'),
            ], $extraVars), url("/contracts?view={$contract->id}"), 'Open the contract', $recipient->name);
        }
    }

    /**
     * Records the given thresholds against the contract so the email channel
     * never re-sends them.
     *
     * @param  array<int, int>  $thresholds
     */
    private function logEmailed(Contract $contract, array $thresholds): void
    {
        foreach ($thresholds as $threshold) {
            ContractAlertLog::create([
                'contract_id' => $contract->id,
                'threshold' => $threshold,
                'alerted_at' => now(),
            ]);
        }
    }
}
