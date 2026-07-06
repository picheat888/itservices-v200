<?php

namespace App\Http\Resources\Asset;

use App\Enums\Asset\AssetSource;
use App\Models\Asset\Asset;
use App\Models\Settings\AppSetting;
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
        return [
            'id' => $this->id,
            'tag' => $this->tag,
            'nickname' => $this->nickname,
            'type' => $this->type,
            // Brand / model names resolved through their master relations (auto-reflect renames);
            // the *_id feed the forms.
            'brand' => $this->brand?->name,
            'brand_id' => $this->brand_id,
            'model' => $this->model?->name,
            'model_id' => $this->model_id,
            'serial' => $this->serial,
            'source' => $this->source?->value,
            'status' => $this->status?->value,
            'owner' => $this->owner,
            'initial_owner' => $this->initial_owner,
            'department' => $this->department,
            'location' => $this->location?->name,
            'location_id' => $this->location_id,
            'warehouse' => $this->warehouse,
            'value' => (float) $this->value,
            'value_display' => $this->valueDisplay(),
            'supplier' => $this->supplier,
            'purchase_date' => $this->purchase_date?->toDateString(),
            'warranty_end' => $this->warranty_end?->toDateString(),
            'warranty_lifetime' => (bool) $this->warranty_lifetime,
            'contract_id' => $this->contract_id,
            'contract_code' => $this->whenLoaded('contract', fn () => $this->contract?->code),
            'lease_start' => $this->lease_start?->toDateString(),
            'lease_end' => $this->lease_end?->toDateString(),
            'cover_end' => $this->coverEndsOn()?->toDateString(),
            'registered_date' => $this->registered_date?->toDateString(),
            'owned_since' => $this->owned_since?->toDateString(),
            'notes' => $this->notes,
            'last_reason' => $this->last_reason,
            'created_at' => $this->created_at?->toDateString(),
            'updated_at' => $this->updated_at?->toDateString(),

            // Included only on the single-asset endpoint (whenLoaded) so the list stays lean.
            'transfers' => $this->whenLoaded('transfers', fn () => $this->transfers->map(fn ($tr) => [
                'id' => $tr->id,
                'date' => $tr->created_at?->toDateString(),
                'from_owner' => $tr->from_owner,
                'to_owner' => $tr->to_owner,
                'reason' => $tr->reason,
                'performed_by' => $tr->performed_by,
            ])),
            'tickets' => $this->whenLoaded('tickets', fn () => $this->tickets->map(fn ($tk) => [
                'id' => $tk->id,
                'ticket_no' => $tk->ticket_no,
                'subject' => $tk->subject,
                'subject_th' => $tk->subject_th,
                'category' => $tk->category?->value,
                'priority' => $tk->priority?->value,
                'status' => $tk->status?->value,
                'assignee_name' => $tk->assignee?->name,
                'created_at' => $tk->created_at?->toDateString(),
                'resolved_at' => $tk->resolved_at?->toDateString(),
            ])),
        ];
    }

    /** "฿38,500" for owned assets, "฿8,500/mo" for rented (symbol per Settings currency). */
    private function valueDisplay(): string
    {
        $amount = AppSetting::currencySymbol().number_format((float) $this->value);

        return $this->source === AssetSource::Rented ? $amount.'/mo' : $amount;
    }
}
