<?php

// Receive one returned asset into a named warehouse.

namespace App\Http\Requests\Asset;

use Illuminate\Auth\Access\Response;

class ReceiveAssetRequest extends AssetActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canReceive($this->user(), $this->asset());
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return ['warehouse' => $this->warehouseRule()];
    }
}
