<?php

namespace App\Services\Report\Tabular;

use Carbon\CarbonInterface;
use Closure;
use Illuminate\Database\Eloquent\Model;

/**
 * One column of a tabular report. `value()` feeds the page (typed, so the page can format
 * it per language), `exportValue()` feeds Excel/PDF (flat, Thai). Both read the row through
 * the same resolver, so the screen and the file can never disagree.
 */
final class ReportColumn
{
    /**
     * @param  Closure(Model): mixed  $resolve
     * @param  array<string, string>  $labelKeys  enum value → i18n key (page)
     * @param  array<string, string>  $exportLabels  enum value → Thai label (export)
     */
    private function __construct(
        public readonly string $key,
        public readonly string $heading,
        public readonly string $type,
        private readonly Closure $resolve,
        private readonly array $labelKeys = [],
        private readonly array $exportLabels = [],
    ) {}

    public static function text(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'text', $resolve);
    }

    /** Master data stored in two languages; the resolver returns ['name' => …, 'name_th' => …] or null. */
    public static function localized(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'localized', $resolve);
    }

    public static function number(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'number', $resolve);
    }

    public static function money(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'money', $resolve);
    }

    /** The resolver returns a date/datetime (or null); shown as Y-m-d. */
    public static function date(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'date', $resolve);
    }

    /** The resolver returns a date (or null); shown as whole days from today (negative = past). */
    public static function daysLeft(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'days_left', $resolve);
    }

    /**
     * @param  array<string, string>  $labelKeys
     * @param  array<string, string>  $exportLabels
     */
    public static function enum(string $key, string $heading, Closure $resolve, array $labelKeys, array $exportLabels): self
    {
        return new self($key, $heading, 'enum', $resolve, $labelKeys, $exportLabels);
    }

    public function value(Model $row): mixed
    {
        $raw = ($this->resolve)($row);

        return match ($this->type) {
            'number', 'money' => $raw === null ? null : (float) $raw,
            'date' => $raw instanceof CarbonInterface ? $raw->format('Y-m-d') : null,
            'days_left' => $raw instanceof CarbonInterface
                ? (int) now()->startOfDay()->diffInDays($raw->copy()->startOfDay(), false)
                : null,
            'enum' => $raw instanceof \BackedEnum ? $raw->value : $raw,
            default => $raw,
        };
    }

    public function exportValue(Model $row): string|int|float|null
    {
        $value = $this->value($row);

        return match ($this->type) {
            'localized' => is_array($value) ? (($value['name_th'] ?? null) ?: ($value['name'] ?? null)) : null,
            'enum' => $value === null ? null : ($this->exportLabels[$value] ?? (string) $value),
            default => $value,
        };
    }

    /**
     * @return array{key: string, type: string, label_key: string, labels?: array<string, string>}
     */
    public function toArray(): array
    {
        $column = ['key' => $this->key, 'type' => $this->type, 'label_key' => "rep_c_{$this->key}"];
        if ($this->type === 'enum') {
            $column['labels'] = $this->labelKeys;
        }

        return $column;
    }
}
