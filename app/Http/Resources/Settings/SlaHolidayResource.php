<?php

// API shape of one company holiday for the SLA settings tab.

namespace App\Http\Resources\Settings;

use App\Models\Settings\SlaHoliday;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SlaHoliday */
class SlaHolidayResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'date' => $this->date->format('Y-m-d'),
            'name' => $this->name,
        ];
    }
}
