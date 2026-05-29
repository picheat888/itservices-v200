<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\ContractAlertLog;
use App\Models\ContractBellLog;
use App\Models\User;
use App\Notifications\ContractExpiryNotification;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;

/**
 * Drives the two contract-expiry alert channels for every contract that is
 * "expiring soon" (inside its reminder window) or already expired:
 *
 *  - Bell (in-app): re-fires once a day for as long as the contract stays in
 *    that state, deduped per calendar day via contract_bell_logs.
 *  - Email: deliberately quieter — once per crossed reminder threshold
 *    (150/120/90/60/45/30/7) plus a single "it has expired" mail, deduped per
 *    threshold via contract_alert_logs (the sentinel threshold 0 marks the
 *    expired mail).
 *
 * A contract only alerts on either channel when it has at least one reminder
 * threshold enabled, so the per-contract opt-out is respected even once expired.
 */
class ContractExpiryAlertService
{
    /** Sentinel "threshold" recorded in contract_alert_logs once the expired email has been sent. */
    private const EXPIRED_EMAIL_MARKER = 0;

    public function __construct(private readonly EmailNotificationService $email) {}

    /**
     * Evaluate all contracts and fire any due bell/email alerts.
     *
     * @return int number of contracts that fired a bell on this run
     */
    public function run(): int
    {
        $recipients = User::all()->filter(
            fn (User $u) => $u->hasPermission('contracts.alerts')
        );

        // Don't touch any ledger when there's nobody to notify yet — otherwise
        // enabling contracts.alerts later would skip alerts whose dedup row was
        // already written against an empty audience.
        if ($recipients->isEmpty()) {
            return 0;
        }

        $contracts = Contract::whereNull('cancelled_at')
            ->get()
            ->filter(fn (Contract $c) => $c->enabledReminderDays() !== [])
            ->filter(fn (Contract $c) => $c->isInReminder() || $c->daysRemaining() <= 0);

        $belled = 0;

        foreach ($contracts as $contract) {
            $days = $contract->daysRemaining();

            if ($this->fireDailyBell($contract, $days, $recipients)) {
                $belled++;
            }

            $this->sendDueEmails($contract, $days, $recipients);
        }

        return $belled;
    }

    /** Clears a contract's alert ledgers so a renewed term alerts afresh on both channels. */
    public function resetForContract(Contract $contract): void
    {
        ContractAlertLog::where('contract_id', $contract->id)->delete();
        ContractBellLog::where('contract_id', $contract->id)->delete();

        // Also drop the in-app bell so a renewed contract stops showing a stale
        // "expiring soon" alert; a fresh term will re-bell on the next run.
        DatabaseNotification::where('type', ContractExpiryNotification::class)
            ->where('data->contract_id', $contract->id)
            ->delete();
    }

    /**
     * Sends the in-app bell to all recipients at most once per calendar day.
     *
     * @param  Collection<int, User>  $recipients
     * @return bool whether a bell was sent on this run
     */
    private function fireDailyBell(Contract $contract, int $days, Collection $recipients): bool
    {
        $today = now()->toDateString();

        $alreadyBelledToday = ContractBellLog::where('contract_id', $contract->id)
            ->whereDate('bell_date', $today)
            ->exists();

        if ($alreadyBelledToday) {
            return false;
        }

        // Overwrite rather than stack: drop each recipient's existing bell for
        // this contract first, so today's resend leaves a single, freshly-unread
        // alert. It therefore re-surfaces even if the user had already marked it
        // read — and keeps doing so daily until the contract is renewed (which
        // clears the ledgers via resetForContract) or cancelled (filtered out of
        // the run entirely).
        $this->clearBellNotifications($contract, $recipients);

        Notification::send($recipients, new ContractExpiryNotification($contract, $days));
        ContractBellLog::create(['contract_id' => $contract->id, 'bell_date' => $today]);

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

        if ($days <= 0) {
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
        ]);

        // Record every newly-crossed threshold (including larger ones we skipped
        // by mailing at the most urgent) so they never fire as stale mails later.
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
            if (! $recipient->email) {
                continue;
            }

            $this->email->sendTemplate($template, $recipient->email, array_merge([
                'user.first_name' => explode(' ', (string) $recipient->name)[0] ?? 'there',
                'contract.vendor' => $contract->vendor,
                'contract.name' => $contract->name,
                'contract.code' => $contract->code,
                'contract.end_date' => $contract->end_date->toDateString(),
            ], $extraVars));
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
