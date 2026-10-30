<?php

// Correct where one or several in-use assets sit; custody does not change.

namespace App\Http\Requests\Asset;

use Illuminate\Auth\Access\Response;

class RelocateAssetsRequest extends AssetActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canEdit($this->user());
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            ...$this->idsRules(),
            'location_id' => ['required', 'integer', 'exists:locations,id'],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }

    protected function passedValidation(): void
    {
        $this->guard()->canRelocate($this->assets())->authorize();
    }
}
