<?php

// Hand one Ready asset to an employee (pending acceptance) or a shared label.

namespace App\Http\Requests\Asset;

use Illuminate\Auth\Access\Response;

class TransferAssetRequest extends AssetActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canTransfer($this->user(), $this->asset());
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return $this->handOverRules();
    }
}
