<?php

namespace App\Services\Contract;

use App\Models\Contract\Contract;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Email\EmailNotificationService;
use App\Support\EmailTable;
use Illuminate\Support\Collection;

/**
 * The Monday summary of contracts that need a decision, mailed to whoever has contract
 * alerts switched on.
 *
 * The daily sweep (ContractExpiryAlertService) mails one contract at a time, and only on the
 * day it crosses a threshold — which answers "what changed today" but never "what is on my
 * plate". This is the other question: everything currently expiring or already past its end
 * date, in one list, once a week.
 *
 * Two tables because they need different things done to them: a contract still inside its
 * reminder window can still be renewed on time, while an overdue one is already late and is
 * either renewed or closed out. Both tables carry the same columns so they line up under
 * each other.
 *
 * Reads only. The daily channel's ledgers (contract_alert_logs, contract_bell_logs) decide
 * what has already been said once, and a summary of what those ledgers already covered must
 * not mark anything as said.
 */
class ContractDigestService
{
    /**
     * The shape of both tables — shared so the two sections line up, and so the preview on
     * the Email screen is laid out by the same numbers as the mail itself.
     */
    public const HEADERS = ['Contract No.', 'Vendor / Supplier', 'Contract Name', 'Total value', 'End Date', 'Notification schedule'];

    public const WIDTHS = ['14%', '18%', '21%', '14%', '13%', '20%'];

    /** Index of the only column holding a figure. */
    public const NUMERIC = [3];

    public function __construct(private readonly EmailNotificationService $email) {}

    /**
     * @return array{recipients: int, expiring: int, overdue: int}
     */
    public function send(): array
    {
        $due = Contract::query()
            ->with('vendor')
            ->whereNull('cancelled_at')
            ->whereNull('expired_at')
            ->orderBy('end_date')
            ->get()
            // Same opt-out the daily sweep honours: a contract with every reminder switched
            // off has been told not to chase anyone, and a weekly summary that listed it
            // anyway would be a way round that setting.
            ->filter(fn (Contract $c) => $c->enabledReminderDays() !== []);

        $expiring = $due->filter(fn (Contract $c) => $c->isInReminder())->values();
        $overdue = $due->filter(fn (Contract $c) => $c->daysRemaining() <= 0)->values();

        if ($expiring->isEmpty() && $overdue->isEmpty()) {
            return ['recipients' => 0, 'expiring' => 0, 'overdue' => 0];
        }

        $recipients = User::all()->filter(fn (User $u) => $u->hasPermission('contracts.alerts'));

        foreach ($recipients as $recipient) {
            $this->email->sendTemplate('contract.weekly_digest', $recipient->email, [
                'user.first_name' => strtok((string) $recipient->name, ' '),
                'digest.expiring_count' => (string) $expiring->count(),
                'digest.expiring_table' => $this->table($expiring),
                'digest.overdue_count' => (string) $overdue->count(),
                'digest.overdue_table' => $this->table($overdue),
            ], rtrim((string) config('app.url'), '/').'/contracts', 'Open the contract list', $recipient->name);
        }

        return [
            'recipients' => $recipients->count(),
            'expiring' => $expiring->count(),
            'overdue' => $overdue->count(),
        ];
    }

    /**
     * One section's table, or a line saying there is nothing in it.
     *
     * An empty table renders as a bare row of headings, which reads as something that failed
     * to load rather than as good news. The heading above it still carries the count.
     *
     * @param  Collection<int, Contract>  $contracts
     */
    private function table(Collection $contracts): string
    {
        if ($contracts->isEmpty()) {
            return '<p style="color:#64748b;font-size:14px;margin:12px 0;">Nothing in this list.</p>';
        }

        $symbol = AppSetting::currencySymbol();

        $rows = $contracts->map(fn (Contract $c) => [
            EmailTable::link($this->contractUrl($c), (string) $c->code),
            EmailTable::text((string) ($c->vendor?->name ?? '-'), 28),
            EmailTable::text((string) $c->name, 34),
            $c->total_value !== null ? e($symbol.number_format((float) $c->total_value, 2)) : '-',
            $c->end_date->format('d-m-Y'),
            $this->schedule($c),
        ])->all();

        return EmailTable::render(self::HEADERS, $rows, self::NUMERIC, self::WIDTHS);
    }

    /**
     * The reminder thresholds this contract is set to alert on, as the days-before figures
     * the contract form itself shows — so a reader who thinks a contract is chasing them too
     * often (or not at all) can see the setting without opening it.
     */
    private function schedule(Contract $contract): string
    {
        return e(implode(', ', $contract->enabledReminderDays()).' days');
    }

    /** Where a row goes when clicked: the contract list with that contract open. */
    private function contractUrl(Contract $contract): string
    {
        return rtrim((string) config('app.url'), '/')."/contracts?view={$contract->id}";
    }
}
