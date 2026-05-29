<?php

namespace App\Http\Resources;

use App\Enums\AssetSource;
use App\Models\AppSetting;
use App\Models\Asset;
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
            'type' => $this->type?->value,
            'brand' => $this->brand,
            'model' => $this->model,
            'serial' => $this->serial,
            'source' => $this->source?->value,
            'status' => $this->status?->value,
            'owner' => $this->owner,
            'initial_owner' => $this->initial_owner,
            'department' => $this->department,
            'location' => $this->location,
            'value' => (float) $this->value,
            'value_display' => $this->valueDisplay(),
            'supplier' => $this->supplier,
            'purchase_date' => $this->purchase_date?->toDateString(),
            'warranty_end' => $this->warranty_end?->toDateString(),
            'contract_id' => $this->contract_id,
            'contract_code' => $this->whenLoaded('contract', fn () => $this->contract?->code),
            'lease_start' => $this->lease_start?->toDateString(),
            'lease_end' => $this->lease_end?->toDateString(),
            'cover_end' => $this->coverEndsOn()?->toDateString(),
            'registered_date' => $this->registered_date?->toDateString(),
            'notes' => $this->notes,
            'last_reason' => $this->last_reason,
            'created_at' => $this->created_at?->toDateString(),
            'updated_at' => $this->updated_at?->toDateString(),
        ];
    }

    /** "฿38,500" for owned assets, "฿8,500/mo" for rented (symbol per Settings currency). */
    private function valueDisplay(): string
    {
        $amount = AppSetting::currencySymbol().number_format((float) $this->value);

        return $this->source === AssetSource::Rented ? $amount.'/mo' : $amount;
    }
}
