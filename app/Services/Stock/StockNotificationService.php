<?php

namespace App\Services\Stock;

use App\Enums\Stock\StockCountStatus;
use App\Models\Stock\StockAlertLog;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\User;
use App\Notifications\StockAlertNotification;
use App\Notifications\StockCountDraftNotification;
use App\Notifications\StockRequestNotification;
use App\Services\Email\EmailNotificationService;
use App\Support\DateDisplay;
use App\Support\EmailTable;
use Illuminate\Notifications\Notification as NotificationInstance;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;

/** Central send path for Stock bells (cleared and resent so they resurface unread) and templated emails. */
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

    /** Bell + email module holders for an alerting item (once a day per type); clear its ledger once normal. */
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
        $this->emailEach($recipients, $templateKey, $this->itemVars($item) + [
            'stock.qty' => number_format((float) $item->current_stock),
        ], $this->stockUrl('items'), 'View stock items');

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
        return User::holdingPermission($permission)->orderBy('id')->get();
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
     * Queue a templated email to each recipient; EmailNotificationService logs the ones it cannot reach.
     *
     * @param  Collection<int, User>  $recipients
     * @param  array<string, mixed>  $vars
     */
    private function emailEach(Collection $recipients, string $templateKey, array $vars, ?string $actionUrl = null, ?string $actionLabel = null): void
    {
        foreach ($recipients as $recipient) {
            $this->email->sendTemplate($templateKey, $recipient->email, $vars + [
                'user.first_name' => e(explode(' ', (string) $recipient->name)[0] ?: 'there'),
            ], $actionUrl, $actionLabel, $recipient->name);
        }
    }

    /** Absolute SPA deep link to a Stock tab. The SPA gates it behind login. */
    private function stockUrl(string $tab): string
    {
        return rtrim((string) config('app.url'), '/')."/stock?tab={$tab}";
    }

    /** Bell + email the approvers that a new request was submitted (one-shot). */
    public function requestCreated(StockRequest $request): void
    {
        $recipients = $this->recipients('stock.approve');
        if ($recipients->isNotEmpty()) {
            Notification::send($recipients, new StockRequestNotification($request, 'created'));
        }
        $this->emailEach($recipients, 'stock.request_created', $this->requestVars($request), $this->stockUrl('requests'), 'Review requests');
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

        $this->email->sendTemplate("stock.request_{$outcome}", $owner->email, $this->requestVars($request) + [
            'user.first_name' => e(explode(' ', (string) $owner->name)[0] ?: 'there'),
        ], $this->stockUrl('requests'), 'View my request', $owner->name);
    }

    /** Bell + email everyone who can issue stock that an approved request is ready, except the approver. */
    public function requestAwaitingFulfil(StockRequest $request, User $approver): void
    {
        $recipients = $this->recipients('stock.fulfill')
            ->reject(fn (User $user) => (int) $user->id === (int) $approver->id)
            ->values();

        if ($recipients->isNotEmpty()) {
            Notification::send($recipients, new StockRequestNotification($request, 'awaiting_fulfil'));
        }
        $this->emailEach($recipients, 'stock.request_awaiting_fulfil', $this->requestVars($request), $this->stockUrl('requests'));
    }

    /** Bell the request owner that someone else cancelled it (no email template for this one). */
    public function requestCancelled(StockRequest $request): void
    {
        $owner = $request->user;
        if ($owner) {
            Notification::send($owner, new StockRequestNotification($request, 'cancelled'));
        }
    }

    /**
     * Shared template variables for a request.
     *
     * @return array<string, mixed>
     */
    private function requestVars(StockRequest $request): array
    {
        return $this->itemVars($request->item) + [
            // Quantity requested here, not on hand as in the alerts
            'stock.qty' => number_format((float) $request->qty),
            'stock.request_no' => e((string) $request->reference),
            'stock.request_by' => e((string) ($request->requester_name ?: '-')),
            // Typed by hand: escaped, line breaks kept
            'stock.request_reason' => filled($request->reason) ? nl2br(e((string) $request->reason)) : '-',
            'stock.request_date' => DateDisplay::emailDate($request->created_at),
            // Whoever decided; each template's label says approved or rejected
            'stock.approver' => e((string) ($request->approver_name ?: '-')),
            'stock.fulfilled_by' => e((string) ($request->fulfilled_by ?: '-')),
            'stock.fulfilled_date' => DateDisplay::emailDate($request->fulfilled_at),
        ];
    }

    /**
     * The item's own figures; dashes only when a request's item has been deleted.
     *
     * @return array<string, string>
     */
    private function itemVars(?StockItem $item): array
    {
        if ($item === null) {
            return ['stock.sku' => '-', 'stock.name' => '-', 'stock.min' => '-', 'stock.max' => '-'];
        }

        return [
            'stock.sku' => e((string) $item->sku),
            'stock.name' => e((string) $item->name),
            'stock.min' => number_format((float) $item->min_stock),
            'stock.max' => number_format((float) $item->max_stock),
        ];
    }

    /**
     * Daily sweep, bells only: alerting items, open requests and draft counts.
     *
     * @param  bool  $force  Clear the per-day alert dedup ledger first (testing)
     * @return array{alerts:int, waiting:int, drafts:int}
     */
    public function run(bool $force = false): array
    {
        if ($force) {
            StockAlertLog::query()->delete();
        }

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

        // Waiting — refresh each request's bell.
        $waiting = StockRequest::whereNotIn('status', ['fulfilled', 'rejected', 'cancelled'])->with('item')->get();
        $waiting->each(fn (StockRequest $r) => $this->requestWaiting($r));

        // Counting — bell-only reminder per draft session.
        $drafts = StockCount::where('status', StockCountStatus::Draft)->get();
        $drafts->each(fn (StockCount $c) => $this->countDraft($c));

        return ['alerts' => $alertItems->count(), 'waiting' => $waiting->count(), 'drafts' => $drafts->count()];
    }

    /**
     * Monday mail: alerting items to module holders, open requests to whoever can move them on.
     *
     * @return array{alerts: int, waiting: int}
     */
    public function weeklyDigest(): array
    {
        $alertItems = collect();
        StockItem::query()->each(function (StockItem $item) use ($alertItems) {
            $type = $this->alertType($item);
            if ($type !== null) {
                $alertItems->push(['item' => $item, 'type' => $type]);
            }
        });

        if ($alertItems->isNotEmpty()) {
            $this->emailEach($this->recipients('stock.module'), 'stock.alert_digest', [
                'count' => number_format($alertItems->count()),
                'stock.summary_table' => $this->buildAlertSummary($alertItems),
                'stock.items_table' => $this->buildAlertRows($alertItems),
            ], $this->stockUrl('items'), 'View stock items');
        }

        $waiting = StockRequest::whereNotIn('status', ['fulfilled', 'rejected', 'cancelled'])->with('item')->get();
        if ($waiting->isNotEmpty()) {
            $this->emailRequestDigest($waiting);
        }

        return ['alerts' => $alertItems->count(), 'waiting' => $waiting->count()];
    }

    /**
     * One mail per person: approvers get pending requests, issuers approved ones, a holder of both one mail with both.
     *
     * @param  Collection<int, StockRequest>  $waiting
     */
    private function emailRequestDigest(Collection $waiting): void
    {
        $approverIds = $this->recipients('stock.approve')->pluck('id')->all();
        $issuerIds = $this->recipients('stock.fulfill')->pluck('id')->all();
        $people = User::whereIn('id', array_unique([...$approverIds, ...$issuerIds]))->orderBy('id')->get();

        foreach ($people as $person) {
            $stages = array_keys(array_filter([
                'pending' => in_array($person->id, $approverIds, true),
                'approved' => in_array($person->id, $issuerIds, true),
            ]));
            $theirs = $waiting->whereIn('status', $stages)->values();
            if ($theirs->isEmpty()) {
                continue;
            }

            $this->emailEach(collect([$person]), 'stock.request_approval_needed', [
                'count' => number_format($theirs->count()),
                'stock.request_summary_table' => $this->buildRequestSummary($theirs, $stages),
                'stock.requests_table' => $this->buildRequestRows($theirs),
            ], $this->stockUrl('requests'), 'Review requests');
        }
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

    /** Alert state names in mail, worst first (the summary's order). */
    public const ALERT_LABELS = ['out' => 'Out of Stock', 'low' => 'Low Stock', 'over' => 'Overstock'];

    public const SUMMARY_HEADERS = ['Status', 'Number of Items'];

    public const SUMMARY_WIDTHS = ['70%', '30%'];

    public const ITEM_HEADERS = ['SKU', 'Item Name', 'Current Stock', 'Min. Stock', 'Max. Stock', 'Status'];

    public const ITEM_WIDTHS = ['15%', '30%', '14%', '13%', '13%', '15%'];

    /** The three columns holding a figure. */
    public const ITEM_NUMERIC = [2, 3, 4];

    /**
     * How many items sit in each alert state, all three listed even at zero.
     *
     * @param  Collection<int, array{item: StockItem, type: string}>  $rows
     */
    private function buildAlertSummary(Collection $rows): string
    {
        $counts = $rows->countBy(fn (array $row) => $row['type']);

        $table = collect(self::ALERT_LABELS)
            ->map(fn (string $label, string $type) => [$label, number_format((int) ($counts[$type] ?? 0))])
            ->values()->all();

        return EmailTable::render(self::SUMMARY_HEADERS, $table, [1], self::SUMMARY_WIDTHS);
    }

    /**
     * One row per item, thresholds beside the figure that crossed them.
     *
     * @param  Collection<int, array{item: StockItem, type: string}>  $rows
     */
    private function buildAlertRows(Collection $rows): string
    {
        $ordered = collect(array_keys(self::ALERT_LABELS))
            ->flatMap(fn (string $type) => $rows->where('type', $type)->values());

        $table = $ordered->map(function (array $row) {
            $item = $row['item'];

            return [
                // text() escapes hand-typed SKUs and names
                EmailTable::text((string) $item->sku, 20),
                EmailTable::text((string) $item->name, 40),
                number_format((int) $item->current_stock),
                number_format((int) $item->min_stock),
                number_format((int) $item->max_stock),
                EmailTable::text(self::ALERT_LABELS[$row['type']] ?? $row['type']),
            ];
        })->values()->all();

        return EmailTable::render(self::ITEM_HEADERS, $table, self::ITEM_NUMERIC, self::ITEM_WIDTHS, [1]);
    }

    /** Open request statuses in mail, named by what is still owed. */
    public const REQUEST_STATUS_LABELS = ['pending' => 'Pending Approval', 'approved' => 'Awaiting Fulfilment'];

    public const REQUEST_SUMMARY_HEADERS = ['Status', 'Number of Requests'];

    public const REQUEST_SUMMARY_WIDTHS = ['70%', '30%'];

    public const REQUEST_HEADERS = ['Request No.', 'Requester', 'Request Date', 'Items', 'Status'];

    public const REQUEST_WIDTHS = ['16%', '20%', '14%', '32%', '18%'];

    /**
     * How many open requests sit at each of the reader's stages, listed even at zero.
     *
     * @param  Collection<int, StockRequest>  $requests
     * @param  list<string>  $stages
     */
    private function buildRequestSummary(Collection $requests, array $stages): string
    {
        $counts = $requests->countBy(fn (StockRequest $request) => (string) $request->status);

        $rows = collect(self::REQUEST_STATUS_LABELS)
            ->only($stages)
            ->map(fn (string $label, string $status) => [$label, number_format((int) ($counts[$status] ?? 0))])
            ->values()->all();

        return EmailTable::render(self::REQUEST_SUMMARY_HEADERS, $rows, [1], self::REQUEST_SUMMARY_WIDTHS);
    }

    /**
     * One row per open request, oldest first.
     *
     * @param  Collection<int, StockRequest>  $requests
     */
    private function buildRequestRows(Collection $requests): string
    {
        $rows = $requests->sortBy('created_at')->map(function (StockRequest $request) {
            $item = $request->item;

            return [
                EmailTable::text((string) $request->reference, 20),
                EmailTable::text((string) ($request->requester_name ?: '-'), 26),
                DateDisplay::emailDate($request->created_at),
                // Escaped item name with its quantity
                EmailTable::text(($item?->name ?? '-').' ×'.number_format((int) $request->qty), 44),
                EmailTable::text(self::REQUEST_STATUS_LABELS[$request->status] ?? (string) $request->status),
            ];
        })->values()->all();

        return EmailTable::render(self::REQUEST_HEADERS, $rows, [], self::REQUEST_WIDTHS, [3]);
    }

    /** Daily bell-only nag (overwritten): pending reminds approvers, approved reminds issuers. */
    public function requestWaiting(StockRequest $request): void
    {
        $permission = $request->status === 'approved' ? 'stock.fulfill' : 'stock.approve';

        $this->sendBell(
            $this->recipients($permission),
            new StockRequestNotification($request, 'waiting'),
            StockRequestNotification::class,
            ['stock_request_id' => $request->id, 'subtype' => 'waiting'],
        );
    }

    /** Daily bell-only reminder (overwritten) to view_count holders while a count is draft. */
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
