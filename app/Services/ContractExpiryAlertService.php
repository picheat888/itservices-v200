<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\ContractAlertLog;
use App\Models\User;
use App\Notifications\ContractExpiryNotification;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;

/**
 * Decides which contracts have crossed a not-yet-alerted reminder threshold and
 * dispatches the bell + email alert to users holding contracts.alerts. Each
 * threshold fires once per contract cycle, tracked in contract_alert_logs.
 */
class ContractExpiryAlertService
{
    public function __construct(private readonly EmailNotificationService $email) {}

    /**
     * Evaluate all active contracts and send any due alerts.
     *
     * @return int number of contracts alerted on this run
     */
    public function run(): int
    {
        $recipients = User::all()->filter(
            fn (User $u) => $u->hasPermission('contracts.alerts')
        );

        $contracts = Contract::whereNull('cancelled_at')
            ->whereDate('end_date', '>', now())
            ->get()
            ->filter(fn (Contract $c) => $c->enabledReminderDays() !== []);

        $sent = 0;

        foreach ($contracts as $contract) {
            $days = $contract->daysRemaining();

            $crossed = array_filter($contract->enabledReminderDays(), fn (int $d) => $days <= $d);
            if ($crossed === []) {
                continue;
            }

            $alreadyAlerted = ContractAlertLog::where('contract_id', $contract->id)
                ->pluck('threshold')->all();
            $newCrossed = array_values(array_diff($crossed, $alreadyAlerted));
            if ($newCrossed === []) {
                continue;
            }

            if ($recipients->isNotEmpty()) {
                $this->dispatchAlert($contract, $days, $recipients);
                $sent++;
            }

            // Record every newly-crossed threshold (including larger ones we skipped
            // by alerting at the most urgent) so they never fire as stale alerts later.
            foreach ($newCrossed as $threshold) {
                ContractAlertLog::create([
                    'contract_id' => $contract->id,
                    'threshold' => $threshold,
                    'alerted_at' => now(),
                ]);
            }
        }

        return $sent;
    }

    /** Clears a contract's alert ledger so a renewed term alerts afresh. */
    public function resetForContract(Contract $contract): void
    {
        ContractAlertLog::where('contract_id', $contract->id)->delete();
    }

    /**
     * Sends the bell notification to all recipients and a queued email to each
     * recipient that has an email address.
     *
     * @param  Collection<int, User>  $recipients
     */
    private function dispatchAlert(Contract $contract, int $days, Collection $recipients): void
    {
        Notification::send($recipients, new ContractExpiryNotification($contract, $days));

        foreach ($recipients as $recipient) {
            if (! $recipient->email) {
                continue;
            }
            $this->email->sendTemplate('contract.expiry_alert', $recipient->email, [
                'user.first_name' => explode(' ', (string) $recipient->name)[0] ?? 'there',
                'contract.vendor' => $contract->vendor,
                'contract.name' => $contract->name,
                'contract.code' => $contract->code,
                'contract.days_remaining' => $days,
                'contract.end_date' => $contract->end_date->toDateString(),
            ]);
        }
    }
}
