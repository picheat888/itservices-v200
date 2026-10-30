<?php

namespace App\Notifications;

use App\Models\Asset\Asset;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Collection;

/** One bell for a bulk recall: every asset taken back from, or cancelled for, one person. */
class AssetsRecalledNotification extends Notification
{
    use ConfigurableNotification;

    /** @param  Collection<int, Asset>  $assets */
    public function __construct(
        private readonly Collection $assets,
        private readonly string $subtype,
    ) {}

    protected function notificationKey(): string
    {
        return 'notif_asset_recalled_many';
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'asset_recalled',
            'subtype' => $this->subtype,
            'count' => $this->assets->count(),
            'asset_ids' => $this->assets->pluck('id')->values()->all(),
            'asset_tags' => $this->assets->pluck('asset_code')->values()->all(),
        ];
    }
}
