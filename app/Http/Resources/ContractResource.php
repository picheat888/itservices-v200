<?php

namespace App\Http\Resources;

use App\Enums\ContractType;
use App\Models\Contract;
use App\Models\ContractAttachment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Contract */
class ContractResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $type = $this->type instanceof ContractType ? $this->type : ContractType::tryFrom((string) $this->type);

        return [
            'id' => $this->id,
            'code' => $this->code,
            'vendor' => $this->vendor,
            'name' => $this->name,
            'title' => $this->title,
            'type' => $type?->value ?? ContractType::Software->value,
            'start' => $this->start_date?->toDateString(),
            'end' => $this->end_date?->toDateString(),
            'value' => (float) $this->value,
            'value_display' => $this->valueDisplay(),
            'billing_cycle' => $this->billing_cycle,
            'auto_renew' => $this->auto_renew,
            'status' => $this->status,
            'days_remaining' => $this->daysRemaining(),
            'in_reminder' => $this->isInReminder(),
            'reminder_days' => $this->reminderThreshold(),
            'notify_150' => $this->notify_150,
            'notify_120' => $this->notify_120,
            'notify_90' => $this->notify_90,
            'notify_60' => $this->notify_60,
            'notify_45' => $this->notify_45,
            'notify_30' => $this->notify_30,
            'notify_7' => $this->notify_7,
            'notes' => $this->notes,
            'attachments' => $this->whenLoaded('attachments', fn () => $this->attachments->map(fn (ContractAttachment $a) => [
                'id' => $a->id,
                'name' => $a->original_name,
                'size' => $a->size,
                'url' => $a->url(),
                'created_at' => $a->created_at?->toDateString(),
            ])->all(), []),
            // Assets module not built yet — leased equipment cannot be linked.
            'linked_assets' => [],
            'cancelled_at' => $this->cancelled_at?->toDateString(),
            'created_at' => $this->created_at?->toDateString(),
            'updated_at' => $this->updated_at?->toDateString(),
        ];
    }

    /** Builds the "฿2,140,000/yr" style display string from raw value + cycle. */
    private function valueDisplay(): string
    {
        $suffix = match ($this->billing_cycle) {
            'monthly' => '/mo',
            'quarterly' => '/qtr',
            default => '/yr',
        };

        return '฿'.number_format((float) $this->value).$suffix;
    }
}
