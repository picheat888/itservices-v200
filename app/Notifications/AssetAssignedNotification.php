<?php

namespace App\Notifications;

use App\Models\Asset\Asset;
use Illuminate\Notifications\Notification;

/** In-app bell alert sent to the employee an asset has just been handed over to. */
class AssetAssignedNotification extends Notification
{
    public function __construct(
        private readonly Asset $asset,
        private readonly ?string $from = null,
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
            'type' => 'asset_assigned',
            'asset_id' => $this->asset->id,
            'asset_tag' => $this->asset->tag,
            'asset_model' => $this->asset->model,
            'asset_nickname' => $this->asset->nickname,
            'from' => $this->from,
        ];
    }
}
