<?php

// Receive several returned assets into one warehouse.

namespace App\Http\Requests\Asset;

use Illuminate\Auth\Access\Response;

class BulkReceiveAssetRequest extends AssetActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canReceiveAny($this->user());
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [...$this->idsRules(), 'warehouse' => $this->warehouseRule()];
    }

    protected function passedValidation(): void
    {
        $this->guard()->canBulkReceive($this->assets())->authorize();
    }
}
