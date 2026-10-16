<?php

// Test helper: the request keys a role needs to open the Requests page and file every type.

namespace Tests\Concerns;

use App\Enums\Request\RequestType;

trait GrantsRequestFiling
{
    /**
     * The module, filing and all 13 per-type keys.
     *
     * @return list<string>
     */
    protected static function requestFiler(): array
    {
        return [
            'requests.module',
            'requests.submit',
            ...array_map(fn (RequestType $type) => "requests.submit_{$type->value}", RequestType::cases()),
        ];
    }
}
