<?php

// The holder sends back an asset they hold, with an optional reason.

namespace App\Http\Requests\Asset;

use Illuminate\Auth\Access\Response;

class ReturnAssetRequest extends AssetActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canRequestReturn($this->user(), $this->asset());
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['reason' => ['nullable', 'string', 'max:500']];
    }
}
