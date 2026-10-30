<?php

// Pull one asset back into a warehouse: an ordinary recall, or a force recall of any out asset.

namespace App\Http\Requests\Asset;

use Illuminate\Auth\Access\Response;

class RecallAssetRequest extends AssetActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canRecall($this->user(), $this->asset());
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return ['warehouse' => $this->warehouseRule(), 'reason' => ['nullable', 'string', 'max:500']];
    }
}
