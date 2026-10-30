<?php

// Return several rented assets to their lessor, with an optional note.

namespace App\Http\Requests\Asset;

use Illuminate\Auth\Access\Response;

class ReturnToVendorRequest extends AssetActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canRetire($this->user());
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [...$this->idsRules(), 'reason' => ['nullable', 'string', 'max:500']];
    }
}
