<?php

namespace App\Support;

use Illuminate\Validation\ValidationException;

/**
 * A refusal the SPA words for itself.
 *
 * The response carries a short reason in `message` ('not_enough_stock'), the figures that
 * reason quotes beside it ('available' => 3), and — when the refusal belongs to one field —
 * the same reason under `errors`, so it still reads as that field's validation error. The
 * sentence the user sees lives in the SPA's lang files (`<module>_refusal_<reason>`), in both
 * languages, rather than being written here in one of them.
 *
 * Same shape the app already answers with elsewhere (`has_history` with its count), for the
 * places that refuse from deep inside a service where no response can be returned. It is
 * still a ValidationException — only its response is its own — so code and tests that treat
 * these refusals as a failed validation keep doing so.
 */
final class Refusal
{
    /**
     * @param  array<string, scalar|null>  $details  values the sentence quotes, keyed by its placeholder
     *
     * @throws ValidationException
     */
    public static function fail(string $reason, array $details = [], ?string $field = null, int $status = 422): never
    {
        $exception = ValidationException::withMessages([$field ?? 'reason' => $reason]);
        $exception->response = response()->json(array_merge(
            ['message' => $reason],
            $field !== null ? ['errors' => [$field => [$reason]]] : [],
            $details,
        ), $status);

        throw $exception;
    }
}
