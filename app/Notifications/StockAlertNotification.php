<?php

namespace App\Notifications;

use App\Models\Stock\StockItem;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/** In-app bell alert that a stock item entered an out/low/over state. */
class StockAlertNotification extends Notification
{
    use ConfigurableNotification;

    public function __construct(
        private readonly StockItem $item,
        private readonly string $subtype, // out | low | over
    ) {}

    protected function notificationKey(): string
    {
        return 'notif_stock_'.$this->subtype;
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'stock_alert',
            'subtype' => $this->subtype,
            'stock_item_id' => $this->item->id,
            'sku' => $this->item->sku,
            'name' => $this->item->name,
            'qty' => $this->item->current_stock,
        ];
    }
}
