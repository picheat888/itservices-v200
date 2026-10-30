<?php

// Write off several assets with a reason from Settings and an optional note.

namespace App\Http\Requests\Asset;

use Illuminate\Auth\Access\Response;

class BulkWriteoffAssetRequest extends AssetActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canRetire($this->user());
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            ...$this->idsRules(),
            'op' => ['required', 'in:writeoff'],
            'writeoff_reason_id' => ['required', 'integer', 'exists:writeoff_reasons,id'],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }
}
