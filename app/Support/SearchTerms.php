<?php

// Multi-word (AND) search shared by every list and report search box: the text is split into
// words, and each word must appear in at least one of the given fields, in any order.

namespace App\Support;

use Closure;
use Illuminate\Database\Eloquent\Builder;

class SearchTerms
{
    public const MAX_LENGTH = 100;

    public const MAX_WORDS = 6;

    /** Zero-width characters dropped, every kind of space collapsed to one, cut to MAX_LENGTH; a non-string is empty. */
    public static function normalize(mixed $input): string
    {
        $visible = preg_replace('/[\x{200B}-\x{200D}\x{2060}\x{FEFF}]/u', '', is_string($input) ? $input : '');
        $spaced = preg_replace('/[\s\p{Z}]+/u', ' ', (string) $visible);

        return mb_substr(trim((string) $spaced), 0, self::MAX_LENGTH);
    }

    /**
     * The distinct words of the search (case-insensitive), at most MAX_WORDS.
     *
     * @return list<string>
     */
    public static function words(mixed $input): array
    {
        $words = [];
        foreach (explode(' ', self::normalize($input)) as $word) {
            if ($word !== '') {
                $words[mb_strtolower($word)] ??= $word;
            }
        }

        return array_slice(array_values($words), 0, self::MAX_WORDS);
    }

    /** A LIKE pattern for "contains", with ! % _ taken literally (pair it with escape '!'). */
    public static function like(string $text): string
    {
        return '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $text).'%';
    }

    /** OR: the column contains the pattern. */
    public static function orLike(Builder $query, string $column, string $like): Builder
    {
        return $query->orWhereRaw($query->getQuery()->getGrammar()->wrap($column)." like ? escape '!'", [$like]);
    }

    /**
     * AND (any of the fields matches the pattern) — always grouped, so it is safe as the only condition inside whereHas.
     * A field is a column name, or a closure (Builder $query, string $like, string $word) that adds its own OR condition.
     *
     * @param  list<string|Closure>  $fields
     */
    public static function anyLike(Builder $query, array $fields, string $like, string $word = ''): Builder
    {
        return $query->where(function (Builder $any) use ($fields, $like, $word) {
            foreach ($fields as $field) {
                $field instanceof Closure ? $field($any, $like, $word) : self::orLike($any, $field, $like);
            }
        });
    }

    /**
     * A field on a relation: matches when any of its fields matches the word.
     *
     * @param  list<string|Closure>  $fields
     */
    public static function related(string $relation, array $fields): Closure
    {
        return fn (Builder $query, string $like, string $word = '') => $query->orWhereHas(
            $relation,
            fn (Builder $related) => self::anyLike($related, $fields, $like, $word),
        );
    }

    /**
     * The columns written together without a space contain the word, so "สมชายใจดี" finds first name + last name.
     *
     * @param  list<string>  $columns
     */
    public static function joined(array $columns): Closure
    {
        return function (Builder $query, string $like) use ($columns) {
            $grammar = $query->getQuery()->getGrammar();
            $parts = array_map(fn (string $column) => 'COALESCE('.$grammar->wrap($column).", '')", $columns);
            $joined = $query->getModel()->getConnection()->getDriverName() === 'sqlite'
                ? implode(' || ', $parts)
                : 'CONCAT('.implode(', ', $parts).')';

            return $query->orWhereRaw("{$joined} like ? escape '!'", [$like]);
        };
    }

    /**
     * A person's name fields: first and last name in English and Thai, each alone and written together.
     *
     * @return list<string|Closure>
     */
    public static function personName(string $prefix = ''): array
    {
        [$first, $last, $firstTh, $lastTh] = array_map(
            fn (string $column) => $prefix.$column,
            ['first_name', 'last_name', 'first_name_th', 'last_name_th'],
        );

        return [$first, $last, $firstTh, $lastTh, self::joined([$first, $last]), self::joined([$firstTh, $lastTh])];
    }

    /**
     * Every word must match one of the fields (see anyLike).
     *
     * @param  list<string|Closure>  $fields
     */
    public static function apply(Builder $query, mixed $input, array $fields): Builder
    {
        foreach (self::words($input) as $word) {
            self::anyLike($query, $fields, self::like($word), $word);
        }

        return $query;
    }
}
