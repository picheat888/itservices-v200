<?php

namespace App\Notifications;

use App\Models\Stock\StockCount;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/** In-app bell reminder that a stock count session is still in draft. */
class StockCountDraftNotification extends Notification
{
    use ConfigurableNotification;

    public function __construct(private readonly StockCount $count) {}

    protected function notificationKey(): string
    {
        return 'notif_stock_count_draft';
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'stock_count',
            'subtype' => 'draft',
            'stock_count_id' => $this->count->id,
            'reference' => $this->count->reference,
        ];
    }
}
