<?php

namespace App\Services\Contract;

use App\Models\Contract\Contract;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Email\EmailNotificationService;
use App\Support\DateDisplay;
use App\Support\EmailTable;
use Illuminate\Support\Collection;

/**
 * Monday summary mail of contracts expiring or overdue, in two tables.
 * Read only: it never writes the daily alert ledgers.
 */
class ContractDigestService
{
    /** Table columns, shared with the preview on the Email page. */
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
            // Reminders all off = left out, as in the daily alerts
            ->filter(fn (Contract $c) => $c->enabledReminderDays() !== []);

        $expiring = $due->filter(fn (Contract $c) => $c->isInReminder())->values();
        $overdue = $due->filter(fn (Contract $c) => $c->isOverdue())->values();

        if ($expiring->isEmpty() && $overdue->isEmpty()) {
            return ['recipients' => 0, 'expiring' => 0, 'overdue' => 0];
        }

        $recipients = User::holdingPermission('contracts.alerts')->holdingPermission('contracts.view')->stillWorking()->orderBy('id')->get();

        foreach ($recipients as $recipient) {
            $this->email->sendTemplate('contract.weekly_digest', $recipient->email, [
                'user.first_name' => e(strtok((string) $recipient->name, ' ')),
                'digest.expiring_count' => number_format($expiring->count()),
                'digest.expiring_table' => $this->table($expiring),
                'digest.overdue_count' => number_format($overdue->count()),
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
     * One section's table, or a "nothing in this list" line when empty.
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
            DateDisplay::emailDate($c->end_date),
            $this->schedule($c),
        ])->all();

        return EmailTable::render(self::HEADERS, $rows, self::NUMERIC, self::WIDTHS);
    }

    /** The contract's switched-on reminder days, as the contract form shows them. */
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
