<?php

namespace App\Services\Asset;

use App\Enums\Asset\AssetSource;
use App\Enums\Asset\AssetStatus;
use App\Enums\Asset\AssetTransferKind;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\Employee\Employee;
use App\Models\Settings\Location;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Notifications\AssetAssignedNotification;
use App\Notifications\AssetOffboardingNotification;
use App\Notifications\AssetRecalledNotification;
use App\Notifications\AssetReturnRequestedNotification;
use App\Services\Email\EmailNotificationService;
use App\Support\EmailTable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;

class AssetService
{
    public function __construct(private readonly EmailNotificationService $email) {}

    /**
     * The fields every asset mail names, so one machine reads the same in all four.
     * `reference.id` repeats the code: it is the generic placeholder the older templates
     * were written against, and an admin who kept it should not end up with a blank line.
     *
     * @return array<string, string>
     */
    private function assetVars(Asset $asset): array
    {
        return [
            'asset.code' => (string) $asset->asset_code,
            'asset.model' => (string) ($asset->model?->name ?? '-'),
            // Category from Master Data, stored mixed TH/EN like the rest of it.
            'asset.type' => (string) ($asset->category?->name ?: '-'),
            'asset.tag' => (string) ($asset->tag ?: '-'),
            'reference.id' => (string) $asset->asset_code,
        ];
    }

    /**
     * The leaver's devices as an email table — what to physically go and collect.
     *
     * Built here rather than written into the template because the rows are data, not
     * wording; an admin editing the mail moves {{asset.table}} around, the same way the
     * request and stock digests hand over {{digest.table}}. Rendered through EmailTable so
     * it survives the mail clients the digests already had to be fixed for.
     *
     * @param  Collection<int, Asset>  $assets
     */
    private function assetTable($assets): string
    {
        return EmailTable::render(
            ['Device', 'Type', 'Serial', 'Tag'],
            // Every cell through text(): it escapes (these are user-entered fields — a serial
            // typed with an ampersand or a stray tag would otherwise reach the message as
            // markup) and clips, so one absurd value cannot turn a row into a paragraph.
            $assets->map(fn (Asset $asset) => [
                EmailTable::text($asset->model?->name ?? $asset->asset_code),
                // The category is the Master Data name, which is stored mixed TH/EN.
                EmailTable::text($asset->category?->name ?: '-'),
                EmailTable::text($asset->serial ?: '-'),
                EmailTable::text($asset->tag ?: '-', 24),
            ])->all(),
            [],
            ['38%', '20%', '24%', '18%'],
            // Device and Serial: the two that carry a long unbroken value.
            [0, 2],
        );
    }

    /**
     * Who is holding the asset, written for a person to read.
     *
     * ownerCode() is the custody trail's identifier and stays a code (EMP-14) because the
     * history has to survive a rename. A mail standing on its own in someone's inbox has no
     * such context, and "Returned by: EMP-14" tells the reader nothing — so the mails name
     * the person, falling back to the free-text label a shared or pooled asset carries.
     */
    private function holderLabel(Asset $asset): ?string
    {
        return $asset->owner_employee_id ? $asset->ownerEmployee?->name : $asset->owner;
    }

    /**
     * Queue one templated mail per recipient. Address-less recipients are logged as skipped
     * by EmailNotificationService rather than dropped silently.
     *
     * @param  iterable<User>  $recipients
     * @param  array<string, string>  $vars
     */
    private function emailEach(iterable $recipients, string $templateKey, array $vars, string $path, string $actionLabel): void
    {
        foreach ($recipients as $recipient) {
            $this->email->sendTemplate(
                $templateKey,
                $recipient->email,
                $vars + ['user.first_name' => strtok((string) $recipient->name, ' ') ?: 'there'],
                url($path),
                $actionLabel,
                $recipient->name,
            );
        }
    }

    /**
     * Append a row to the asset's ownership-change history. `kind` says what the move was,
     * so counting hand-overs or returns never has to read the free-text reason.
     */
    private function logTransfer(
        Asset $asset,
        AssetTransferKind $kind,
        ?string $from,
        string $to,
        ?string $reason,
        ?string $performedBy,
    ): void {
        AssetTransfer::create([
            'asset_id' => $asset->id,
            'asset_tag' => $asset->asset_code,
            'asset_model' => $asset->model?->name,
            'kind' => $kind->value,
            'from_owner' => $from,
            'to_owner' => $to,
            'reason' => $reason,
            'performed_by' => $performedBy,
        ]);
    }

    /**
     * Create an asset from validated data. A blank tag is auto-generated by the
     * model; the first owner is also recorded as the initial owner.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Asset
    {
        if (blank($data['asset_code'] ?? null)) {
            unset($data['asset_code']);
        }
        if (blank($data['status'] ?? null)) {
            $data['status'] = AssetStatus::Ready->value;
        }

        $data = $this->resolveOwnerEmployee($data);

        return Asset::create($this->normalizeAcquisition($data));
    }

    /**
     * Update an existing asset, keeping its tag if a blank one is submitted.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Asset $asset, array $data): Asset
    {
        if (blank($data['asset_code'] ?? null)) {
            unset($data['asset_code']);
        }
        $data = $this->resolveOwnerEmployee($data);
        $asset->update($this->normalizeAcquisition($data));

        return $asset->fresh();
    }

    /**
     * Keep owner_employee_id in step with a directly-supplied owner string on
     * register/edit. When the owner text matches an employee code, link the FK and
     * clear the string (an employee-owned asset stores no owner code — it's read from
     * the employee). A non-matching label (shared/common use) is kept in `owner` with
     * no FK; a blank owner clears both. Leaves everything untouched when the payload
     * carries no `owner` key at all (the normal form path, where ownership is assigned
     * only via Transfer).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function resolveOwnerEmployee(array $data): array
    {
        if (array_key_exists('owner', $data)) {
            $employeeId = filled($data['owner'])
                ? Employee::where('code', $data['owner'])->value('id')
                : null;
            $data['owner_employee_id'] = $employeeId;
            // Employee-owned → keep only the FK; the code is derived from the employee.
            if ($employeeId !== null) {
                $data['owner'] = null;
            }
        }

        return $data;
    }

    /**
     * Normalise acquisition fields by source before saving:
     * - Rented: fee, vendor and lease term are NOT stored on the asset — they belong
     *   to the linked contract and are read from it live (single source of truth).
     *   Any such snapshot fields are cleared, along with purchase/warranty (a lease
     *   has none of its own).
     * - Purchased: clear lease/contract fields; a lifetime warranty has no end date.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalizeAcquisition(array $data): array
    {
        if (($data['source'] ?? null) === AssetSource::Rented->value) {
            $data['vendor_id'] = null;
            $data['value'] = 0;
            $data['purchase_date'] = null;
            $data['warranty_end'] = null;
            $data['warranty_lifetime'] = false;

            return $data;
        }

        // Purchased: no contract; a lifetime warranty carries no end date.
        $data['contract_id'] = null;
        if (! empty($data['warranty_lifetime'])) {
            $data['warranty_end'] = null;
        }

        return $data;
    }

    /**
     * Hand an asset to a new owner. Employee mode assigns a real employee and enters
     * "pending acceptance" until they confirm; shared mode assigns a free-text label
     * (ของกลาง) and deploys immediately since there is no person to accept it.
     *
     * @param  array{mode: string, owner_employee_id?: int|null, owner_label?: string|null, location_id: int, reason?: string|null}  $data
     */
    public function transfer(Asset $asset, array $data, ?string $performedBy = null): Asset
    {
        // A pooled asset has no owner — it "leaves" its warehouse, so stamp that
        // warehouse as the custody-trail origin instead of a blank sender.
        $from = $asset->ownerCode() ?: $asset->warehouse?->name;
        // Read before the update overwrites the owner: the mail names a person, the trail a code.
        $fromLabel = $this->holderLabel($asset) ?: $asset->warehouse?->name ?: $from;
        $reason = $data['reason'] ?? null;

        if ($data['mode'] === 'employee') {
            $employee = Employee::findOrFail($data['owner_employee_id']);
            $asset->update([
                // Employee-owned → store only the FK; the code is read from the employee.
                'owner' => null,
                'owner_employee_id' => $employee->id,
                'location_id' => $data['location_id'],
                // Deployed to a person at a location — it has left the pool, so it no
                // longer sits in a warehouse (warehouse ↔ location are mutually exclusive).
                'warehouse_id' => null,
                'status' => AssetStatus::PendingAcceptance,
                'last_reason' => $reason,
            ]);
            $this->logTransfer($asset, AssetTransferKind::Handover, $from, $employee->code, $reason, $performedBy);
            $this->notifyRecipient($asset->fresh('ownerEmployee'), $from, $fromLabel);

            return $asset->fresh();
        }

        // Shared / common use: no person to accept, so it goes straight to the Common
        // (shared-deployed) state — distinct from Deployed so it can be filtered/recalled in bulk.
        $asset->update([
            'owner' => $data['owner_label'],
            'owner_employee_id' => null,
            'location_id' => $data['location_id'],
            // Out of the pool, so no warehouse (see above).
            'warehouse_id' => null,
            'status' => AssetStatus::Common,
            'last_reason' => $reason,
        ]);
        $this->logTransfer($asset, AssetTransferKind::Handover, $from, $data['owner_label'], $reason, $performedBy);

        return $asset->fresh();
    }

    /**
     * Correct where a deployed asset physically sits — the holder moved desk, the asset
     * went with them. Deliberately not a transfer: it writes `location_id` and nothing
     * else (no owner, no status, no warehouse) and sends no bell or mail, because nobody
     * has to accept anything. The move is still recorded on the custody trail as a
     * `Relocate` row so the History tab can show "old place → new place".
     */
    public function relocate(Asset $asset, Location $location, ?string $performedBy = null, ?string $note = null): Asset
    {
        $from = $asset->location?->name;
        $asset->update(['location_id' => $location->id]);
        $this->logTransfer($asset, AssetTransferKind::Relocate, $from, $location->name, $note, $performedBy);

        return $asset->fresh(['location']);
    }

    /**
     * Bell alert to the recipient when an asset is handed over — resolved through the
     * owner_employee_id FK. Only fires if the employee has a login account that can use
     * My Assets (permission gates the bell).
     */
    private function notifyRecipient(Asset $asset, ?string $from, ?string $fromLabel = null): void
    {
        $employee = $asset->ownerEmployee;
        if (! $employee) {
            return;
        }

        $user = User::where('employee_id', $employee->id)->first();
        if ($user && $user->hasPermission('assets.my')) {
            $user->notify(new AssetAssignedNotification($asset, $from));
            // Same person by mail: a hand-over nobody accepts sits in limbo, and the people
            // most likely to miss the bell are the ones who rarely open the portal.
            $this->emailEach([$user], 'asset.assigned', $this->assetVars($asset) + [
                'asset.from' => (string) ($fromLabel ?: $from ?: '-'),
            ], '/my-assets-access', 'Accept the hand-over');
        }
    }

    /**
     * Bell alert to the employee an asset was pulled back from. Same shape as
     * notifyRecipient(): resolved through the employee's login account and gated by
     * assets.my, because the bell opens My Assets — a reader without that page has
     * nowhere to land.
     *
     * A shared (owner-less) asset has no employee to tell, so nothing is sent.
     */
    private function notifyRecalledHolder(?Employee $holder, Asset $asset, string $subtype): void
    {
        if (! $holder) {
            return;
        }

        $user = User::where('employee_id', $holder->id)->first();
        if ($user && $user->hasPermission('assets.my')) {
            $user->notify(new AssetRecalledNotification($asset, $subtype));
            // One template for both subtypes — see asset.recalled in EmailTemplates.
            $this->emailEach([$user], 'asset.recalled', $this->assetVars($asset), '/my-assets-access', 'View my assets');
        }
    }

    /** Recipient confirms receipt: pending acceptance → deployed, stamping the possession date. */
    public function accept(Asset $asset): Asset
    {
        $asset->update([
            'status' => AssetStatus::Deployed,
            'owned_since' => now(),
        ]);

        return $asset->fresh();
    }

    /** Begin returning a deployed asset: deployed → pending return; alert IT to receive it. */
    public function requestReturn(Asset $asset, ?string $reason = null): Asset
    {
        $holder = $asset->ownerCode();
        $holderLabel = $this->holderLabel($asset) ?: $holder;
        $asset->update([
            'status' => AssetStatus::PendingReturn,
            'last_reason' => $reason,
        ]);

        // Bell alert to everyone who can receive assets back into the pool (permission gates the bell).
        $recipients = User::all()->filter(fn (User $u) => $u->hasPermission('assets.receive'));
        if ($recipients->isNotEmpty()) {
            Notification::send($recipients, new AssetReturnRequestedNotification($asset, $holder));
            $this->emailEach($recipients, 'asset.return_requested', $this->assetVars($asset) + [
                'asset.holder' => (string) ($holderLabel ?: '-'),
            ], '/assets', 'Receive it back');
        }

        return $asset->fresh();
    }

    /**
     * Flags everything an employee still holds as pending return — fired when a resignation
     * lands, so IT sees the hand-back queue without having to open each asset by hand.
     *
     * Deliberately ungated: whoever records the resignation holds employees.resign and need
     * not hold any assets permission. Only what the person actually has in hand moves
     * (deployed / pending acceptance); anything already pending return is left alone rather
     * than ringing IT's bell a second time.
     *
     * Returns how many assets were moved.
     */
    public function requestReturnForEmployee(Employee $employee, ?string $reason = null): int
    {
        $assets = Asset::with(['model', 'category'])
            ->where('owner_employee_id', $employee->id)
            ->whereIn('status', [AssetStatus::Deployed->value, AssetStatus::PendingAcceptance->value])
            ->get();

        if ($assets->isEmpty()) {
            return 0;
        }

        foreach ($assets as $asset) {
            $asset->update([
                'status' => AssetStatus::PendingReturn,
                'last_reason' => $reason,
            ]);
        }

        // One bell for the whole departure, not one per device — see AssetOffboardingNotification.
        // Resolved once for the batch as well: asking per asset would reload every user's
        // permissions as many times as the leaver held machines.
        $recipients = User::all()->filter(fn (User $u) => $u->hasPermission('assets.receive'));
        if ($recipients->isNotEmpty()) {
            Notification::send($recipients, new AssetOffboardingNotification($employee, $assets->count()));
            $this->emailEach($recipients, 'asset.offboarding', [
                'employee.name' => (string) $employee->name,
                'employee.code' => (string) $employee->code,
                // Set by resign() before this runs, so the mail can state it. Nullable:
                // a resignation may be recorded without a last day agreed yet.
                'employee.last_working' => $employee->last_day?->format('d-m-Y') ?? '-',
                'asset.count' => (string) $assets->count(),
                'asset.table' => $this->assetTable($assets),
                'reference.id' => (string) $employee->code,
            ], '/assets', 'Open the assets list');
        }

        return $assets->count();
    }

    /**
     * IT receives a returned asset back into the pool: pending return → ready.
     * When a destination warehouse is supplied, the asset is stored there;
     * otherwise it keeps whatever warehouse it already had.
     */
    public function markReceived(Asset $asset, ?string $performedBy = null, ?string $warehouse = null): Asset
    {
        $from = $asset->ownerCode();
        // Back in the pool = no owner (same as a freshly registered asset); its physical
        // whereabouts are the warehouse — which is also stamped as the custody-trail destination.
        $destName = filled($warehouse) ? $warehouse : $asset->warehouse?->name;
        $asset->update([
            'status' => AssetStatus::Ready,
            'owner' => null,
            // Back in the pool → no employee holds it (clears the write-off block).
            'owner_employee_id' => null,
            // No holder in the pool → no possession date.
            'owned_since' => null,
            // Stored in a warehouse again → no longer deployed at a usage location.
            'location_id' => null,
            'warehouse_id' => Warehouse::resolveId($destName),
        ]);
        $this->logTransfer($asset, AssetTransferKind::Return, $from, (string) $destName, 'Returned to pool', $performedBy);

        return $asset->fresh();
    }

    /**
     * Pull an asset back into the pool (→ ready). Clears the holder and stamps the chosen
     * warehouse, recording the reversal in the custody trail.
     *
     * Ordinarily this undoes a hand-over the recipient never accepted — the wrong person was
     * picked. A force recall (see AssetController::recall) also reaches an asset an employee
     * is actually holding, which is why the bell distinguishes the two.
     */
    public function recall(Asset $asset, ?string $performedBy = null, ?string $warehouse = null, ?string $reason = null): Asset
    {
        // The intended (not-yet-accepted) recipient becomes the custody-trail origin.
        $from = $asset->ownerCode();
        // Read before the update clears them: afterwards there is no holder left to tell.
        $holder = $asset->ownerEmployee;
        $wasHeld = $asset->status === AssetStatus::Deployed;
        $destName = filled($warehouse) ? $warehouse : $asset->warehouse?->name;
        $asset->update([
            'status' => AssetStatus::Ready,
            'owner' => null,
            'owner_employee_id' => null,
            'owned_since' => null,
            'location_id' => null,
            'warehouse_id' => Warehouse::resolveId($destName),
            'last_reason' => $reason,
        ]);
        $this->logTransfer($asset, AssetTransferKind::Recall, $from, (string) $destName, $reason ?: 'Recalled - transfer cancelled', $performedBy);
        $this->notifyRecalledHolder($holder, $asset, $wasHeld ? 'taken_back' : 'cancelled');

        return $asset->fresh();
    }

    /** Retire / write off a single asset — blocked while an employee still holds it. */
    public function retire(Asset $asset, ?string $reason = null): Asset
    {
        abort_if($asset->heldByEmployee(), 422, "Return {$asset->asset_code} from the employee before writing it off.");

        $asset->update([
            'status' => AssetStatus::Writeoff,
            'last_reason' => $reason,
        ]);

        return $asset->fresh();
    }

    /** Undo a write-off — restore a retired asset back to the Ready pool. */
    public function cancelWriteoff(Asset $asset): Asset
    {
        $asset->update(['status' => AssetStatus::Ready]);

        return $asset->fresh();
    }

    /**
     * Apply a single status to many assets at once (used by bulk Write-off).
     * Write-off is only allowed once an asset is back in the pool (Ready) — anything
     * still out (deployed / common / pending) must be recalled or returned first.
     * Returns the number of assets updated.
     *
     * @param  list<int>  $ids
     */
    public function bulkSetStatus(array $ids, AssetStatus $status, ?string $reason = null): int
    {
        if ($status === AssetStatus::Writeoff) {
            $notReady = Asset::whereIn('id', $ids)->where('status', '!=', AssetStatus::Ready->value)->pluck('asset_code');
            abort_if(
                $notReady->isNotEmpty(),
                422,
                'Only Ready assets can be written off - recall or return these first: '.$notReady->implode(', ').'.'
            );
        }

        return Asset::whereIn('id', $ids)->update([
            'status' => $status->value,
            'last_reason' => $reason,
        ]);
    }
}
