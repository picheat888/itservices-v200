<?php

// Per-year running numbers kept in document_sequences: one row per name and year, locked while the next number is taken.
// A row is seeded from the highest number already issued the first time its year is used.

namespace App\Support;

use App\Models\Request\ServiceRequest;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use stdClass;

class DocSequence
{
    private const TABLE = 'document_sequences';

    public static function next(string $name, int $year): int
    {
        return DB::transaction(function () use ($name, $year): int {
            // Plain read first: a locking read on a missing row gap-locks and deadlocks the insert
            if (! self::row($name, $year)->exists()) {
                DB::table(self::TABLE)->insertOrIgnore([
                    'name' => $name,
                    'year' => $year,
                    'last' => self::issuedMax($name, $year),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            /** @var stdClass $current */
            $current = self::row($name, $year)->lockForUpdate()->first();
            $next = (int) $current->last + 1;
            self::row($name, $year)->update(['last' => $next, 'updated_at' => now()]);

            return $next;
        });
    }

    private static function row(string $name, int $year): QueryBuilder
    {
        return DB::table(self::TABLE)->where('name', $name)->where('year', $year);
    }

    /** Highest number already issued for this name and year (numeric, so 10000 beats 9999). */
    private static function issuedMax(string $name, int $year): int
    {
        $stem = "{$name}-{$year}-";

        return self::issued($name)
            ->where('reference', 'like', $stem.'%')
            ->pluck('reference')
            ->map(fn (string $reference): int => (int) substr($reference, strlen($stem)))
            ->max() ?? 0;
    }

    /** @return Builder<ServiceRequest> */
    private static function issued(string $name): Builder
    {
        return match ($name) {
            'RQ' => ServiceRequest::query(),
            default => throw new InvalidArgumentException("Unknown document sequence {$name}"),
        };
    }
}
