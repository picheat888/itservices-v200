<?php

// Pull several assets back into one warehouse.

namespace App\Http\Requests\Asset;

use Illuminate\Auth\Access\Response;

class BulkRecallAssetRequest extends AssetActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canRecallAny($this->user());
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [...$this->idsRules(), 'warehouse' => $this->warehouseRule(), 'reason' => ['nullable', 'string', 'max:500']];
    }

    protected function passedValidation(): void
    {
        $this->guard()->canBulkRecall($this->user(), $this->assets())->authorize();
    }
}
