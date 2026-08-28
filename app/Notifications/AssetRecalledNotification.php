<?php

namespace App\Notifications;

use App\Models\Asset\Asset;
use Illuminate\Notifications\Notification;

/**
 * In-app bell alert to the employee an asset was pulled back FROM, so a holder never
 * loses a device off their list silently.
 *
 * `subtype` separates the two things a recall means to the reader:
 *  - `cancelled`  — the hand-over was called off before they ever pressed Accept
 *  - `taken_back` — they were actually holding it and IT force-recalled it
 * Told apart by the status the asset had before the recall, because afterwards both
 * look the same (ready, owner cleared).
 */
class AssetRecalledNotification extends Notification
{
    public function __construct(
        private readonly Asset $asset,
        private readonly string $subtype,
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
            'type' => 'asset_recalled',
            'subtype' => $this->subtype,
            'asset_id' => $this->asset->id,
            'asset_tag' => $this->asset->asset_code,
            'asset_model' => $this->asset->model?->name,
            'asset_nickname' => $this->asset->tag,
        ];
    }
}
