<?php

namespace App\Notifications;

use App\Models\StockCount;
use Illuminate\Notifications\Notification;

/** In-app bell reminder that a stock count session is still in draft. */
class StockCountDraftNotification extends Notification
{
    public function __construct(private readonly StockCount $count) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
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
