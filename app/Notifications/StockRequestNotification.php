<?php

namespace App\Notifications;

use App\Models\Stock\StockRequest;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/** In-app bell alert for a stock request lifecycle event. */
class StockRequestNotification extends Notification
{
    use ConfigurableNotification;

    public function __construct(
        private readonly StockRequest $request,
        private readonly string $subtype, // created | waiting | approved | rejected | fulfilled
    ) {}

    protected function notificationKey(): string
    {
        return 'notif_stock_req_'.$this->subtype;
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'stock_request',
            'subtype' => $this->subtype,
            'stock_request_id' => $this->request->id,
            'reference' => $this->request->reference,
            'sku' => $this->request->item?->sku,
            'name' => $this->request->item?->name,
            'qty' => $this->request->qty,
        ];
    }
}
