# Stock Notifications — Bell + Email (Design)

**Date:** 2026-06-05
**Modules:** Notifications System (#8) × Email Notifications (#9) × Stock (#6)
**Status:** Approved design — ready for implementation plan

## Goal

Wire the eight Stock notification events to **both** channels that already exist in
the app: the in-app **bell** (Laravel database notifications, polled every 15s) and
**email** (`EmailNotificationService::sendTemplate` → queued `TemplatedMail`, SMTP from
`mail_settings`). Recipients are derived from the Stock Control permission keys. Scope
is the **Stock module only**; other modules' bell tabs stay "coming soon".

## Existing infrastructure reused

- **Bell:** `Notification::send($users, new XxxNotification)` with `via=['database']`
  and a `toDatabase()` payload. Frontend `notification-display.tsx` maps `data.type` →
  module/icon/title/message/target; `notifications-dropdown.tsx` has per-module tabs.
- **Email:** `App\Services\EmailNotificationService::sendTemplate($key, $email, $vars)`
  renders an enabled `email_templates` row and dispatches `SendTemplatedEmail`.
- **Pattern:** `App\Services\ContractExpiryAlertService` already drives a daily bell
  (clear + resend so it re-surfaces unread) plus a quieter email, deduped via ledger
  tables. We mirror this pattern for Stock.
- **Status:** `StockItem::status()` returns `out | low | over | dead | ok`. "Normal"
  for alert purposes = `ok` (and `dead`); the three alert states are `out`, `low`, `over`.

## Event matrix

| Event | Trigger | Recipients (permission) | Bell | Email | Template key | Repeat |
|---|---|---|---|---|---|---|
| Out of stock | real-time on stock change + daily scan | holders of `stock.module` | ✅ | ✅ | `stock.out_of_stock` | daily (overwrite read) until status `ok` |
| Below min (low) | real-time + daily scan | `stock.module` | ✅ | ✅ | `stock.low_alert` | daily until `ok` |
| Overstock | real-time + daily scan | `stock.module` | ✅ | ✅ | `stock.overstock_alert` | daily until `ok` |
| New Request | on request submit | `stock.approve` | ✅ | ✅ | `stock.request_created` | once per request |
| Waiting approve & fulfill | daily scan while request not yet `fulfilled` | `stock.approve` | ✅ | ✅ | `stock.request_approval_needed` | daily (overwrite) until `fulfilled` |
| Approved | on approve | the request's owner (`request.user_id`) | ✅ | ✅ | `stock.request_approved` | once |
| Rejected | on reject | request owner | ✅ | ✅ | `stock.request_rejected` | once |
| Fulfilled | on fulfill | request owner | ✅ | ✅ | `stock.request_fulfilled` | once |
| Counting (draft) | daily scan while a count session is `draft` | `stock.view_count` | ✅ | ❌ bell-only | — | daily (overwrite) until `committed` |

Recipient resolution mirrors `ContractExpiryAlertService`:
`User::all()->filter(fn ($u) => $u->hasPermission($key))`. Request responses target the
single owner (`$request->user` / `user_id`), who holds `stock.request` by definition.

Email cadence is **daily while the condition persists** (alerts until `ok`, waiting
until `fulfilled`) — per the product decision; accepted as potentially chatty.

## Architecture

### `App\Services\StockNotificationService`
Central send path. One public method per event, each firing the bell and (where
applicable) the email:

- `alert(StockItem $item)` — evaluate the item's status; if it is in an alert state
  (`out|low|over`) and not already logged, send the matching bell + email to
  `stock.module` holders and write the ledger row. Used by both the real-time hook and
  the daily scan (daily scan also re-fires by overwriting the bell + re-emailing).
- `requestCreated(StockRequest $r)` — bell + email to `stock.approve` holders.
- `requestWaiting(StockRequest $r)` — daily nag; bell (overwrite) + email to
  `stock.approve` holders. Fired by the scan for any request whose status is not
  `fulfilled` (and not `rejected`/`cancelled`).
- `requestResponded(StockRequest $r, string $outcome)` — `approved|rejected|fulfilled`;
  bell + email to the request owner using the matching template.
- `countDraft(StockCount $c)` — daily; bell-only (overwrite) to `stock.view_count` holders.

Email uses `EmailNotificationService::sendTemplate`. The "overwrite read" bell behaviour
reuses the contract approach: delete the recipient's existing bell for this subject, then
`Notification::send` again so it returns as unread.

### Bell notification classes (`database` channel)
- `App\Notifications\StockAlertNotification` — payload `{type:'stock_alert', subtype:'out|low|over', stock_item_id, sku, name, qty}`.
- `App\Notifications\StockRequestNotification` — payload `{type:'stock_request', subtype:'created|waiting|approved|rejected|fulfilled', stock_request_id, sku, name, qty}`.
- `App\Notifications\StockCountDraftNotification` — payload `{type:'stock_count', subtype:'draft', stock_count_id}`.

### Real-time hook
After any operation that changes on-hand for an item, call `StockNotificationService::alert($item)`:
- `StockMovementController@store` (after recording receive/issue/return/transfer),
- `StockRequestController@fulfill` (the issue reduces stock),
- `StockCountController@commit` (adjustments change stock).
The check is idempotent via the ledger, so firing from multiple paths is safe.

### Scheduled command
`php artisan stock:send-notifications` (new `App\Console\Commands\SendStockNotifications`),
scheduled **daily** in `routes/console.php`:
1. For every stock item in an alert state → `alert()` (re-fire/overwrite + re-email),
   and clear ledger rows for items back to `ok`.
2. For every non-`fulfilled` open request → `requestWaiting()`.
3. For every `draft` count session → `countDraft()`.
Accepts `--force` to bypass the once-per-day guard for testing (mirrors the contract command).

### Dedup ledger
New table `stock_alert_logs`: `id, stock_item_id, alert_type (out|low|over),
last_alerted_on (date), timestamps`, unique on `(stock_item_id, alert_type)`.
- Real-time `alert()` fires only when there is no active log for that (item, alert_type)
  OR the log's date is before today; it upserts `last_alerted_on = today`.
- Daily scan re-fires (date advances) and **deletes** logs whose item is now `ok`, so a
  later re-entry alerts afresh.

Request "waiting" and counting "draft" reminders need no separate ledger: the daily run
fires at most once per day, and the bell is overwritten (cleared + resent) each run so it
re-surfaces unread; emails likewise send once per daily run.

### Template change
Rename the existing `stock.request_approval_needed` template's display name from
"Stock request awaiting approval" to **"Stock - waiting approve & fulfill"** (name only;
key, subject, body untouched) via a small data migration.

## Frontend (bell)

- `resources/js/components/shell/notification-display.tsx`:
  - `moduleOf`: `stock_alert | stock_request | stock_count` → `stock` (already covered by
    the `startsWith('stock')` rule — confirm the prefixes match; rename payload types to
    start with `stock` so they route to the Stock tab).
  - `iconMeta`: alert (out=red, low=amber, over=blue), request (created/waiting=amber,
    approved/fulfilled=emerald, rejected=red), count draft=blue.
  - `notificationTitle` / `notificationMessage`: localized lines per subtype (SKU + name
    for alerts; request id + qty for requests; session for counting).
  - `notificationTarget`: alerts/counting → `/stock` (relevant tab via query, e.g.
    `?tab=items` / `?tab=audit`); requests → `/stock?tab=requests`.
- `resources/js/components/shell/notifications-dropdown.tsx`: flip the `stock` tab to
  `live: true`.
- `resources/js/lib/i18n.ts`: add the notif strings used above (en + th).

## Testing

- **Feature (service):** each event sends to exactly the right recipients and skips
  others; uses `Notification::fake()` for the bell and `Mail::fake()` / asserting
  `email_logs` for email. Cases: alert per status, request created/waiting/responses,
  counting draft (bell only, no email).
- **Dedup:** `alert()` does not re-fire same-day for an unchanged item; re-fires after
  the ledger date rolls; clears when item returns to `ok`.
- **Command:** `stock:send-notifications` re-fires persistent alerts/waiting/draft and
  honours `--force`.
- **Real-time:** issuing stock that crosses min fires a low/out alert once.
- **Recipients by permission:** a user with `stock.module` gets alerts; one without does
  not; request responses reach the owner only.

## Out of scope
- Other modules' bell tabs (tickets/requests/assets) stay coming-soon.
- Per-user notification preferences / opt-out (future).
- Real-time transport (WebSockets) — keep the existing 15s poll.

## Risks
- **Email volume:** daily alert + waiting emails can be chatty for long-standing
  conditions; accepted by product. Revisit with per-threshold or digest if needed.
- **Real-time firing inside request flows:** call `alert()` after the stock-mutating
  service returns (not mid-transaction) to avoid notifying on a rolled-back change.
- **Recipient scale:** `User::all()->filter(...)` matches the contract service; fine at
  current scale.
