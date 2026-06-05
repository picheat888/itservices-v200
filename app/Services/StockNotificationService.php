<?php

namespace App\Services;

use App\Models\StockAlertLog;
use App\Models\StockCount;
use App\Models\StockItem;
use App\Models\StockRequest;
use App\Models\User;
use App\Notifications\StockAlertNotification;
use App\Notifications\StockCountDraftNotification;
use App\Notifications\StockRequestNotification;
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

    /** Bell + email the approvers that a new request was submitted (one-shot). */
    public function requestCreated(StockRequest $request): void
    {
        $recipients = $this->recipients('stock.approve');
        if ($recipients->isNotEmpty()) {
            Notification::send($recipients, new StockRequestNotification($request, 'created'));
        }
        $this->emailEach($recipients, 'stock.request_created', $this->requestVars($request));
    }

    /**
     * Bell + email the request owner with the outcome.
     *
     * @param  string  $outcome  approved | rejected | fulfilled
     */
    public function requestResponded(StockRequest $request, string $outcome): void
    {
        $owner = $request->user;
        if (! $owner) {
            return;
        }

        Notification::send($owner, new StockRequestNotification($request, $outcome));

        if ($owner->email) {
            $this->email->sendTemplate("stock.request_{$outcome}", $owner->email, $this->requestVars($request) + [
                'user.first_name' => explode(' ', (string) $owner->name)[0] ?: 'there',
            ]);
        }
    }

    /**
     * Shared template variables for a request.
     *
     * @return array<string, mixed>
     */
    private function requestVars(StockRequest $request): array
    {
        return [
            'stock.sku' => $request->item?->sku,
            'stock.name' => $request->item?->name,
            'stock.qty' => $request->qty,
        ];
    }

    /**
     * Daily sweep. Bells stay per-item (overwritten so they re-surface unread), but
     * the email channel is a single DIGEST per recipient: one summary of all alerting
     * items to stock.module holders, one summary of all open requests to approvers.
     * Counting stays a bell-only nudge. Real-time per-item alert emails are unaffected.
     *
     * @return array{alerts:int, waiting:int, drafts:int}
     */
    public function run(): array
    {
        // Alerts — refresh each alerting item's bell (no per-item email); clear normals.
        $alertItems = collect();
        StockItem::query()->each(function (StockItem $item) use ($alertItems) {
            $type = $this->alertType($item);
            if ($type === null) {
                StockAlertLog::where('stock_item_id', $item->id)->delete();

                return;
            }
            $this->alertBell($item, $type);
            $alertItems->push(['item' => $item, 'type' => $type]);
        });
        if ($alertItems->isNotEmpty()) {
            $this->emailEach($this->recipients('stock.module'), 'stock.alert_digest', [
                'count' => $alertItems->count(),
                'items' => $this->buildAlertRows($alertItems),
            ]);
        }

        // Waiting — refresh each request's bell (no per-item email), then one digest.
        $waiting = StockRequest::whereNotIn('status', ['fulfilled', 'rejected', 'cancelled'])->with('item')->get();
        $waiting->each(fn (StockRequest $r) => $this->requestWaiting($r));
        if ($waiting->isNotEmpty()) {
            $this->emailEach($this->recipients('stock.approve'), 'stock.request_approval_needed', [
                'count' => $waiting->count(),
                'items' => $this->buildRequestRows($waiting),
            ]);
        }

        // Counting — bell-only reminder per draft session.
        $drafts = StockCount::where('status', 'draft')->get();
        $drafts->each(fn (StockCount $c) => $this->countDraft($c));

        return ['alerts' => $alertItems->count(), 'waiting' => $waiting->count(), 'drafts' => $drafts->count()];
    }

    /** Bell-only alert refresh (no email) for the daily digest path. */
    private function alertBell(StockItem $item, string $type): void
    {
        $this->sendBell(
            $this->recipients('stock.module'),
            new StockAlertNotification($item, $type),
            StockAlertNotification::class,
            ['stock_item_id' => $item->id],
        );
    }

    /**
     * Build the alert digest's item list (HTML), grouped line-per-item.
     *
     * @param  Collection<int, array{item: StockItem, type: string}>  $rows
     */
    private function buildAlertRows(Collection $rows): string
    {
        $labels = ['out' => 'Out of stock', 'low' => 'Below minimum', 'over' => 'Overstock'];

        $items = $rows->map(function (array $row) use ($labels) {
            $item = $row['item'];
            $label = $labels[$row['type']] ?? $row['type'];

            return '<li><strong>'.e($item->sku).'</strong> — '.e($item->name)
                .' · '.$label.' (on hand: '.(int) $item->current_stock.')</li>';
        })->implode('');

        return '<ul>'.$items.'</ul>';
    }

    /**
     * Build the waiting digest's request list (HTML).
     *
     * @param  Collection<int, StockRequest>  $requests
     */
    private function buildRequestRows(Collection $requests): string
    {
        $items = $requests->map(function (StockRequest $r) {
            return '<li><strong>'.e($r->reference).'</strong> — '.e($r->item?->name ?? '')
                .' ×'.(int) $r->qty.' · '.e($r->status).' (by '.e($r->requester_name).')</li>';
        })->implode('');

        return '<ul>'.$items.'</ul>';
    }

    /**
     * Daily nag: bell-only (overwrite) to approvers while a request is unfulfilled.
     * The summary email is sent once per run by run() (digest), not here.
     */
    public function requestWaiting(StockRequest $request): void
    {
        $this->sendBell(
            $this->recipients('stock.approve'),
            new StockRequestNotification($request, 'waiting'),
            StockRequestNotification::class,
            ['stock_request_id' => $request->id, 'subtype' => 'waiting'],
        );
    }

    /**
     * Daily reminder: bell-only (overwrite) to view_count holders while a count is draft.
     * No email — purely an in-app nudge to submit the open count session.
     */
    public function countDraft(StockCount $count): void
    {
        $recipients = $this->recipients('stock.view_count');

        $this->sendBell(
            $recipients,
            new StockCountDraftNotification($count),
            StockCountDraftNotification::class,
            ['stock_count_id' => $count->id],
        );
    }
}
