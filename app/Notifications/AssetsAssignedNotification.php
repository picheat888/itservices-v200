<?php

namespace App\Notifications;

use App\Models\Asset\Asset;
use App\Notifications\Concerns\ConfigurableNotification;
use App\Support\NotificationCatalogue;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Collection;

/** One bell for a bulk hand-over: every asset put in the recipient's name at once. */
class AssetsAssignedNotification extends Notification
{
    use ConfigurableNotification { via as ownVia; }

    /** @param  Collection<int, Asset>  $assets */
    public function __construct(private readonly Collection $assets) {}

    protected function notificationKey(): string
    {
        return 'notif_asset_assigned_many';
    }

    /** @return list<string> The single hand-over bell switched off silences this one too. */
    public function via(object $notifiable): array
    {
        return NotificationCatalogue::enabled('notif_asset_assigned') ? $this->ownVia($notifiable) : [];
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'asset_assigned',
            'count' => $this->assets->count(),
            'asset_ids' => $this->assets->pluck('id')->values()->all(),
            'asset_tags' => $this->assets->pluck('asset_code')->values()->all(),
        ];
    }
}
