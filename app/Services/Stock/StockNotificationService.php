<?php

namespace App\Services\Stock;

use App\Models\Stock\StockAlertLog;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\User;
use App\Notifications\StockAlertNotification;
use App\Notifications\StockCountDraftNotification;
use App\Notifications\StockRequestNotification;
use App\Services\Email\EmailNotificationService;
use App\Support\EmailTable;
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
        $this->emailEach($recipients, $templateKey, $this->itemVars($item) + [
            'stock.qty' => (string) $item->current_stock,
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
     * Queue a templated email to each recipient. Whether an address exists is decided by
     * EmailNotificationService, which logs the ones it cannot reach.
     *
     * @param  Collection<int, User>  $recipients
     * @param  array<string, mixed>  $vars
     */
    private function emailEach(Collection $recipients, string $templateKey, array $vars, ?string $actionUrl = null, ?string $actionLabel = null): void
    {
        foreach ($recipients as $recipient) {
            $this->email->sendTemplate($templateKey, $recipient->email, $vars + [
                'user.first_name' => explode(' ', (string) $recipient->name)[0] ?: 'there',
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
            'user.first_name' => explode(' ', (string) $owner->name)[0] ?: 'there',
        ], $this->stockUrl('requests'), 'View my request', $owner->name);
    }

    /**
     * Shared template variables for a request.
     *
     * @return array<string, mixed>
     */
    private function requestVars(StockRequest $request): array
    {
        return $this->itemVars($request->item) + [
            // NOTE: on this path stock.qty is the quantity REQUESTED, not what is on the
            // shelf — the same variable name carries a different figure than it does in the
            // alerts above. Worth knowing before writing {{stock.qty}} into a request mail
            // next to {{stock.min}}, where it reads as a comparison and is not one.
            'stock.qty' => (string) $request->qty,
            'stock.request_no' => (string) $request->reference,
            'stock.request_by' => (string) ($request->requester_name ?: '-'),
            // Free text the requester typed, landing in an HTML email: escaped, and its line
            // breaks turned into <br> so a reason written over two lines is not one sentence.
            'stock.request_reason' => filled($request->reason) ? nl2br(e((string) $request->reason)) : '-',
            'stock.request_date' => $request->created_at?->format('d-m-Y') ?? '-',
            // One name for both outcomes: the column records whoever DECIDED, and the label
            // in each template ("Approved By" / "Rejected By") says which it was.
            'stock.approver' => (string) ($request->approver_name ?: '-'),
            // Not the same person: approving is a decision, fulfilling is handing the stock
            // over. Null on anything fulfilled before the column existed.
            'stock.fulfilled_by' => (string) ($request->fulfilled_by ?: '-'),
            'stock.fulfilled_date' => $request->fulfilled_at?->format('d-m-Y') ?? '-',
        ];
    }

    /**
     * The figures that describe a stock item itself, rather than whatever is happening to it.
     *
     * min and max are the thresholds the alerts fire on, so a "below minimum" mail can say
     * what the minimum actually is instead of leaving the reader to go and look it up.
     *
     * Both columns are NOT NULL and default to 0, so a zero here is a real setting ("no
     * minimum") and prints as 0 rather than as a dash. The dashes below are for the one case
     * that can produce nothing at all: a request whose item has since been deleted.
     *
     * @return array<string, string>
     */
    private function itemVars(?StockItem $item): array
    {
        if ($item === null) {
            return ['stock.sku' => '-', 'stock.name' => '-', 'stock.min' => '-', 'stock.max' => '-'];
        }

        return [
            'stock.sku' => (string) $item->sku,
            'stock.name' => (string) $item->name,
            'stock.min' => (string) $item->min_stock,
            'stock.max' => (string) $item->max_stock,
        ];
    }

    /**
     * Daily sweep. Bells stay per-item (overwritten so they re-surface unread), but
     * the email channel is a single DIGEST per recipient: one summary of all alerting
     * items to stock.module holders, one summary of all open requests to approvers.
     * Counting stays a bell-only nudge. Real-time per-item alert emails are unaffected.
     *
     * @param  bool  $force  Clear the per-day alert dedup ledger first, so every
     *                       alerting item is treated as fresh again (testing). Bells
     *                       and the digest already refresh on every run regardless.
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
        $drafts = StockCount::where('status', 'draft')->get();
        $drafts->each(fn (StockCount $c) => $this->countDraft($c));

        return ['alerts' => $alertItems->count(), 'waiting' => $waiting->count(), 'drafts' => $drafts->count()];
    }

    /**
     * The Monday summary: everything currently out, low or overstocked, and every request
     * still waiting on somebody.
     *
     * Weekly rather than daily, and by mail only. An item that drops below its minimum
     * already sends its own alert the moment it happens (stock.low_alert and its two
     * siblings), so a daily list of the same things is the same news a second time — and a
     * list that arrives every morning is one people learn to filter. The same reason the
     * approvals and cases digests are weekly.
     *
     * The per-item BELLS stay daily: the tray is a place you look, not something that
     * arrives, so repeating there costs nobody an interruption.
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
                'count' => (string) $alertItems->count(),
                'stock.summary_table' => $this->buildAlertSummary($alertItems),
                'stock.items_table' => $this->buildAlertRows($alertItems),
            ], $this->stockUrl('items'), 'View stock items');
        }

        $waiting = StockRequest::whereNotIn('status', ['fulfilled', 'rejected', 'cancelled'])->with('item')->get();
        if ($waiting->isNotEmpty()) {
            // Only whoever can approve — the rest of the module cannot clear this list.
            $this->emailEach($this->recipients('stock.approve'), 'stock.request_approval_needed', [
                'count' => (string) $waiting->count(),
                'stock.request_summary_table' => $this->buildRequestSummary($waiting),
                'stock.requests_table' => $this->buildRequestRows($waiting),
            ], $this->stockUrl('requests'), 'Review requests');
        }

        return ['alerts' => $alertItems->count(), 'waiting' => $waiting->count()];
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
    /**
     * What each alert state is called in a message to a person. Ordered worst first, which is
     * also the order the summary reads in.
     */
    public const ALERT_LABELS = ['out' => 'Out of Stock', 'low' => 'Low Stock', 'over' => 'Overstock'];

    public const SUMMARY_HEADERS = ['Status', 'Number of Items'];

    public const SUMMARY_WIDTHS = ['70%', '30%'];

    public const ITEM_HEADERS = ['SKU', 'Item Name', 'Current Stock', 'Min. Stock', 'Max. Stock', 'Status'];

    public const ITEM_WIDTHS = ['15%', '30%', '14%', '13%', '13%', '15%'];

    /** The three columns holding a figure. */
    public const ITEM_NUMERIC = [2, 3, 4];

    /**
     * How many items sit in each alert state.
     *
     * All three states are listed even when a count is zero: the shape stays the same from
     * one week to the next, so "nothing is out of stock" is something the reader can see at a
     * glance rather than infer from a missing row.
     *
     * @param  Collection<int, array{item: StockItem, type: string}>  $rows
     */
    private function buildAlertSummary(Collection $rows): string
    {
        $counts = $rows->countBy(fn (array $row) => $row['type']);

        $table = collect(self::ALERT_LABELS)
            ->map(fn (string $label, string $type) => [$label, (string) ($counts[$type] ?? 0)])
            ->values()->all();

        return EmailTable::render(self::SUMMARY_HEADERS, $table, [1], self::SUMMARY_WIDTHS);
    }

    /**
     * One row per item, with the thresholds beside the figure that crossed them — a reader
     * deciding what to order needs to see how far off it is, not only that it is off.
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
                // text() escapes: SKUs and item names are typed by hand.
                EmailTable::text((string) $item->sku, 20),
                EmailTable::text((string) $item->name, 40),
                (string) (int) $item->current_stock,
                (string) (int) $item->min_stock,
                (string) (int) $item->max_stock,
                EmailTable::text(self::ALERT_LABELS[$row['type']] ?? $row['type']),
            ];
        })->values()->all();

        return EmailTable::render(self::ITEM_HEADERS, $table, self::ITEM_NUMERIC, self::ITEM_WIDTHS, [1]);
    }

    /**
     * Build the waiting digest's request list (HTML).
     *
     * @param  Collection<int, StockRequest>  $requests
     */
    /**
     * What an OPEN request's status is called in a message to a person.
     *
     * "Approved" on its own reads like the request is finished, in a report whose whole point
     * is what is still outstanding — so it says what is still owed instead. The statuses that
     * close a request (fulfilled, rejected, cancelled) never appear here: the digest does not
     * list them, and the template says so.
     */
    public const REQUEST_STATUS_LABELS = ['pending' => 'Pending Approval', 'approved' => 'Awaiting Fulfilment'];

    public const REQUEST_SUMMARY_HEADERS = ['Status', 'Number of Requests'];

    public const REQUEST_SUMMARY_WIDTHS = ['70%', '30%'];

    public const REQUEST_HEADERS = ['Request No.', 'Requester', 'Request Date', 'Items', 'Status'];

    public const REQUEST_WIDTHS = ['16%', '20%', '14%', '32%', '18%'];

    /**
     * How many open requests sit at each stage — both listed even at zero, so the shape stays
     * the same week to week and an empty stage is something the reader sees rather than infers.
     *
     * @param  Collection<int, StockRequest>  $requests
     */
    private function buildRequestSummary(Collection $requests): string
    {
        $counts = $requests->countBy(fn (StockRequest $request) => (string) $request->status);

        $rows = collect(self::REQUEST_STATUS_LABELS)
            ->map(fn (string $label, string $status) => [$label, (string) ($counts[$status] ?? 0)])
            ->values()->all();

        return EmailTable::render(self::REQUEST_SUMMARY_HEADERS, $rows, [1], self::REQUEST_SUMMARY_WIDTHS);
    }

    /**
     * One row per open request, oldest first — the one that has been waiting longest is the
     * one the reader most needs to see.
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
                $request->created_at?->format('d-m-Y') ?? '-',
                // Escaped: the item name is typed by hand. The quantity rides with it because
                // a request for one and a request for fifty are not the same decision.
                EmailTable::text(($item?->name ?? '-').' ×'.(int) $request->qty, 44),
                EmailTable::text(self::REQUEST_STATUS_LABELS[$request->status] ?? (string) $request->status),
            ];
        })->values()->all();

        return EmailTable::render(self::REQUEST_HEADERS, $rows, [], self::REQUEST_WIDTHS, [3]);
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
