<?php

namespace App\Services;

use App\Models\StockAlertLog;
use App\Models\StockItem;
use App\Models\User;
use App\Notifications\StockAlertNotification;
use Illuminate\Notifications\Notification as NotificationInstance;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;

/**
 * Central send path for Stock bell + email notifications. Mirrors
 * ContractExpiryAlertService: bells are cleared-and-resent so they re-surface
 * unread, emails go through the templated EmailNotificationService.
 */
class StockNotificationService
{
    public function __construct(private readonly EmailNotificationService $email) {}

    /** Maps a stock status to its alert subtype, or null when normal (ok/dead). */
    private function alertType(StockItem $item): ?string
    {
        return match ($item->status()) {
            'out' => 'out',
            'low' => 'low',
            'over' => 'over',
            default => null,
        };
    }

    /**
     * Evaluate one item: bell + email module holders when it is in an alert state
     * (deduped to once per day per type), and clear its ledger once back to normal.
     */
    public function alert(StockItem $item): void
    {
        $type = $this->alertType($item);

        if ($type === null) {
            StockAlertLog::where('stock_item_id', $item->id)->delete();

            return;
        }

        $today = now()->toDateString();
        $log = StockAlertLog::firstOrNew(['stock_item_id' => $item->id, 'alert_type' => $type]);
        if ($log->exists && $log->last_alerted_on?->toDateString() === $today) {
            return;
        }

        // The item changed alert state (e.g. low → out): drop the stale other-type log.
        StockAlertLog::where('stock_item_id', $item->id)->where('alert_type', '!=', $type)->delete();

        $recipients = $this->recipients('stock.module');

        $this->sendBell(
            $recipients,
            new StockAlertNotification($item, $type),
            StockAlertNotification::class,
            ['stock_item_id' => $item->id],
        );

        $templateKey = match ($type) {
            'out' => 'stock.out_of_stock',
            'low' => 'stock.low_alert',
            'over' => 'stock.overstock_alert',
        };
        $this->emailEach($recipients, $templateKey, [
            'stock.sku' => $item->sku,
            'stock.name' => $item->name,
            'stock.qty' => $item->current_stock,
        ]);

        $log->last_alerted_on = $today;
        $log->save();
    }

    /**
     * Users whose role grants the given permission (super included).
     *
     * @return Collection<int, User>
     */
    private function recipients(string $permission): Collection
    {
        return User::all()->filter(fn (User $u) => $u->hasPermission($permission))->values();
    }

    /**
     * Clear each recipient's existing matching bell, then resend.
     *
     * @param  Collection<int, User>  $recipients
     * @param  array<string, mixed>  $dataMatch  data->key => value pairs identifying this subject
     */
    private function sendBell(Collection $recipients, NotificationInstance $notification, string $type, array $dataMatch): void
    {
        foreach ($recipients as $recipient) {
            $query = $recipient->notifications()->where('type', $type);
            foreach ($dataMatch as $key => $value) {
                $query->where("data->{$key}", $value);
            }
            $query->delete();
        }

        if ($recipients->isNotEmpty()) {
            Notification::send($recipients, $notification);
        }
    }

    /**
     * Queue a templated email to each recipient with an address.
     *
     * @param  Collection<int, User>  $recipients
     * @param  array<string, mixed>  $vars
     */
    private function emailEach(Collection $recipients, string $templateKey, array $vars): void
    {
        foreach ($recipients as $recipient) {
            if (! $recipient->email) {
                continue;
            }
            $this->email->sendTemplate($templateKey, $recipient->email, $vars + [
                'user.first_name' => explode(' ', (string) $recipient->name)[0] ?: 'there',
            ]);
        }
    }
}
