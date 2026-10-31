<?php

// The master-data delete refusal: 409 {message: in_use, count} while any record still points at the row.

namespace App\Support;

use Illuminate\Http\JsonResponse;

class InUse
{
    /**
     * The 409 to send when the references add up to more than zero, or null when the row may go.
     *
     * @param  list<int>  $counts  one reference count per table that points at the row
     */
    public static function refusal(array $counts): ?JsonResponse
    {
        $count = array_sum($counts);

        return $count > 0 ? response()->json(['message' => 'in_use', 'count' => $count], 409) : null;
    }
}
