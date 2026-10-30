<?php

// Hand several Ready or Common assets to one employee or shared label at once.

namespace App\Http\Requests\Asset;

use Illuminate\Auth\Access\Response;

class BulkTransferAssetRequest extends AssetActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canTransferAny($this->user());
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [...$this->idsRules(), ...$this->handOverRules()];
    }

    protected function passedValidation(): void
    {
        $this->guard()->canBulkTransfer($this->assets())->authorize();
    }
}
