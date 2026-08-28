<?php

namespace App\Notifications;

use App\Models\Contract\Contract;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/**
 * In-app (database) bell alert that a contract is approaching expiry — or has
 * already expired, in which case daysRemaining is zero or negative and the bell
 * renders an "expired N days ago" state. Sent to every user whose role holds the
 * contracts.alerts permission; the payload shape mirrors the employee
 * notifications so the bell can render it.
 */
class ContractExpiryNotification extends Notification
{
    use ConfigurableNotification;

    public function __construct(
        private readonly Contract $contract,
        private readonly int $daysRemaining,
    ) {}

    protected function notificationKey(): string
    {
        return $this->daysRemaining <= 0 ? 'notif_contract_expired' : 'notif_contract_expiring';
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'contract_expiring',
            'subtype' => 'expiry',
            'contract_id' => $this->contract->id,
            'contract_code' => $this->contract->code,
            'contract_vendor' => $this->contract->vendor?->name,
            'contract_name' => $this->contract->name,
            'days_remaining' => $this->daysRemaining,
        ];
    }
}
