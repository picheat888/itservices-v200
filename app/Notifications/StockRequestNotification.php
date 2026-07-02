<?php

namespace App\Notifications;

use App\Models\Stock\StockRequest;
use Illuminate\Notifications\Notification;

/** In-app bell alert for a stock request lifecycle event. */
class StockRequestNotification extends Notification
{
    public function __construct(
        private readonly StockRequest $request,
        private readonly string $subtype, // created | waiting | approved | rejected | fulfilled
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
