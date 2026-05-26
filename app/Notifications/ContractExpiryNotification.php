<?php

namespace App\Notifications;

use App\Models\Contract;
use Illuminate\Notifications\Notification;

/**
 * In-app (database) bell alert that a contract is approaching expiry. Sent to
 * every user whose role holds the contracts.alerts permission. The payload
 * shape mirrors the employee notifications so the bell can render it.
 */
class ContractExpiryNotification extends Notification
{
    public function __construct(
        private readonly Contract $contract,
        private readonly int $daysRemaining,
    ) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'contract_expiring',
            'subtype' => 'expiry',
            'contract_id' => $this->contract->id,
            'contract_code' => $this->contract->code,
            'contract_vendor' => $this->contract->vendor,
            'contract_name' => $this->contract->name,
            'days_remaining' => $this->daysRemaining,
        ];
    }
}
