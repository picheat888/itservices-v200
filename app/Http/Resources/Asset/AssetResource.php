<?php

namespace App\Http\Resources\Asset;

use App\Enums\Asset\AssetSource;
use App\Http\Resources\Ticket\TicketResource;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\Settings\AppSetting;
use App\Support\SystemTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Asset */
class AssetResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        // Rented assets don't store fee / vendor / lease term — those live on the linked
        // contract and are read from it here (single source of truth). Purchased assets
        // carry their own value and supplier.
        $rented = $this->source === AssetSource::Rented;
        $contract = $rented ? $this->contract : null;
        $vendor = $rented ? $contract?->vendor : $this->vendor;
        $value = $rented ? (float) ($contract?->value ?? 0) : (float) $this->value;

        return [
            'id' => $this->id,
            // asset_code = the generated Asset code (INK-IT-…); tag = the user-given nickname.
            'asset_code' => $this->asset_code,
            'tag' => $this->tag,
            'type' => $this->category?->name,
            // Thai category name for locale-aware display; falls back to `type` when unset.
            'type_th' => $this->category?->name_th,
            'category_id' => $this->category_id,
            // Brand / model names resolved through their master relations (auto-reflect renames);
            // the *_id feed the forms.
            'brand' => $this->brand?->name,
            'brand_id' => $this->brand_id,
            'model' => $this->model?->name,
            'model_id' => $this->model_id,
            'serial' => $this->serial,
            'source' => $this->source?->value,
            'status' => $this->status?->value,
            // Holder identifier: employee code (from the FK) or shared label — never stored.
            'owner' => $this->ownerCode(),
            'owner_employee_id' => $this->owner_employee_id,
            // Display name of the holder: the employee's full name in employee mode,
            // else the free-text shared label, else null (pool).
            'owner_name' => $this->owner_employee_id ? $this->ownerEmployee?->name : $this->owner,
            // Job title + department of the holding employee (read from the employee;
            // null for pool / shared assets that have no employee).
            'owner_position' => $this->ownerEmployee?->position?->title,
            'department' => $this->ownerEmployee?->department?->name,
            'location' => $this->location?->name,
            'location_id' => $this->location_id,
            'warehouse' => $this->warehouse?->name,
            'warehouse_id' => $this->warehouse_id,
            'value' => $value,
            'value_display' => $this->valueDisplay($value),
            'supplier' => $vendor?->name,
            'vendor_id' => $rented ? $contract?->vendor_id : $this->vendor_id,
            'purchase_date' => $this->purchase_date?->toDateString(),
            'warranty_end' => $this->warranty_end?->toDateString(),
            'warranty_lifetime' => (bool) $this->warranty_lifetime,
            'contract_id' => $this->contract_id,
            'contract_code' => $this->whenLoaded('contract', fn () => $this->contract?->code),
            // Lease term comes from the contract for rented assets; null for purchased.
            'lease_start' => $rented ? $contract?->start_date?->toDateString() : null,
            'lease_end' => $rented ? $contract?->end_date?->toDateString() : null,
            'cover_end' => $this->coverEndsOn()?->toDateString(),
            // "Registered" = when the asset was created in this system (created_at);
            // the acquisition/purchase origin lives in purchase_date.
            'registered_date' => SystemTime::date($this->created_at),
            'owned_since' => $this->owned_since?->toDateString(),
            'notes' => $this->notes,
            'last_reason' => $this->last_reason,
            'created_at' => SystemTime::date($this->created_at),
            'updated_at' => SystemTime::date($this->updated_at),

            // Included only on the single-asset endpoint (whenLoaded) so the list stays lean.
            'transfers' => $this->whenLoaded('transfers', function () {
                $names = AssetTransfer::employeeNamesFor($this->transfers);

                return $this->transfers->map(fn ($tr) => [
                    'id' => $tr->id,
                    // Down to the minute: a recall and the hand-over it undid can land seconds
                    // apart, and a date alone leaves the two rows looking identical.
                    'date' => SystemTime::dateTime($tr->created_at),
                    // A `relocate` row carries location names in from/to, not people — the
                    // History tab reads this to label the row and pick the right icon.
                    'kind' => $tr->kind?->value,
                    'from_owner' => $tr->from_owner,
                    'to_owner' => $tr->to_owner,
                    // Set only when that end was an employee; a warehouse or shared label has none.
                    'from_name' => $names[$tr->from_owner] ?? null,
                    'to_name' => $names[$tr->to_owner] ?? null,
                    'reason' => $tr->reason,
                    'performed_by' => $tr->performed_by,
                ]);
            }),
            'tickets' => $this->whenLoaded('tickets', fn () => $this->tickets->map(fn ($tk) => [
                'id' => $tk->id,
                'ticket_no' => $tk->ticket_no,
                'subject' => $tk->subject,
                'category' => $tk->category?->value,
                // Same rule as the Tickets module: priority is for whoever can take the case.
                'priority' => TicketResource::showsDeskInternals($request) ? $tk->priority?->value : null,
                'status' => $tk->status?->value,
                'assignee_name' => $tk->assignee?->name,
                'created_at' => SystemTime::date($tk->created_at),
                'resolved_at' => SystemTime::date($tk->resolved_at),
            ])),
        ];
    }

    /** "฿38,500" for owned assets, "฿8,500/mo" for rented (symbol per Settings currency). */
    private function valueDisplay(float $value): string
    {
        $amount = AppSetting::currencySymbol().number_format($value);

        return $this->source === AssetSource::Rented ? $amount.'/mo' : $amount;
    }
}
