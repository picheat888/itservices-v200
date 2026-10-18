<?php

// The 403 grant_ceiling refusal: a non-super caller tried to grant or hand out permissions they do not hold.

namespace App\Support;

final class GrantCeiling
{
    public const GRANT_MESSAGE = 'You can only grant permissions you hold yourself.';

    public const HAND_OUT_MESSAGE = 'You can only hand out a role whose permissions you hold yourself.';

    public static function refuse(string $message = self::GRANT_MESSAGE): never
    {
        abort(response()->json([
            'message' => $message,
            'code' => 'grant_ceiling',
        ], 403));
    }
}
