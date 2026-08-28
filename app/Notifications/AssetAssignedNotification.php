<?php

namespace App\Notifications;

use App\Models\Asset\Asset;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/** In-app bell alert sent to the employee an asset has just been handed over to. */
class AssetAssignedNotification extends Notification
{
    use ConfigurableNotification;

    public function __construct(
        private readonly Asset $asset,
        private readonly ?string $from = null,
    ) {}

    protected function notificationKey(): string
    {
        return 'notif_asset_assigned';
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'asset_assigned',
            'asset_id' => $this->asset->id,
            'asset_tag' => $this->asset->asset_code,
            'asset_model' => $this->asset->model?->name,
            'asset_nickname' => $this->asset->tag,
            'from' => $this->from,
        ];
    }
}
